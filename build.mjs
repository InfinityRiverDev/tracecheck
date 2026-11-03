import { cp, mkdir, stat } from 'node:fs/promises'

// npm run build builds client/ first. The Node server serves this same artifact.
await stat(new URL('./client/dist/index.html', import.meta.url))
await mkdir(new URL('./dist/', import.meta.url), { recursive: true })
await cp(new URL('./client/dist/', import.meta.url), new URL('./dist/', import.meta.url), { recursive: true })
