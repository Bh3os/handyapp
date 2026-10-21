// Synthetic estimate documents for upload tests (TSK-0054): structurally valid PDF and Word (.docx) files built in code,
// plus the unsafe variants the content checks refuse, so no real estimate or document is committed
// (RULE-SYNTHETIC-DATA). pdfText() reads the text back out of an uncompressed PDF made by the customer-PDF renderer.
import { crc32, deflateRawSync, deflateSync } from 'node:zlib'

export const PDF = 'application/pdf'
export const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export type PdfOptions = {
  /** Visible text of the page (a synthetic estimate; amounts in it are never read). */
  text?: string
  /** Extra catalog entries, for example an /OpenAction with JavaScript. */
  catalog?: string
  /** Extra trailer entries, for example /Encrypt. */
  trailer?: string
  /** An object stream (Flate-compressed) holding this text, like PDF 1.5 object streams. */
  objectStream?: string
  /** Bytes after %%EOF. */
  after?: string
  /** Leave out the %%EOF marker. */
  noEof?: boolean
}

/** A one-page PDF with a text content stream. */
export function pdf(options: PdfOptions = {}): Buffer {
  const text = (options.text ?? 'Synthetic estimate document').replace(/[()\\]/g, '')
  const content = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`
  const parts: Buffer[] = []
  const offsets: number[] = []
  let length = 0
  const push = (b: Buffer | string) => {
    const buf = typeof b === 'string' ? Buffer.from(b, 'latin1') : b
    parts.push(buf)
    length += buf.length
  }
  const object = (n: number, body: Buffer | string) => {
    offsets[n] = length
    push(`${n} 0 obj\n`)
    push(body)
    push('\nendobj\n')
  }
  push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
  object(1, `<< /Type /Catalog /Pages 2 0 R ${options.catalog ?? ''}>>`)
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  object(
    3,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
  )
  object(4, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
  object(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  let count = 6
  if (options.objectStream !== undefined) {
    const packed = deflateSync(Buffer.from(options.objectStream, 'latin1'))
    object(
      6,
      Buffer.concat([
        Buffer.from(`<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /Length ${packed.length} >>\nstream\n`),
        packed,
        Buffer.from('\nendstream'),
      ]),
    )
    count = 7
  }
  const xref = length
  push(`xref\n0 ${count}\n0000000000 65535 f \n`)
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`)
  push(`trailer\n<< /Size ${count} /Root 1 0 R ${options.trailer ?? ''}>>\nstartxref\n${xref}\n`)
  if (!options.noEof) push('%%EOF\n')
  if (options.after) push(options.after)
  return Buffer.concat(parts)
}

type ZipEntry = {
  name: string
  data: Buffer | string
  store?: boolean
  flags?: number
  badCrc?: boolean
  size?: number
}

/** A ZIP archive (stored or deflated entries) with a correct central directory. */
export function zip(entries: readonly ZipEntry[], options: { after?: Buffer } = {}): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const raw = typeof e.data === 'string' ? Buffer.from(e.data, 'utf8') : e.data
    const data = e.store ? raw : deflateRawSync(raw)
    const name = Buffer.from(e.name, 'utf8')
    const crc = e.badCrc ? (crc32(raw) ^ 1) >>> 0 : crc32(raw)
    const size = e.size ?? raw.length
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE((e.flags ?? 0) | 0x800, 6)
    local.writeUInt16LE(e.store ? 0 : 8, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(size, 22)
    local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE((e.flags ?? 0) | 0x800, 8)
    central.writeUInt16LE(e.store ? 0 : 8, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(size, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, name, data)
    centrals.push(central, name)
    offset += local.length + name.length + data.length
  }
  const cd = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, eocd, ...(options.after ? [options.after] : [])])
}

const WORD_MAIN = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

export type DocxOptions = {
  text?: string
  /** The main part's content type (a macro-enabled document, for example). */
  mainType?: string
  /** Extra relationships of word/document.xml. */
  relationships?: string
  /** Extra entries (a vbaProject.bin, an embedded object). */
  extra?: ZipEntry[]
  /** Change the first entry: encrypted flag, wrong CRC, a declared size beyond the bounds. */
  first?: Partial<ZipEntry>
  after?: Buffer
}

/** A minimal Word document: content types, package relationships and one paragraph. */
export function docx(options: DocxOptions = {}): Buffer {
  const types =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    `<Override PartName="/word/document.xml" ContentType="${options.mainType ?? WORD_MAIN}"/>` +
    '</Types>'
  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/>` +
    '</Relationships>'
  const document =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r>' +
    `<w:t>${options.text ?? 'Synthetic estimate document'}</w:t></w:r></w:p></w:body></w:document>`
  const docRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    (options.relationships ?? '') +
    '</Relationships>'
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: types, ...(options.first ?? {}) },
    { name: '_rels/.rels', data: rels },
    { name: 'word/document.xml', data: document },
    { name: 'word/_rels/document.xml.rels', data: docRels },
    ...(options.extra ?? []),
  ]
  return zip(entries, options.after ? { after: options.after } : {})
}

export const EXTERNAL_TEMPLATE = `<Relationship Id="rId9" Type="${REL}/attachedTemplate" Target="https://example.test/t.dotm" TargetMode="External"/>`
export const EXTERNAL_HYPERLINK = `<Relationship Id="rId8" Type="${REL}/hyperlink" Target="https://example.test/" TargetMode="External"/>`

/** The text drawn in an uncompressed PDF made by pdfkit: the hex strings of each TJ array, decoded (Windows-1252). */
export function pdfText(bytes: Buffer): string[] {
  const special: Record<number, string> = {
    0x91: '‘',
    0x92: '’',
    0x93: '“',
    0x94: '”',
    0x95: '•',
    0x96: '–',
    0x97: '—',
  }
  const out: string[] = []
  for (const m of bytes.toString('latin1').matchAll(/\[([^\]]*)\]\s*TJ/g)) {
    let line = ''
    for (const h of (m[1] as string).matchAll(/<([0-9a-fA-F]*)>/g)) {
      const hex = h[1] as string
      for (let i = 0; i < hex.length; i += 2) {
        const c = parseInt(hex.slice(i, i + 2), 16)
        line += special[c] ?? String.fromCharCode(c)
      }
    }
    out.push(line)
  }
  return out
}
