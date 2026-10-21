// Content checks of uploaded estimate documents (TSK-0054; HH-EST-11, HH-SEC-03, FACT-UPLOAD-LIMITS, OWN-DEC-102). Like
// the request-photo checks (photos/content.ts), the type is decided by the bytes, never by the file name or the
// declared type alone, and a file whose declared type differs from its content is refused.
// - Allowed: PDF and Word (.docx), the two formats of OWN-DEC-102. A PDF starts with its %PDF- header and ends with its
//   %%EOF marker (only whitespace may follow); a .docx is a ZIP whose entries are all well formed (local headers,
//   sizes and CRC-32 checked by inflating each one) and whose content types declare a Word document.
// - Refused as active content: PDF JavaScript, launch and submit actions, embedded files, rich media and XFA forms
//   (also when hidden in compressed object streams or written with #xx escapes); Word macros, ActiveX controls,
//   embedded objects and external relationships other than hyperlinks (remote templates, linked objects); markup or
//   script text in the bytes (a polyglot file).
// - Refused as encrypted: an encrypted PDF or an encrypted ZIP entry, whose content cannot be checked.
// - Decompression is bounded (DOCUMENT_CHECK_LIMITS): a file that expands beyond the bounds is malformed, so a
//   compression bomb never reaches memory.
// This is a structural check, not a malware scanner: PROPOSED until a scanning service is chosen (as for photos).
// Amounts are never read from a document (HH-EST-11): nothing here looks at the text of the estimate.
import { constants, crc32, inflateRawSync, inflateSync } from 'node:zlib'

export const PDF_TYPE = 'application/pdf'
export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
/** The estimate document types of OWN-DEC-102: PDF or Word (.docx). */
export const ESTIMATE_DOCUMENT_TYPES = [PDF_TYPE, DOCX_TYPE] as const
export type EstimateDocumentType = (typeof ESTIMATE_DOCUMENT_TYPES)[number]

/** Why a document is refused; the staff catalogs label each code (label family estimateDocumentRejection). */
export const DOCUMENT_PROBLEMS = [
  'unsupported_type',
  'type_mismatch',
  'malformed',
  'trailing_data',
  'encrypted',
  'active_content',
] as const
export type DocumentProblem = (typeof DOCUMENT_PROBLEMS)[number]

/** PROPOSED technical bounds (no owner value): what one document may expand to while it is checked. */
export const DOCUMENT_CHECK_LIMITS = {
  /** Total bytes produced by decompressing a document's streams or entries. */
  inflatedBytes: 256 * 1024 * 1024,
  /** Entries of a .docx archive. */
  zipEntries: 5000,
  /** Largest expansion of one compressed entry or stream (uncompressed / compressed). */
  ratio: 1000,
} as const

const latin1 = (b: Uint8Array) => Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString('latin1')
const normalize = (declared: string) => declared.split(';')[0]?.trim().toLowerCase() ?? ''

/** The document kind the bytes start with: a PDF, a ZIP archive (a .docx candidate), or null. */
export function sniffDocument(b: Uint8Array): 'pdf' | 'zip' | null {
  if (b.length >= 8 && /^%PDF-[12]\.\d/.test(latin1(b.subarray(0, 8)))) return 'pdf'
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return 'zip'
  return null
}

/** Markup or script text that turns a file into something a browser would run (the photos rule). */
const UNSAFE = /<\s*(script|html|svg|iframe|object|embed)\b|<\?php|javascript:/i

/** PDF names that carry actions or content a viewer may run or open (PDF 32000-1 12.6, 7.11, 13). */
const PDF_ACTIVE_NAMES = new Set([
  'JavaScript',
  'JS',
  'Launch',
  'EmbeddedFile',
  'EmbeddedFiles',
  'RichMedia',
  'XFA',
  'SubmitForm',
  'ImportData',
  'GoToE',
  'GoToR',
])
const PDF_NAME = /\/([^\s/[\]<>(){}%]+)/g
const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20])

