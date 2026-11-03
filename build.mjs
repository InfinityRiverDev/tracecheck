import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

await mkdir(new URL('./dist/', import.meta.url), { recursive: true })
await cp(new URL('./web/', import.meta.url), new URL('./dist/', import.meta.url), { recursive: true })
const content = await readFile(new URL('./content.ts', import.meta.url), 'utf8')
await writeFile(new URL('./dist/content.js', import.meta.url), stripTypeScriptTypes(content))
