// Synthetic image bytes for upload tests (TSK-0031): structurally valid PNG, JPEG and WebP files built in code, so no
// real photo is committed (RULE-SYNTHETIC-DATA).
import { deflateSync } from 'node:zlib'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const b of buf) c = (crcTable[(c ^ b) & 0xff] as number) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** A 1x1 PNG; `variant` changes a private chunk so each call can be a different file. */
export function png(variant = 0): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0)
  ihdr.writeUInt32BE(1, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('tsTv', Buffer.from(String(variant))),
    chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0]))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** A JPEG with the marker structure the server walks; `size` pads the entropy-coded data to an exact file size. */
export function jpeg(size = 0): Buffer {
  const head = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
    0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
  ])
  const tail = Buffer.from([0xff, 0xd9])
  const dataLength = Math.max(3, size - head.length - tail.length)
  return Buffer.concat([head, Buffer.alloc(dataLength, 0x12), tail])
}

/** A WebP RIFF container with a lossless chunk. */
export function webp(): Buffer {
  const payload = Buffer.from([0x2f, 0x00, 0x00, 0x00, 0x00])
  const chunkHead = Buffer.concat([Buffer.from('VP8L', 'ascii'), Buffer.from([payload.length, 0, 0, 0])])
  const body = Buffer.concat([Buffer.from('WEBP', 'ascii'), chunkHead, payload, Buffer.from([0])])
  const size = Buffer.alloc(4)
  size.writeUInt32LE(body.length)
  return Buffer.concat([Buffer.from('RIFF', 'ascii'), size, body])
}

/** The start of a PDF: a document type customers may not upload. */
export const pdf = () => Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n', 'ascii')
