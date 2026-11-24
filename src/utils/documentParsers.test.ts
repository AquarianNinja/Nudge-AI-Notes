import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {
  chunkDocumentSections,
  parseDocumentBytes,
  parseEpubDocument,
  parsePdfDocument,
  parseTxtDocument
} from './documentParsers.ts';
import { createStoredZipArchive } from './documentExport.ts';

test('parseTxtDocument parses UTF-8 plain text into readable sections', () => {
  const txt =
    'Guidewire ClaimCenter Architecture Overview\n\n' +
    'FNOL intake uses Cloud API composite payloads to snapshot PolicyCenter coverages.';
  const res = parseDocumentBytes(new TextEncoder().encode(txt), 'architecture_notes.txt');

  assert.equal(res.format, 'TXT');
  assert.ok(res.extractedText.includes('FNOL intake uses Cloud API'));
  assert.ok(res.sections.length >= 1);
  assert.ok(res.tags.includes('ClaimCenter'));
});

test('parsePdfDocument extracts text from uncompressed and FlateDecode PDF streams', () => {
  const plainStream = 'BT /F1 12 Tf 48 700 Tm (ClaimCenter FNOL Reserve Guide) Tj ET';
  const compressedInner = zlib.deflateSync(
    Buffer.from('BT /F1 10 Tf 48 680 Tm [(Gosu ) -10 (InitialReserve rules)] TJ ET', 'latin1')
  );

  const header = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Length 60 >>\nstream\n' + plainStream + '\nendstream\nendobj\n2 0 obj\n<< /Filter /FlateDecode >>\nstream\n', 'latin1');
  const footer = Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1');
  const pdfBytes = Buffer.concat([header, compressedInner, footer]);

  const parsed = parsePdfDocument(new Uint8Array(pdfBytes), 'reserve_spec.pdf', {
    inflate: (buf) => new Uint8Array(zlib.inflateSync(buf))
  });

  assert.equal(parsed.format, 'PDF');
  assert.equal(parsed.sectionCount, 2);
  assert.match(parsed.extractedText, /ClaimCenter FNOL Reserve Guide/);
  assert.match(parsed.extractedText, /Gosu InitialReserve rules/);
});

test('parseEpubDocument unpacks XHTML chapters from real EPUB ZIP archive', () => {
  const epubZip = createStoredZipArchive([
    { path: 'mimetype', content: 'application/epub+zip' },
    {
      path: 'OEBPS/chapter1.xhtml',
      content:
        '<html><head><title>Chapter 1: CoreData Vector Sync</title></head>' +
        '<body><h1>Chapter 1</h1><p>Embeddings sync cleanly across iCloud CloudKit &amp; CoreData.</p></body></html>'
    },
    {
      path: 'OEBPS/chapter2.xhtml',
      content:
        '<html><head><title>Chapter 2: Hybrid RAG</title></head>' +
        '<body><p>Reciprocal Rank Fusion merges dense cosine scores with BM25 matches.</p></body></html>'
    }
  ]);

  const parsed = parseEpubDocument(epubZip, 'rag_handbook.epub', {
    inflateRaw: (buf) => new Uint8Array(zlib.inflateRawSync(buf))
  });

  assert.equal(parsed.format, 'EPUB');
  assert.equal(parsed.sectionCount, 2);
  assert.match(parsed.sections[0].label, /CoreData Vector Sync/);
  assert.match(parsed.extractedText, /iCloud CloudKit & CoreData/);
  assert.match(parsed.extractedText, /Reciprocal Rank Fusion/);
});

test('chunkDocumentSections splits long text with overlapping context windows', () => {
  const longPara = Array.from({ length: 18 }, (_, i) => `Sentence ${i + 1} covers ClaimCenter reserve limits cleanly.`).join(' ');
  const chunks = chunkDocumentSections([{ label: 'Page 1', text: longPara }], 220, 40);

  assert.ok(chunks.length >= 3);
  assert.equal(chunks[0].sectionLabel, 'Page 1');
  assert.ok(chunks.every((c) => c.text.length <= 240));
});