/** The names written in PDF text, with #xx escapes decoded (/J#61vaScript is /JavaScript). */
function pdfNames(text: string): Set<string> {
  const out = new Set<string>()
  for (const m of text.matchAll(PDF_NAME)) {
    const raw = m[1] as string
    out.add(
      raw.includes('#')
        ? raw.replace(/#([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
        : raw,
    )
  }
  return out
}

class TooLarge extends Error {}

/** Every Flate stream of a PDF, decompressed within the bounds; streams of other filters are skipped. */
function pdfStreams(bytes: Uint8Array, text: string): string[] {
  const out: string[] = []
  let budget: number = DOCUMENT_CHECK_LIMITS.inflatedBytes
  const start = /(?<!end)stream\r?\n/g
  for (let m = start.exec(text); m; m = start.exec(text)) {
    const from = m.index + m[0].length
    const end = text.indexOf('endstream', from)
    if (end < 0) break
    start.lastIndex = end + 'endstream'.length
    const data = bytes.subarray(from, end)
    if (data.length < 2) continue
    let inflated: Buffer
    try {
      inflated = inflateSync(data, {
        finishFlush: constants.Z_SYNC_FLUSH,
        maxOutputLength: Math.max(1, Math.min(budget, data.length * DOCUMENT_CHECK_LIMITS.ratio)),
      })
    } catch (err) {
      if ((err as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') throw new TooLarge()
      continue // Not a Flate stream (an image, another filter): nothing to scan.
    }
    budget -= inflated.length
    if (budget <= 0) throw new TooLarge()
    out.push(inflated.toString('latin1'))
  }
  return out
}

function pdfProblems(bytes: Uint8Array): DocumentProblem[] {
  const text = latin1(bytes)
  const eof = text.lastIndexOf('%%EOF')
  if (eof < 0 || text.lastIndexOf('startxref', eof) < 0) return ['malformed']
  const problems: DocumentProblem[] = []
  if (bytes.subarray(eof + 5).some((x) => !WHITESPACE.has(x))) problems.push('trailing_data')
  let streams: string[]
  try {
    streams = pdfStreams(bytes, text)
  } catch (err) {
    if (err instanceof TooLarge) return ['malformed']
    throw err
  }
  const names = pdfNames(text)
  for (const s of streams) for (const n of pdfNames(s)) names.add(n)
  if (names.has('Encrypt')) problems.push('encrypted')
  if ([...names].some((n) => PDF_ACTIVE_NAMES.has(n)) || UNSAFE.test(text)) problems.push('active_content')
  return problems
}

type ZipEntry = {
  name: string
  flags: number
  method: number
  crc: number
  compressedSize: number
  size: number
  dataStart: number
}

const u16 = (b: Uint8Array, at: number) => (b[at] ?? 0) + ((b[at + 1] ?? 0) << 8)
const u32 = (b: Uint8Array, at: number) =>
  ((b[at] ?? 0) + ((b[at + 1] ?? 0) << 8) + ((b[at + 2] ?? 0) << 16) + (b[at + 3] ?? 0) * 2 ** 24) >>> 0

class Malformed extends Error {
  constructor(readonly problem: DocumentProblem = 'malformed') {
    super(problem)
  }
}

/** The central directory of a ZIP archive, checked against its local headers (no ZIP64, no multi-disk archives). */
function zipEntries(b: Uint8Array): ZipEntry[] {
  // End of central directory: 22 bytes plus a comment of at most 65535 bytes, at the end of the file.
  let eocd = -1
  for (let at = b.length - 22; at >= Math.max(0, b.length - 22 - 0xffff); at--) {
    if (u32(b, at) === 0x06054b50) {
      eocd = at
      break
    }
  }
  if (eocd < 0) throw new Malformed()
  const end = eocd + 22 + u16(b, eocd + 20)
  if (end < b.length) throw new Malformed('trailing_data')
  if (end > b.length) throw new Malformed()
  const count = u16(b, eocd + 10)
  const cdSize = u32(b, eocd + 12)
  const cdOffset = u32(b, eocd + 16)
  if (u16(b, eocd + 4) !== 0 || u16(b, eocd + 6) !== 0 || u16(b, eocd + 8) !== count) throw new Malformed()
  if (count === 0 || count > DOCUMENT_CHECK_LIMITS.zipEntries || cdOffset + cdSize > eocd) throw new Malformed()

  const entries: ZipEntry[] = []
  let at = cdOffset
  for (let i = 0; i < count; i++) {
    if (at + 46 > eocd || u32(b, at) !== 0x02014b50) throw new Malformed()
    const flags = u16(b, at + 8)
    const method = u16(b, at + 10)
    const crc = u32(b, at + 16)
    const compressedSize = u32(b, at + 20)
    const size = u32(b, at + 24)
    const nameLength = u16(b, at + 28)
    const next = at + 46 + nameLength + u16(b, at + 30) + u16(b, at + 32)
    const local = u32(b, at + 42)
    if (next > eocd) throw new Malformed()
    const name = Buffer.from(b.subarray(at + 46, at + 46 + nameLength)).toString(flags & 0x800 ? 'utf8' : 'latin1')
    if (flags & 0x1) throw new Malformed('encrypted')
    if ((method !== 0 && method !== 8) || compressedSize === 0xffffffff || size === 0xffffffff) throw new Malformed()
    if (!name || name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) throw new Malformed()
    if (local + 30 > cdOffset || u32(b, local) !== 0x04034b50) throw new Malformed()
    const dataStart = local + 30 + u16(b, local + 26) + u16(b, local + 28)
    if (dataStart + compressedSize > cdOffset) throw new Malformed()
    entries.push({ name, flags, method, crc, compressedSize, size, dataStart })
    at = next
  }
  // Entries never overlap (overlapping entries are how ZIP bombs multiply their output).
  const ranges = [...entries].sort((x, y) => x.dataStart - y.dataStart)
  for (let i = 1; i < ranges.length; i++) {
    const prev = ranges[i - 1] as ZipEntry
    if ((ranges[i] as ZipEntry).dataStart < prev.dataStart + prev.compressedSize) throw new Malformed()
  }
  return entries
}

/** Every entry's content, decompressed within the bounds and checked against its declared size and CRC-32. */
function zipContents(b: Uint8Array, entries: readonly ZipEntry[]): Map<string, Buffer> {
  const out = new Map<string, Buffer>()
  let budget: number = DOCUMENT_CHECK_LIMITS.inflatedBytes
  for (const e of entries) {
    if (out.has(e.name)) throw new Malformed()
    if (e.size > budget || e.size > Math.max(1, e.compressedSize) * DOCUMENT_CHECK_LIMITS.ratio) throw new Malformed()
    budget -= e.size
    const data = Buffer.from(b.subarray(e.dataStart, e.dataStart + e.compressedSize))
    let content: Buffer
    if (e.method === 0) content = data
    else {
      try {
        content = e.size === 0 ? Buffer.alloc(0) : inflateRawSync(data, { maxOutputLength: e.size })
      } catch {
        throw new Malformed()
      }
    }
    if (content.length !== e.size || crc32(content) !== e.crc) throw new Malformed()
    out.set(e.name, content)
  }
  return out
}

const WORD_MAIN = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'
const WORD_MACRO_MAIN = 'application/vnd.ms-word.document.macroenabled.main+xml'
/** Parts that hold macros, ActiveX controls or embedded objects (ECMA-376 Part 1, 15.2). */
const ACTIVE_PART = /(^|\/)vbaproject\.bin$|(^|\/)vbadata\.xml$|^word\/activex\/|^word\/embeddings\//i
const ACTIVE_CONTENT_TYPE = /vbaproject|macroenabled|activex|oleobject/i
const HYPERLINK = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink'

/** null when the archive is not a Word document; otherwise its problems. */
function docxProblems(b: Uint8Array): DocumentProblem[] | null {
  let contents: Map<string, Buffer>
  try {
    contents = zipContents(b, zipEntries(b))
  } catch (err) {
    if (err instanceof Malformed) return [err.problem]
    throw err
  }
  const types = contents.get('[Content_Types].xml')?.toString('utf8')
  if (!types) return null
  const declared = [...types.matchAll(/ContentType\s*=\s*"([^"]*)"/g)].map((m) => (m[1] as string).toLowerCase())
  const macro = declared.includes(WORD_MACRO_MAIN)
  if (!declared.includes(WORD_MAIN) && !macro) return null
  const problems: DocumentProblem[] = []
  const active =
    macro ||
    declared.some((t) => ACTIVE_CONTENT_TYPE.test(t)) ||
    [...contents.keys()].some((n) => ACTIVE_PART.test(n)) ||
    [...contents].some(([name, data]) => {
      if (!name.endsWith('.rels')) return false
      return [...data.toString('utf8').matchAll(/<Relationship\b[^>]*>/g)].some((m) => {
        const tag = m[0]
        return /TargetMode\s*=\s*"External"/i.test(tag) && !tag.includes(`Type="${HYPERLINK}"`)
      })
    }) ||
    UNSAFE.test(latin1(b))
  if (active) problems.push('active_content')
  return problems
}

/** Every problem with an estimate document, or an empty list when it is an allowed, well-formed file of its type. */
export function documentProblems(bytes: Uint8Array, declared: string): DocumentProblem[] {
  const type = normalize(declared)
  const kind = sniffDocument(bytes)
  if (kind === 'pdf') return type === PDF_TYPE ? pdfProblems(bytes) : ['type_mismatch']
  if (kind === 'zip') {
    const problems = docxProblems(bytes)
    if (problems === null) return ['unsupported_type']
    return type === DOCX_TYPE ? problems : ['type_mismatch']
  }
  return ['unsupported_type']
}
