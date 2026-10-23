import { ProtoReader, WireType } from './protobuf.ts'

// Схема (xray-core app/router/routercommon/common.proto):
//   GeoSiteList { repeated GeoSite entry = 1; }
//   GeoSite     { string country_code = 1; repeated Domain domain = 2; string code = 4; }
//   Domain      { Type type = 1; string value = 2; repeated Attribute attribute = 3; }
//   Attribute   { string key = 1; oneof { bool bool_value = 2; int64 int_value = 3; } }

export const DomainType = {
  Plain: 0, // keyword:
  Regex: 1, // regexp:
  RootDomain: 2, // domain:
  Full: 3, // full:
} as const
export type DomainType = (typeof DomainType)[keyof typeof DomainType]

export const DOMAIN_TYPE_PREFIX: Record<DomainType, string> = {
  [DomainType.Plain]: 'keyword',
  [DomainType.Regex]: 'regexp',
  [DomainType.RootDomain]: 'domain',
  [DomainType.Full]: 'full',
}

export interface Domain {
  type: DomainType
  value: string
  /** Атрибуты без «@»: `ads`, `cn`, либо `key=value` для числовых. */
  attrs: string[]
}

export interface CategoryIndex {
  /** Имя категории в нижнем регистре, как его пишут в правилах (`geosite:<name>`). */
  name: string
  /** Границы сообщения GeoSite внутри файла. */
  start: number
  end: number
  count: number
}

const utf8 = new TextDecoder()

export class GeoSiteFile {
  readonly buf: Uint8Array
  readonly categories: CategoryIndex[]
  private readonly cache = new Map<string, Domain[]>()

  constructor(buf: Uint8Array) {
    this.buf = buf
    this.categories = indexCategories(buf)
  }

  get totalDomains(): number {
    return this.categories.reduce((sum, c) => sum + c.count, 0)
  }

  find(name: string): CategoryIndex | undefined {
    const lower = name.toLowerCase()
    return this.categories.find((c) => c.name === lower)
  }

  /** Декодирует домены категории (лениво, с кэшем). */
  domains(cat: CategoryIndex): Domain[] {
    let list = this.cache.get(cat.name)
    if (!list) {
      list = decodeDomains(this.buf, cat)
      this.cache.set(cat.name, list)
    }
    return list
  }
}

/**
 * Быстрый проход по файлу: имена категорий, их границы и число доменов.
 * Сами домены не декодируются.
 */
export function indexCategories(buf: Uint8Array): CategoryIndex[] {
  const root = new ProtoReader(buf)
  const result: CategoryIndex[] = []

  while (!root.done) {
    const { field, wire } = root.tag()
    if (field !== 1 || wire !== WireType.LengthDelimited) {
      root.skip(wire)
      continue
    }
    const [start, end] = root.bytesRange()
    const entry = new ProtoReader(buf, start, end)
    let name = ''
    let altName = ''
    let count = 0

    while (!entry.done) {
      const t = entry.tag()
      if (t.field === 1 && t.wire === WireType.LengthDelimited) {
        const [s, e] = entry.bytesRange()
        name = utf8.decode(buf.subarray(s, e))
      } else if (t.field === 4 && t.wire === WireType.LengthDelimited) {
        const [s, e] = entry.bytesRange()
        altName = utf8.decode(buf.subarray(s, e))
      } else if (t.field === 2 && t.wire === WireType.LengthDelimited) {
        const [s, e] = entry.bytesRange()
        if (result.length === 0 && count === 0) assertDomainMessage(buf, s, e)
        count++
      } else {
        entry.skip(t.wire)
      }
    }

    result.push({ name: (name || altName).toLowerCase(), start, end, count })
  }

  if (result.length === 0) throw new Error('В файле не найдено ни одной категории')
  return result
}

/**
 * geoip.dat имеет ту же верхнюю структуру, но вместо Domain в поле 2 лежит CIDR
 * с байтами IP в поле 1. У Domain поле 1 — varint (тип), так что их легко различить.
 */
function assertDomainMessage(buf: Uint8Array, start: number, end: number): void {
  const r = new ProtoReader(buf, start, end)
  while (!r.done) {
    const { field, wire } = r.tag()
    if (field === 1 && wire === WireType.LengthDelimited) {
      throw new Error('Похоже, это geoip.dat, а не geosite.dat')
    }
    r.skip(wire)
  }
}

export function decodeDomains(buf: Uint8Array, cat: CategoryIndex): Domain[] {
  const entry = new ProtoReader(buf, cat.start, cat.end)
  const list: Domain[] = []

  while (!entry.done) {
    const t = entry.tag()
    if (t.field !== 2 || t.wire !== WireType.LengthDelimited) {
      entry.skip(t.wire)
      continue
    }
    const [s, e] = entry.bytesRange()
    list.push(decodeDomain(buf, s, e))
  }
  return list
}

function decodeDomain(buf: Uint8Array, start: number, end: number): Domain {
  const r = new ProtoReader(buf, start, end)
  const domain: Domain = { type: DomainType.Plain, value: '', attrs: [] }

  while (!r.done) {
    const { field, wire } = r.tag()
    if (field === 1 && wire === WireType.Varint) {
      domain.type = r.varint() as DomainType
    } else if (field === 2 && wire === WireType.LengthDelimited) {
      const [s, e] = r.bytesRange()
      domain.value = utf8.decode(buf.subarray(s, e))
    } else if (field === 3 && wire === WireType.LengthDelimited) {
      const [s, e] = r.bytesRange()
      domain.attrs.push(decodeAttribute(buf, s, e))
    } else {
      r.skip(wire)
    }
  }
  return domain
}

function decodeAttribute(buf: Uint8Array, start: number, end: number): string {
  const r = new ProtoReader(buf, start, end)
  let key = ''
  let intValue: number | null = null

  while (!r.done) {
    const { field, wire } = r.tag()
    if (field === 1 && wire === WireType.LengthDelimited) {
      const [s, e] = r.bytesRange()
      key = utf8.decode(buf.subarray(s, e))
    } else if (field === 3 && wire === WireType.Varint) {
      intValue = r.varint()
    } else {
      r.skip(wire)
    }
  }
  return intValue === null ? key : `${key}=${intValue}`
}

/** Запись правила в стиле domain-list-community: `domain:example.com @ads`. */
export function formatRule(d: Domain): string {
  const attrs = d.attrs.map((a) => ` @${a}`).join('')
  return `${DOMAIN_TYPE_PREFIX[d.type] ?? `type${d.type}`}:${d.value}${attrs}`
}
