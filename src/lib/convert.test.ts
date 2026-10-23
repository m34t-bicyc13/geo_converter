import { describe, expect, it } from 'vitest'
import { DomainType, type Domain } from './geosite.ts'
import { collapse, convertToUpstream, defaultConvertOptions, normalizeDomain } from './convert.ts'

const d = (type: DomainType, value: string): Domain => ({ type, value, attrs: [] })

const opts = { ...defaultConvertOptions, upstreams: 'tls://1.1.1.1', header: false }

describe('normalizeDomain', () => {
  it('приводит к нижнему регистру и punycode', () => {
    expect(normalizeDomain('Example.COM.')).toBe('example.com')
    expect(normalizeDomain('пример.рф')).toBe('xn--e1afmkfd.xn--p1ai')
    expect(normalizeDomain('bad domain')).toBeNull()
    expect(normalizeDomain('')).toBeNull()
  })
})

describe('collapse', () => {
  it('убирает поддомены, покрытые родителем', () => {
    const res = collapse(new Set(['example.com', 'a.example.com', 'b.a.example.com', 'other.org']))
    expect(res.kept.sort()).toEqual(['example.com', 'other.org'])
    expect(res.removed).toBe(2)
  })
})

describe('convertToUpstream', () => {
  const sources = [
    {
      label: 'test/one',
      domains: [
        d(DomainType.RootDomain, 'google.com'),
        d(DomainType.Full, 'www.google.com'),
        d(DomainType.Full, 'exact.org'),
        d(DomainType.Plain, 'keyword'),
        d(DomainType.Regex, '^re$'),
      ],
    },
    { label: 'test/two', domains: [d(DomainType.RootDomain, 'GOOGLE.com'), d(DomainType.RootDomain, 'yandex.ru')] },
  ]

  it('объединяет, схлопывает и группирует', () => {
    const res = convertToUpstream(sources, { ...opts, groupSize: 2 })
    expect(res.errors).toEqual([])
    expect(res.text).toBe('[/exact.org/google.com/]tls://1.1.1.1\n[/yandex.ru/]tls://1.1.1.1\n')
    expect(res.stats).toMatchObject({ totalRules: 7, rootDomains: 3, fullIncluded: 2, duplicates: 1, collapsed: 1, output: 3 })
    expect(res.skipped.map((s) => s.reason)).toEqual(['keyword', 'regexp'])
  })

  it('по строке на домен, без схлопывания, без full', () => {
    const res = convertToUpstream(sources, {
      ...opts,
      layout: 'perLine',
      collapseSubdomains: false,
      fullMode: 'skip',
      upstreams: 'tls://a  https://b',
    })
    expect(res.text).toBe('[/google.com/]tls://a https://b\n[/yandex.ru/]tls://a https://b\n')
    expect(res.skipped.filter((s) => s.reason === 'full')).toHaveLength(2)
  })

  it('добавляет заголовок и основные upstream', () => {
    const res = convertToUpstream([sources[1]], { ...opts, header: true, defaultUpstreams: 'https://dns.google/dns-query\n\n' })
    const lines = res.text.trim().split('\n')
    expect(lines[0]).toMatch(/^# geo-converter \d{4}-\d{2}-\d{2}$/)
    expect(lines[1]).toBe('# test/two')
    expect(lines[2]).toBe('https://dns.google/dns-query')
    expect(lines[3]).toBe('[/google.com/yandex.ru/]tls://1.1.1.1')
  })

  it('требует upstream', () => {
    const res = convertToUpstream(sources, { ...opts, upstreams: '  ' })
    expect(res.errors).toHaveLength(1)
    expect(res.text).toBe('')
  })
})
