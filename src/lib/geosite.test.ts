import { describe, expect, it } from 'vitest'
import { DomainType, GeoSiteFile, formatRule } from './geosite.ts'
import { normalizeHost, ruleMatchesHost } from './match.ts'

// --- маленький protobuf-энкодер для сборки тестовых файлов ---

const enc = new TextEncoder()

function varint(n: number): number[] {
  const out: number[] = []
  while (n >= 0x80) {
    out.push((n % 128) | 0x80)
    n = Math.floor(n / 128)
  }
  out.push(n)
  return out
}

function lenField(field: number, payload: number[]): number[] {
  return [...varint(field * 8 + 2), ...varint(payload.length), ...payload]
}

function varintField(field: number, value: number): number[] {
  return [...varint(field * 8), ...varint(value)]
}

function str(field: number, s: string): number[] {
  return lenField(field, [...enc.encode(s)])
}

function domain(type: number, value: string, attrs: string[] = []): number[] {
  return [
    ...(type ? varintField(1, type) : []), // proto3 не пишет значение по умолчанию
    ...str(2, value),
    ...attrs.flatMap((a) => lenField(3, [...str(1, a), ...varintField(2, 1)])),
  ]
}

function geosite(entries: Record<string, number[][]>): Uint8Array {
  const bytes: number[] = []
  for (const [code, domains] of Object.entries(entries)) {
    bytes.push(...lenField(1, [...str(1, code), ...domains.flatMap((d) => lenField(2, d))]))
  }
  return new Uint8Array(bytes)
}

// --- тесты ---

describe('GeoSiteFile', () => {
  const file = new GeoSiteFile(
    geosite({
      GOOGLE: [
        domain(DomainType.RootDomain, 'google.com'),
        domain(DomainType.Full, 'www.google.com'),
        domain(DomainType.Plain, 'googleapis'),
        domain(DomainType.Regex, '^g[0-9]+\\.example\\.org$', ['ads']),
      ],
      'CATEGORY-RU': [domain(DomainType.RootDomain, 'yandex.ru', ['cn'])],
    }),
  )

  it('индексирует категории без декодирования доменов', () => {
    expect(file.categories.map((c) => [c.name, c.count])).toEqual([
      ['google', 4],
      ['category-ru', 1],
    ])
    expect(file.totalDomains).toBe(5)
  })

  it('декодирует домены, типы и атрибуты', () => {
    const list = file.domains(file.find('GOOGLE')!)
    expect(list.map(formatRule)).toEqual([
      'domain:google.com',
      'full:www.google.com',
      'keyword:googleapis',
      'regexp:^g[0-9]+\\.example\\.org$ @ads',
    ])
  })

  it('распознаёт geoip.dat', () => {
    // CIDR { bytes ip = 1; uint32 prefix = 2; }
    const cidr = [...lenField(1, [8, 8, 8, 8]), ...varintField(2, 32)]
    const geoip = new Uint8Array(lenField(1, [...str(1, 'US'), ...lenField(2, cidr)]))
    expect(() => new GeoSiteFile(geoip)).toThrow(/geoip/)
  })

  it('падает на мусоре', () => {
    expect(() => new GeoSiteFile(new Uint8Array([0x0a, 0xff, 0xff, 0x01]))).toThrow()
  })
})

describe('ruleMatchesHost', () => {
  const rule = (type: DomainType, value: string) => ({ type, value, attrs: [] })

  it('повторяет семантику xray', () => {
    expect(ruleMatchesHost(rule(DomainType.RootDomain, 'google.com'), 'mail.google.com')).toBe(true)
    expect(ruleMatchesHost(rule(DomainType.RootDomain, 'google.com'), 'notgoogle.com')).toBe(false)
    expect(ruleMatchesHost(rule(DomainType.Full, 'google.com'), 'mail.google.com')).toBe(false)
    expect(ruleMatchesHost(rule(DomainType.Plain, 'oogle'), 'mail.google.com')).toBe(true)
    expect(ruleMatchesHost(rule(DomainType.Regex, '^mail\\.'), 'mail.google.com')).toBe(true)
  })

  it('нормализует ввод', () => {
    expect(normalizeHost(' https://Mail.Google.com:443/inbox?x=1 ')).toBe('mail.google.com')
    expect(normalizeHost('.example.org.')).toBe('example.org')
  })
})
