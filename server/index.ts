import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROXY_PATH, handleProxy } from './proxy.ts'

// Продакшен-режим: отдаёт собранный фронтенд из dist/ и прокси для скачивания.
// В режиме разработки то же самое делает vite (см. vite.config.ts).

const HOST = process.env.HOST ?? '127.0.0.1'
const PORT = Number(process.env.PORT ?? 5180)
const DIST = resolve(fileURLToPath(new URL('../dist', import.meta.url)))

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
}

const server = createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0]

  if (path === PROXY_PATH) {
    await handleProxy(req, res)
    return
  }

  const file = await resolveStatic(path)
  if (!file) {
    res.statusCode = 404
    res.end('Not found')
    return
  }
  res.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream')
  createReadStream(file).pipe(res)
})

async function resolveStatic(urlPath: string): Promise<string | null> {
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '')
  const candidate = join(DIST, rel)
  if (!candidate.startsWith(DIST)) return null
  for (const file of [candidate, join(candidate, 'index.html')]) {
    try {
      if ((await stat(file)).isFile()) return file
    } catch {
      // нет такого файла — пробуем следующий вариант
    }
  }
  return null
}

server.listen(PORT, HOST, () => {
  console.log(`geo-converter: http://${HOST}:${PORT}`)
})
