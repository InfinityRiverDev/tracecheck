import { useEffect, useRef, useState } from 'react'

type SceneStatus = 'loading' | 'ready' | 'fallback'

export function VoxelTraceScene() {
  const hostRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<SceneStatus>('loading')

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return

    let disposed = false
    let frame = 0
    let visible = true
    let pointerX = 0
    let pointerY = 0
    let scrollShift = 0
    let resizeObserver: ResizeObserver | undefined
    let intersectionObserver: IntersectionObserver | undefined
    let idleHandle: number | undefined
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    const cleanups: Array<() => void> = []

    async function mount(hostElement: HTMLElement, canvasElement: HTMLCanvasElement) {
      try {
        const THREE = await import('three')
        if (disposed) return

        const mobile = matchMedia('(max-width: 640px)').matches
        const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
        const renderer = new THREE.WebGLRenderer({
          canvas: canvasElement,
          alpha: true,
          antialias: !mobile,
          powerPreference: 'high-performance',
        })
        renderer.setClearColor(0x000000, 0)
        renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1 : 1.5))

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 40)
        camera.position.set(0, 0.15, 8.8)

        const root = new THREE.Group()
        root.rotation.set(-0.14, -0.22, -0.04)
        scene.add(root)

        const geometries: import('three').BufferGeometry[] = []
        const materials: import('three').Material[] = []
        const cube = new THREE.BoxGeometry(0.34, 0.34, 0.34)
        geometries.push(cube)

        function voxels(points: Array<[number, number, number]>, color: number, scale = 1) {
          const material = new THREE.MeshStandardMaterial({
            color,
            roughness: 0.55,
            metalness: 0.08,
          })
          materials.push(material)
          const mesh = new THREE.InstancedMesh(cube, material, points.length)
          const matrix = new THREE.Matrix4()
          points.forEach(([x, y, z], index) => {
            matrix.makeScale(scale, scale, scale)
            matrix.setPosition(x, y, z)
            mesh.setMatrixAt(index, matrix)
          })
          mesh.instanceMatrix.needsUpdate = true
          root.add(mesh)
          return mesh
        }

        const framePoints: Array<[number, number, number]> = []
        for (let x = -3; x <= 3; x++) {
          framePoints.push([x * 0.38, -1.52, 0], [x * 0.38, 1.52, 0])
        }
        for (let y = -3; y <= 3; y++) {
          framePoints.push([-1.14, y * 0.38, 0], [1.14, y * 0.38, 0])
        }
        voxels(framePoints, 0x7c83ff)

        const avatar: Array<[number, number, number]> = [
          [-0.19, 0.76, 0.22], [0.19, 0.76, 0.22],
          [-0.19, 0.38, 0.22], [0.19, 0.38, 0.22],
          [-0.57, -0.19, 0.22], [-0.19, -0.19, 0.22], [0.19, -0.19, 0.22], [0.57, -0.19, 0.22],
          [-0.57, -0.57, 0.22], [-0.19, -0.57, 0.22], [0.19, -0.57, 0.22], [0.57, -0.57, 0.22],
          [-0.57, -0.95, 0.22], [0.57, -0.95, 0.22],
        ]
        voxels(avatar, 0x40d7b0, 0.92)

        const evidence: Array<[number, number, number]> = [
          [-2.35, 1.25, -0.35], [-2.02, 1.62, -0.08], [-2.48, 0.84, 0.16],
          [2.3, 1.08, 0.08], [2.62, 0.73, -0.22], [2.05, 1.5, 0.28],
          [-2.45, -1.1, 0.22], [-2.02, -1.48, -0.12],
          [2.24, -1.22, -0.18], [2.62, -0.94, 0.22],
        ]
        const evidenceMesh = voxels(evidence, 0xffb45b, 0.78)

        const linePoints: number[] = []
        for (const [x, y, z] of evidence) linePoints.push(0, 0, -0.08, x, y, z)
        const lineGeometry = new THREE.BufferGeometry()
        lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePoints, 3))
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x7682d9, transparent: true, opacity: 0.36 })
        const lines = new THREE.LineSegments(lineGeometry, lineMaterial)
        root.add(lines)
        geometries.push(lineGeometry)
        materials.push(lineMaterial)

        const haloGeometry = new THREE.TorusGeometry(2.22, 0.022, 4, 64)
        const haloMaterial = new THREE.MeshBasicMaterial({ color: 0x40d7b0, transparent: true, opacity: 0.3 })
        const halo = new THREE.Mesh(haloGeometry, haloMaterial)
        halo.rotation.x = Math.PI / 2.35
        halo.rotation.z = 0.3
        root.add(halo)
        geometries.push(haloGeometry)
        materials.push(haloMaterial)

        scene.add(new THREE.HemisphereLight(0xc9d2ff, 0x10162b, 2.25))
        const key = new THREE.DirectionalLight(0xffffff, 3.2)
        key.position.set(3, 4, 6)
        scene.add(key)
        const accent = new THREE.PointLight(0x40d7b0, 8, 12)
        accent.position.set(-3, -1, 4)
        scene.add(accent)

        function resize() {
          const width = Math.max(hostElement.clientWidth, 1)
          const height = Math.max(hostElement.clientHeight, 1)
          renderer.setSize(width, height, false)
          camera.aspect = width / height
          camera.updateProjectionMatrix()
        }

        function onPointerMove(event: PointerEvent) {
          const bounds = hostElement.getBoundingClientRect()
          pointerX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2
          pointerY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2
        }

        function onPointerLeave() {
          pointerX = 0
          pointerY = 0
        }

        function onScroll() {
          const bounds = hostElement.getBoundingClientRect()
          scrollShift = Math.max(-1, Math.min(1, -bounds.top / Math.max(innerHeight, 1)))
        }

        hostElement.addEventListener('pointermove', onPointerMove, { passive: true })
        hostElement.addEventListener('pointerleave', onPointerLeave)
        addEventListener('scroll', onScroll, { passive: true })
        cleanups.push(
          () => hostElement.removeEventListener('pointermove', onPointerMove),
          () => hostElement.removeEventListener('pointerleave', onPointerLeave),
          () => removeEventListener('scroll', onScroll),
        )

        resizeObserver = new ResizeObserver(resize)
        resizeObserver.observe(hostElement)
        intersectionObserver = new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting
        }, { rootMargin: '80px' })
        intersectionObserver.observe(hostElement)
        resize()
        onScroll()
        setStatus('ready')

        function render(time = 0) {
          if (disposed) return
          frame = requestAnimationFrame(render)
          if (!visible) return
          const seconds = time * 0.001
          if (!reducedMotion) {
            root.rotation.y += ((-0.22 + pointerX * 0.18 + scrollShift * 0.24) - root.rotation.y) * 0.055
            root.rotation.x += ((-0.14 - pointerY * 0.12) - root.rotation.x) * 0.055
            root.rotation.z = -0.04 + scrollShift * 0.08
            root.position.y = Math.sin(seconds * 0.7) * 0.08 - scrollShift * 0.18
            evidenceMesh.rotation.y = Math.sin(seconds * 0.45) * 0.055
            halo.rotation.z = 0.3 + seconds * 0.08
          }
          renderer.render(scene, camera)
        }
        render()

        cleanups.push(() => {
          cancelAnimationFrame(frame)
          resizeObserver?.disconnect()
          intersectionObserver?.disconnect()
          geometries.forEach(geometry => geometry.dispose())
          materials.forEach(material => material.dispose())
          renderer.dispose()
        })
      } catch (error) {
        console.warn('Voxel scene fallback:', error)
        if (!disposed) setStatus('fallback')
      }
    }

    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    const idleWindow = window as unknown as {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
      cancelIdleCallback?: (handle: number) => void
    }
    if (connection?.saveData) {
      setStatus('fallback')
    } else if (idleWindow.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(() => void mount(host, canvas), { timeout: 700 })
    } else {
      timeoutHandle = setTimeout(() => void mount(host, canvas), 80)
    }

    return () => {
      disposed = true
      if (idleHandle !== undefined) idleWindow.cancelIdleCallback?.(idleHandle)
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle)
      cleanups.reverse().forEach(cleanup => cleanup())
    }
  }, [])

  return (
    <aside ref={hostRef} className={`voxel-stage voxel-${status}`} aria-label="Воксельная карта цифровых следов">
      <div className="voxel-poster" aria-hidden="true">
        <span /><span /><span /><span /><span /><span /><span /><span /><span />
      </div>
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="voxel-meta" aria-hidden="true">
        <span>TRACE / LIVE</span>
        <span>8 СИГНАЛОВ</span>
      </div>
      <p className="voxel-caption">Разрозненные детали складываются в цельное досье.</p>
    </aside>
  )
}
