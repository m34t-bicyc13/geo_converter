import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { PROXY_PATH, handleProxy } from './server/proxy.ts'

/** Подключает тот же прокси, что и продакшен-сервер, к dev-серверу vite. */
function fetchProxy(): Plugin {
  return {
    name: 'geo-converter-fetch-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if ((req.url ?? '').split('?')[0] !== PROXY_PATH) return next()
        handleProxy(req, res).catch(next)
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), fetchProxy()],
  server: { host: '127.0.0.1', port: 5173 },
})
