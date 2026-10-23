import { DomainType, formatRule, type Domain } from './geosite.ts'

export interface ConvertSource {
  /** Подпись для отчёта и комментария, например `loyalsoldier/category-ru`. */
  label: string
  domains: Domain[]
}

export interface ConvertOptions {
  /** Upstream-серверы через пробел или с новой строки: `tls://1.1.1.1 https://dns.google/dns-query`. */
  upstreams: string
  /** `full:` в upstream-синтаксисе не выразить: AGH всегда захватывает и поддомены. */
  fullMode: 'include' | 'skip'
  /** Убирать домены, которые уже покрыты родительским (`a.example.com` при наличии `example.com`). */
  collapseSubdomains: boolean
  /** `grouped` — `[/a/b/c/]upstream` по N доменов в строке, `perLine` — по домену на строку. */
  layout: 'grouped' | 'perLine'
  groupSize: number
  /**
   * Строки, которые ставятся в начало (обычные upstream без доменов).
   * Нужны, если результат подключается через upstream_dns_file — он заменяет весь список.
   */
  defaultUpstreams: string
  /** Комментарий `#` с источниками и датой в начале файла. */
  header: boolean
}

export const defaultConvertOptions: ConvertOptions = {
  upstreams: '',
  fullMode: 'include',
  collapseSubdomains: true,
  layout: 'grouped',
  groupSize: 50,
  defaultUpstreams: '',
  header: true,
}

export type SkipReason = 'keyword' | 'regexp' | 'full' | 'invalid'

export interface SkippedRule {
  source: string
  rule: string
  reason: SkipReason
}

export interface ConvertStats {
  totalRules: number
  rootDomains: number
  fullIncluded: number
  duplicates: number
  collapsed: number
  output: number
}

export interface ConvertResult {
  text: string
  domains: string[]
  stats: ConvertStats
  skipped: SkippedRule[]
  errors: string[]
}

/** Список upstream-адресов из строки: разделители — пробелы и переводы строк. */
export function parseUpstreams(input: string): string[] {
  return input
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Нормализует значение правила в домен для AGH; `null`, если это не домен. */
export function normalizeDomain(raw: string): string | null {
  let value = raw.trim().toLowerCase().replace(/^\.+|\.+$/g, '')
  if (!value) return null
  if (/[^\x00-\x7f]/.test(value)) {
    // Кириллические домены и т.п. переводим в punycode
    try {
      value = new URL(`http://${value}`).hostname
    } catch {
      return null
    }
  }
  if (!/^[a-z0-9_-]+(\.[a-z0-9_-]+)*$/.test(value)) return null
  if (value.split('.').some((label) => label.length > 63)) return null
  return value
}

/** Удаляет домены, у которых в наборе есть родитель. */
export function collapse(domains: Set<string>): { kept: string[]; removed: number } {
  const kept: string[] = []
  let removed = 0
  for (const d of domains) {
    let covered = false
    let idx = d.indexOf('.')
    while (idx !== -1) {
      if (domains.has(d.slice(idx + 1))) {
        covered = true
        break
      }
      idx = d.indexOf('.', idx + 1)
    }
    if (covered) removed++
    else kept.push(d)
  }
  return { kept, removed }
}

export function convertToUpstream(sources: ConvertSource[], opts: ConvertOptions): ConvertResult {
  const errors: string[] = []
  const upstreams = parseUpstreams(opts.upstreams)
  if (upstreams.length === 0) errors.push('Укажите хотя бы один upstream-сервер')
  if (sources.length === 0) errors.push('Не выбрано ни одной категории')

  const stats: ConvertStats = {
    totalRules: 0,
    rootDomains: 0,
    fullIncluded: 0,
    duplicates: 0,
    collapsed: 0,
    output: 0,
  }
  const skipped: SkippedRule[] = []
  const set = new Set<string>()

  for (const src of sources) {
    for (const rule of src.domains) {
      stats.totalRules++
      const skip = (reason: SkipReason) => skipped.push({ source: src.label, rule: formatRule(rule), reason })

      if (rule.type === DomainType.Plain) {
        skip('keyword')
        continue
      }
      if (rule.type === DomainType.Regex) {
        skip('regexp')
        continue
      }
      if (rule.type === DomainType.Full && opts.fullMode === 'skip') {
        skip('full')
        continue
      }
      const domain = normalizeDomain(rule.value)
      if (!domain) {
        skip('invalid')
        continue
      }
      if (rule.type === DomainType.Full) stats.fullIncluded++
      else stats.rootDomains++

      if (set.has(domain)) stats.duplicates++
      else set.add(domain)
    }
  }

  let domains: string[]
  if (opts.collapseSubdomains) {
    const res = collapse(set)
    domains = res.kept
    stats.collapsed = res.removed
  } else {
    domains = [...set]
  }
  domains.sort()
  stats.output = domains.length

  const lines: string[] = []
  if (opts.header) {
    lines.push(`# geo-converter ${new Date().toISOString().slice(0, 10)}`)
    for (const src of sources) lines.push(`# ${src.label}`)
  }
  for (const line of opts.defaultUpstreams.split(/\r?\n/)) {
    if (line.trim()) lines.push(line.trim())
  }

  const target = upstreams.join(' ')
  if (upstreams.length > 0 && domains.length > 0) {
    const size = opts.layout === 'perLine' ? 1 : Math.max(1, Math.floor(opts.groupSize))
    for (let i = 0; i < domains.length; i += size) {
      lines.push(`[/${domains.slice(i, i + size).join('/')}/]${target}`)
    }
  }

  return {
    text: lines.length ? lines.join('\n') + '\n' : '',
    domains,
    stats,
    skipped,
    errors,
  }
}
