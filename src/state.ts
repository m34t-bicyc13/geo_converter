import { computed, markRaw, reactive, ref, shallowRef, watch } from 'vue'
import { GeoSiteFile, type CategoryIndex } from './lib/geosite.ts'
import { defaultConvertOptions, type ConvertOptions } from './lib/convert.ts'

export interface LoadedSource {
  id: string
  label: string
  /** URL или имя локального файла. */
  origin: string
  size: number
  loadedAt: Date
  file: GeoSiteFile
}

export interface Selection {
  sourceId: string
  category: string
}

// shallowRef: источники меняются только целиком, а внутри них — огромные неизменяемые данные
export const sources = shallowRef<LoadedSource[]>([])
export const activeSourceId = ref<string | null>(null)
export const previewCategory = ref<string | null>(null)
export const selection = ref<Selection[]>([])
export const loading = reactive({ active: false, label: '', received: 0, total: 0, error: '' })

export const activeSource = computed(() => sources.value.find((s) => s.id === activeSourceId.value) ?? null)

export function sourceById(id: string): LoadedSource | undefined {
  return sources.value.find((s) => s.id === id)
}

export function selectionKey(s: Selection): string {
  return `${s.sourceId}:${s.category}`
}

export function isSelected(sourceId: string, category: string): boolean {
  return selection.value.some((s) => s.sourceId === sourceId && s.category === category)
}

export function toggleSelection(sourceId: string, category: string): void {
  const idx = selection.value.findIndex((s) => s.sourceId === sourceId && s.category === category)
  if (idx === -1) selection.value.push({ sourceId, category })
  else selection.value.splice(idx, 1)
}

export function categoryOf(sel: Selection): CategoryIndex | undefined {
  return sourceById(sel.sourceId)?.file.find(sel.category)
}

// --- загрузка источников ---

function addSource(id: string, label: string, origin: string, buf: Uint8Array): void {
  // markRaw: в файле миллионы объектов, делать их реактивными незачем и дорого
  const file = markRaw(new GeoSiteFile(buf))
  const source: LoadedSource = { id, label, origin, size: buf.length, loadedAt: new Date(), file }
  if (!sources.value.some((s) => s.id === id)) {
    sources.value = [...sources.value, source]
  } else {
    sources.value = sources.value.map((s) => (s.id === id ? source : s))
    // категории, исчезнувшие из обновлённого файла, убираем из выбора
    selection.value = selection.value.filter((s) => s.sourceId !== id || file.find(s.category))
  }
  activeSourceId.value = id
  previewCategory.value = null
}

export function removeSource(id: string): void {
  sources.value = sources.value.filter((s) => s.id !== id)
  selection.value = selection.value.filter((s) => s.sourceId !== id)
  if (activeSourceId.value === id) {
    activeSourceId.value = sources.value[0]?.id ?? null
    previewCategory.value = null
  }
}

async function withLoading(label: string, job: () => Promise<void>): Promise<void> {
  Object.assign(loading, { active: true, label, received: 0, total: 0, error: '' })
  try {
    await job()
  } catch (err) {
    loading.error = `${label}: ${(err as Error).message}`
  } finally {
    loading.active = false
  }
}

export function loadFromUrl(id: string, label: string, url: string): Promise<void> {
  return withLoading(label, async () => {
    const res = await fetch(`/api/fetch?url=${encodeURIComponent(url)}`)
    if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`)
    loading.total = Number(res.headers.get('content-length') ?? 0)
    const buf = await readWithProgress(res)
    addSource(id, label, url, buf)
  })
}

export function loadFromFile(file: File): Promise<void> {
  return withLoading(file.name, async () => {
    loading.total = file.size
    const buf = new Uint8Array(await file.arrayBuffer())
    loading.received = buf.length
    addSource(`file:${file.name}`, file.name, file.name, buf)
  })
}

async function readWithProgress(res: Response): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(await res.arrayBuffer())
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loading.received += value.length
  }
  const out = new Uint8Array(loading.received)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

// --- настройки, которые переживают перезагрузку страницы ---

function persisted<T>(key: string, initial: T) {
  let value = initial
  try {
    const raw = localStorage.getItem(key)
    if (raw) value = { ...initial, ...JSON.parse(raw) }
  } catch {
    // localStorage недоступен — работаем без сохранения
  }
  const state = reactive(value as object) as T
  watch(
    () => state,
    (v) => {
      try {
        localStorage.setItem(key, JSON.stringify(v))
      } catch {
        // игнорируем
      }
    },
    { deep: true },
  )
  return state
}

export const convertOptions = persisted<ConvertOptions>('geo-converter:options', { ...defaultConvertOptions })

export const customUrls = persisted<{ list: string[] }>('geo-converter:custom-urls', { list: [] })

export function rememberUrl(url: string): void {
  customUrls.list = [url, ...customUrls.list.filter((u) => u !== url)].slice(0, 10)
}
