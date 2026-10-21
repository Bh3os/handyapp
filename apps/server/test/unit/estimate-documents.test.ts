// Content checks of uploaded estimate documents (TSK-0054; HH-EST-11, HH-SEC-03, FACT-UPLOAD-LIMITS, OWN-DEC-102).
// Every document is built in code (RULE-SYNTHETIC-DATA).
import { deflateSync } from 'node:zlib'
import { LABEL_FAMILIES } from '@handyhub/i18n'
import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_PROBLEMS,
  documentProblems,
  ESTIMATE_DOCUMENT_TYPES,
  sniffDocument,
} from '../../src/modules/estimates/index.js'
import { DOCX, docx, EXTERNAL_HYPERLINK, EXTERNAL_TEMPLATE, PDF, pdf, zip } from '../fixtures/documents.js'
import { png } from '../fixtures/images.js'

describe('[HH-EST-11][OWN-DEC-102] estimate documents: PDF or Word, decided by the bytes', () => {
  it('accepts exactly PDF and Word (.docx); every refusal code has a staff label', () => {
    expect([...ESTIMATE_DOCUMENT_TYPES]).toEqual([PDF, DOCX])
    expect(LABEL_FAMILIES.estimateDocumentRejection).toEqual([...DOCUMENT_PROBLEMS, 'empty'])
  })

  it('a well-formed PDF and a well-formed Word document pass; the type is read from the content', () => {
    expect(sniffDocument(pdf())).toBe('pdf')
    expect(sniffDocument(docx())).toBe('zip')
    expect(documentProblems(pdf(), PDF)).toEqual([])
    expect(documentProblems(pdf(), 'application/pdf; charset=binary')).toEqual([])
    expect(documentProblems(docx(), DOCX)).toEqual([])
    // A hyperlink to a web page is an ordinary external relationship.
    expect(documentProblems(docx({ relationships: EXTERNAL_HYPERLINK }), DOCX)).toEqual([])
  })

  it('[HH-SEC-03] never trusts the extension or the declared type', () => {
    expect(documentProblems(pdf(), DOCX)).toEqual(['type_mismatch'])
    expect(documentProblems(docx(), PDF)).toEqual(['type_mismatch'])
    expect(documentProblems(png(), PDF)).toEqual(['unsupported_type'])
    expect(documentProblems(Buffer.from('Synthetic plain text'), PDF)).toEqual(['unsupported_type'])
    // A ZIP that is not a Word document (no Word content types) is not accepted as one.
    expect(documentProblems(zip([{ name: 'notes.txt', data: 'synthetic' }]), DOCX)).toEqual(['unsupported_type'])
  })

  it('refuses PDF scripts and actions, also hidden in a compressed object stream or behind #xx escapes', () => {
    const js = '/OpenAction << /S /JavaScript /JS (app.alert 1) >>'
    expect(documentProblems(pdf({ catalog: js }), PDF)).toEqual(['active_content'])
    expect(documentProblems(pdf({ catalog: '/OpenAction << /S /J#61vaScript >>' }), PDF)).toEqual(['active_content'])
    expect(documentProblems(pdf({ objectStream: `7 0 << /S /Launch /F (cmd) >>` }), PDF)).toEqual(['active_content'])
    expect(documentProblems(pdf({ objectStream: `7 0 << /EmbeddedFiles 8 0 R >>` }), PDF)).toEqual(['active_content'])
    expect(documentProblems(pdf({ text: 'Synthetic <script>alert</script>' }), PDF)).toEqual(['active_content'])
    // A harmless object stream passes.
    expect(documentProblems(pdf({ objectStream: '7 0 << /Type /Annot /Subtype /Link >>' }), PDF)).toEqual([])
  })

  it('refuses an encrypted PDF, data after %%EOF and a PDF without its end marker', () => {
    expect(documentProblems(pdf({ trailer: '/Encrypt 9 0 R' }), PDF)).toEqual(['encrypted'])
    expect(documentProblems(pdf({ after: 'PK\u0003\u0004synthetic second file' }), PDF)).toEqual(['trailing_data'])
    expect(documentProblems(pdf({ after: '\n\r\n  ' }), PDF)).toEqual([])
    expect(documentProblems(pdf({ noEof: true }), PDF)).toEqual(['malformed'])
  })

  it('a stream that expands beyond the bounds is malformed (a compression bomb never reaches memory)', () => {
    const bomb = deflateSync(Buffer.alloc(8 * 1024 * 1024))
    const bytes = Buffer.concat([
      pdf().subarray(0, 15),
      Buffer.from(`9 0 obj\n<< /Filter /FlateDecode /Length ${bomb.length} >>\nstream\n`),
      bomb,
      Buffer.from('\nendstream\nendobj\n'),
      pdf().subarray(15),
    ])
    expect(documentProblems(bytes, PDF)).toEqual(['malformed'])
  })

  it('refuses Word macros, ActiveX, embedded objects and remote templates', () => {
    const macro = 'application/vnd.ms-word.document.macroEnabled.main+xml'
    expect(documentProblems(docx({ mainType: macro }), DOCX)).toEqual(['active_content'])
    expect(documentProblems(docx({ extra: [{ name: 'word/vbaProject.bin', data: 'synthetic' }] }), DOCX)).toEqual([
      'active_content',
    ])
    expect(documentProblems(docx({ extra: [{ name: 'word/activeX/activeX1.xml', data: '<x/>' }] }), DOCX)).toEqual([
      'active_content',
    ])
    expect(
      documentProblems(docx({ extra: [{ name: 'word/embeddings/oleObject1.bin', data: 'synthetic' }] }), DOCX),
    ).toEqual(['active_content'])
    expect(documentProblems(docx({ relationships: EXTERNAL_TEMPLATE }), DOCX)).toEqual(['active_content'])
  })

  it('refuses encrypted entries, damaged entries, extra data, unsafe paths and declared sizes beyond the bounds', () => {
    expect(documentProblems(docx({ first: { flags: 1 } }), DOCX)).toEqual(['encrypted'])
    expect(documentProblems(docx({ first: { badCrc: true } }), DOCX)).toEqual(['malformed'])
    expect(documentProblems(docx({ after: Buffer.from('synthetic trailing bytes') }), DOCX)).toEqual(['trailing_data'])
    expect(documentProblems(docx({ extra: [{ name: '../evil.xml', data: '<x/>' }] }), DOCX)).toEqual(['malformed'])
    expect(documentProblems(docx({ first: { size: 300 * 1024 * 1024 } }), DOCX)).toEqual(['malformed'])
    // A truncated archive (its end cut off).
    const whole = docx()
    expect(documentProblems(whole.subarray(0, whole.length - 30), DOCX)).toEqual(['malformed'])
  })

  it('[HH-EST-11] the checks never read an amount: a document stating any total is judged on its structure only', () => {
    expect(documentProblems(pdf({ text: 'Synthetic total $123,456.78 deposit $9.99' }), PDF)).toEqual([])
    expect(documentProblems(docx({ text: 'Synthetic total $1.00' }), DOCX)).toEqual([])
  })
})
