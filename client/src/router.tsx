import { useEffect, useState, type ReactNode, type MouseEvent } from 'react'

// Hash-роутинг сохраняет совместимость с маршрутами референса (#/case, #/checkup …)
// и позволяет хостить SPA как статику без перезаписи URL на сервере.
export type RouteName =
  | 'home'
  | 'case'
  | 'dossier'
  | 'edit'
  | 'checkup'
  | 'report'

const known: RouteName[] = ['home', 'case', 'dossier', 'edit', 'checkup', 'report']

export function parseHash(hash: string): RouteName {
  const requested = hash.replace(/^#\/?/, '').split('?')[0] as RouteName
  return known.includes(requested) ? requested : 'home'
}

export function useRoute(): RouteName {
  const [route, setRoute] = useState<RouteName>(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function navigate(route: RouteName) {
  window.location.hash = route === 'home' ? '/' : `/${route}`
}

export function Link({
  to,
  children,
  className,
  onNavigate,
}: {
  to: RouteName
  children: ReactNode
  className?: string
  onNavigate?: () => void
}) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(to)
    onNavigate?.()
  }
  return (
    <a href={`#/${to === 'home' ? '' : to}`} className={className} onClick={handleClick}>
      {children}
    </a>
  )
}
