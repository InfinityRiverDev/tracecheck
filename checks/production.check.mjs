import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { createTraceCheckServer } from '../server.mjs'

// Real HTTP and real build files, isolated from MongoDB and production data.
const server = createTraceCheckServer({ store: null, secureCookies: true })
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const origin = `http://127.0.0.1:${server.address().port}`
const get = path => fetch(new URL(path, origin), { signal: AbortSignal.timeout(5000) })
try {
  const response = await get('/')
  assert.equal(response.status, 200)
  const html = await response.text()
  assert.equal(html, await readFile(new URL('../client/dist/index.html', import.meta.url), 'utf8'))
  assert.match(html, /id="root"/)
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/)
  assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains')
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(response.headers.get('x-frame-options'), 'DENY')
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  assert.equal(response.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()')
  assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin')
  assert.equal(response.headers.get('cache-control'), 'no-cache')
  const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)].map(match => match[1])
  const styles = [...html.matchAll(/href="([^"]+\.css)"/g)].map(match => match[1])
  assert.ok(scripts.length > 0 && styles.length > 0, 'React build needs scripts and styles')
  for (const path of [...scripts, ...styles]) {
    const asset = await get(path)
    assert.equal(asset.status, 200, path)
    assert.match(asset.headers.get('content-type'), path.endsWith('.js') ? /javascript/ : /text\/css/)
    assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable')
    assert.ok((await asset.arrayBuffer()).byteLength > 0, path)
  }
  const license = await get('/FONT-LICENSES.txt')
  assert.equal(license.status, 200)
  assert.match(await license.text(), /SIL OPEN FONT LICENSE/)
  const health = await get('/api/health')
  assert.equal(health.status, 503)
  assert.deepEqual(await health.json(), { ok: false, database: 'not_configured' })
  console.log('Production HTTP: React index, JS/CSS assets, font notices and API isolation passed.')
} finally {
  server.closeAllConnections()
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
}
