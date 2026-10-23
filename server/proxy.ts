import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'

/** Префикс пути, на котором висит прокси. */
export const PROXY_PATH = '/api/fetch'

/** Верхняя граница размера скачиваемого файла (geosite.dat обычно 2–15 МБ). */
const MAX_BYTES = 200 * 1024 * 1024

/**
 * Скачивает файл по `?url=` и отдаёт его браузеру.
 * Нужен только для обхода CORS: GitHub Releases и многие хосты не отдают
 * Access-Control-Allow-Origin, поэтому браузер не может скачать geosite.dat сам.
 */
export async function handleProxy(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const reqUrl = new URL(req.url ?? '/', 'http://localhost')
  const target = reqUrl.searchParams.get('url')

  if (req.method !== 'GET') return sendError(res, 405, 'Только GET')
  if (!target) return sendError(res, 400, 'Не указан параметр url')

  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    return sendError(res, 400, 'Некорректный URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return sendError(res, 400, 'Поддерживаются только http и https')
  }

  let upstream: Response
  try {
    upstream = await fetch(parsed, {
      redirect: 'follow',
      headers: { 'user-agent': 'geo-converter' },
    })
  } catch (err) {
    return sendError(res, 502, `Не удалось скачать: ${(err as Error).message}`)
  }

  if (!upstream.ok || !upstream.body) {
    return sendError(res, 502, `Источник ответил ${upstream.status} ${upstream.statusText}`)
  }

  const length = Number(upstream.headers.get('content-length') ?? 0)
  if (length > MAX_BYTES) return sendError(res, 413, 'Файл слишком большой')

  res.statusCode = 200
  res.setHeader('content-type', 'application/octet-stream')
  res.setHeader('cache-control', 'no-store')
  if (length) res.setHeader('content-length', String(length))
  res.setHeader('x-final-url', upstream.url)

  let received = 0
  const body = Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream)
  body.on('data', (chunk: Buffer) => {
    received += chunk.length
    if (received > MAX_BYTES) body.destroy(new Error('Файл слишком большой'))
  })
  body.on('error', () => res.destroy())
  body.pipe(res)
}

function sendError(res: ServerResponse, status: number, message: string): void {
  res.statusCode = status
  res.setHeader('content-type', 'text/plain; charset=utf-8')
  res.end(message)
}
