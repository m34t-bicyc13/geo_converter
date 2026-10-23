/** Минимальный читатель protobuf: ровно столько, сколько нужно для geosite.dat. */

export const WireType = {
  Varint: 0,
  Fixed64: 1,
  LengthDelimited: 2,
  Fixed32: 5,
} as const

export class ProtoReader {
  readonly buf: Uint8Array
  pos: number
  readonly end: number

  constructor(buf: Uint8Array, start = 0, end = buf.length) {
    this.buf = buf
    this.pos = start
    this.end = end
  }

  get done(): boolean {
    return this.pos >= this.end
  }

  /** Varint как обычное число (точно до 2^53, чего с запасом хватает для длин и enum). */
  varint(): number {
    let result = 0
    let mul = 1
    for (let i = 0; i < 10; i++) {
      if (this.pos >= this.end) throw new Error('Неожиданный конец данных в varint')
      const byte = this.buf[this.pos++]
      result += (byte & 0x7f) * mul
      if (byte < 0x80) return result
      mul *= 128
    }
    throw new Error('Слишком длинный varint')
  }

  /** Читает тег поля: номер и тип. */
  tag(): { field: number; wire: number } {
    const t = this.varint()
    return { field: Math.floor(t / 8), wire: t & 7 }
  }

  /** Границы length-delimited значения; позиция сдвигается за него. */
  bytesRange(): [number, number] {
    const len = this.varint()
    const start = this.pos
    const end = start + len
    if (end > this.end) throw new Error('Длина поля выходит за границы данных')
    this.pos = end
    return [start, end]
  }

  skip(wire: number): void {
    switch (wire) {
      case WireType.Varint:
        this.varint()
        return
      case WireType.Fixed64:
        this.pos += 8
        return
      case WireType.LengthDelimited:
        this.bytesRange()
        return
      case WireType.Fixed32:
        this.pos += 4
        return
      default:
        throw new Error(`Неподдерживаемый wire type ${wire} — это не protobuf-файл?`)
    }
  }
}
