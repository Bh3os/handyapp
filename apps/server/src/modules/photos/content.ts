// Content checks of uploaded photos (TSK-0031; HH-INT-06, HH-SEC-03, T14). The type is decided by the bytes, never by
// the file name or the declared type alone: JPEG, PNG and WebP are recognised by their signatures and walked far
// enough to find where the image ends. A file whose declared type differs from its content, a file that is not one of
// the allowed images (a PDF, a script, an archive), and a file that carries anything after the end of the image (the
// usual way to hide a second payload in a "polyglot" file) are refused. Markup or script text in the bytes is refused
// too. This is a structural check, not a malware scanner: PROPOSED until a scanning service is chosen.

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type PhotoType = (typeof PHOTO_TYPES)[number]

/** Why a photo is refused; the staff catalogs label each code (label family photoRejection, TSK-0101). */
export const CONTENT_PROBLEMS = [
  'unsupported_type',
  'type_mismatch',
  'malformed',
  'trailing_data',
  'unsafe_content',
] as const
export type ContentProblem = (typeof CONTENT_PROBLEMS)[number]

/** The image type the bytes start with, or null. */
export function sniff(b: Uint8Array): PhotoType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return 'image/png'
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'image/webp'
  return null
}

function ascii(b: Uint8Array, at: number, n: number): string {
  return String.fromCharCode(...b.subarray(at, at + n))
}
const u32be = (b: Uint8Array, at: number) =>
  ((b[at] ?? 0) * 2 ** 24 + ((b[at + 1] ?? 0) << 16) + ((b[at + 2] ?? 0) << 8) + (b[at + 3] ?? 0)) >>> 0
const u32le = (b: Uint8Array, at: number) =>
  ((b[at] ?? 0) + ((b[at + 1] ?? 0) << 8) + ((b[at + 2] ?? 0) << 16) + (b[at + 3] ?? 0) * 2 ** 24) >>> 0

/** Byte length of a PNG up to and including its IEND chunk, or null when the chunk structure is broken. */
function pngEnd(b: Uint8Array): number | null {
  let at = 8
  while (at + 12 <= b.length) {
    const len = u32be(b, at)
    const type = ascii(b, at + 4, 4)
    const next = at + 12 + len
    if (next > b.length || !/^[A-Za-z]{4}$/.test(type)) return null
    if (type === 'IEND') return next
    at = next
  }
  return null
}

/** Byte length of a JPEG up to and including its EOI marker, or null when the segment structure is broken. */
function jpegEnd(b: Uint8Array): number | null {
  let at = 2
  while (at + 2 <= b.length) {
    if (b[at] !== 0xff) return null
    const marker = b[at + 1] ?? 0
    if (marker === 0xff) {
      at++
      continue
    }
    if (marker === 0xd9) return at + 2
    if (marker >= 0xd0 && marker <= 0xd7) {
      at += 2
      continue
    }
    if (at + 4 > b.length) return null
    const len = ((b[at + 2] ?? 0) << 8) + (b[at + 3] ?? 0)
    if (len < 2) return null
    at += 2 + len
    if (marker === 0xda) {
      // Entropy-coded data: scan to the next marker that is not a stuffed byte or a restart marker.
      while (at + 1 < b.length) {
        if (b[at] === 0xff && b[at + 1] !== 0x00 && !((b[at + 1] ?? 0) >= 0xd0 && (b[at + 1] ?? 0) <= 0xd7)) break
        at++
      }
    }
  }
  return null
}

/** Byte length of a WebP RIFF container, or null when the declared size does not fit. */
function webpEnd(b: Uint8Array): number | null {
  const size = u32le(b, 4) + 8
  return size >= 12 && size <= b.length ? size + (size % 2) : null
}

const UNSAFE = /<\s*(script|html|svg|iframe|object|embed)\b|<\?php|javascript:/i

/** Every problem with an upload, or an empty list when it is an allowed, well-formed image of its declared type. */
export function contentProblems(bytes: Uint8Array, declared: string): ContentProblem[] {
  const actual = sniff(bytes)
  if (!actual) return ['unsupported_type']
  if (actual !== declared.split(';')[0]?.trim().toLowerCase()) return ['type_mismatch']
  const end = actual === 'image/png' ? pngEnd(bytes) : actual === 'image/jpeg' ? jpegEnd(bytes) : webpEnd(bytes)
  if (end === null) return ['malformed']
  const problems: ContentProblem[] = []
  if (end < bytes.length && bytes.subarray(end).some((x) => x !== 0)) problems.push('trailing_data')
  // Latin-1 view of the bytes: markup hidden in metadata or appended data shows up as plain text.
  if (UNSAFE.test(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1')))
    problems.push('unsafe_content')
  return problems
}
