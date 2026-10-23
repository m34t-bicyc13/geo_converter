import { DomainType, type Domain } from './geosite.ts'

const regexCache = new Map<string, RegExp | null>()

function compile(pattern: string): RegExp | null {
  let re = regexCache.get(pattern)
  if (re === undefined) {
    try {
      re = new RegExp(pattern)
    } catch {
      // RE2-синтаксис, который JS не понимает — просто не матчим
      re = null
    }
    regexCache.set(pattern, re)
  }
  return re
}

/** Срабатывает ли правило geosite на хост — та же семантика, что в xray. */
export function ruleMatchesHost(rule: Domain, host: string): boolean {
  const value = rule.value.toLowerCase()
  switch (rule.type) {
    case DomainType.RootDomain:
      return host === value || host.endsWith('.' + value)
    case DomainType.Full:
      return host === value
    case DomainType.Plain:
      return host.includes(value)
    case DomainType.Regex:
      return compile(rule.value)?.test(host) ?? false
    default:
      return false
  }
}

/** Приводит ввод пользователя к хосту: убирает схему, путь, порт и точки по краям. */
export function normalizeHost(input: string): string {
  let s = input.trim().toLowerCase()
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  s = s.split(/[/?#]/)[0]
  s = s.replace(/:\d+$/, '')
  return s.replace(/^\.+|\.+$/g, '')
}
