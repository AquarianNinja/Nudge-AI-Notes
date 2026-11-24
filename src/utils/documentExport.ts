import {
  AnyExportFormat,
  DictionaryEntry,
  DownloadedMeetingExport,
  ExportFilterOptions,
  MeetingItemCategory,
  MeetingNotesExportFormat,
  MeetingNotesExportOptions,
  MeetingSession,
  PodcastEpisode,
  TranscriptExportFormat,
  TranscriptExportOptions
} from '../types/index.ts';
import { parseTimestampToSeconds } from './audioDrive.ts';
import {
  calculateEpisodeDuration,
  computeTranscriptTurnsWithOffsets
} from './audioSynthesis.ts';

export interface TranscriptFormatMeta {
  id: TranscriptExportFormat;
  label: string;
  ext: string;
  description: string;
}

export const TRANSCRIPT_EXPORT_FORMATS: TranscriptFormatMeta[] = [
  {
    id: 'markdown',
    label: 'Markdown',
    ext: '.md',
    description: 'Headings, timestamps & speaker attributions'
  },
  {
    id: 'json',
    label: 'JSON',
    ext: '.json',
    description: 'Structured segments with elapsed seconds'
  },
  {
    id: 'docx',
    label: 'Word',
    ext: '.docx',
    description: 'Formatted Microsoft Word document'
  },
  {
    id: 'pdf',
    label: 'PDF',
    ext: '.pdf',
    description: 'Multi-page portable transcript PDF'
  },
  {
    id: 'vtt',
    label: 'WebVTT',
    ext: '.vtt',
    description: 'Time-aligned caption cues with voice tags'
  },
  {
    id: 'txt',
    label: 'Plain Text',
    ext: '.txt',
    description: 'Clean timestamped plain-text script'
  }
];

export interface ExportDocumentPayload {
  fileName: string;
  mimeType: string;
  data: string | Uint8Array;
  formatLabel: string;
}

const CATEGORY_HEADING: Record<MeetingItemCategory, string> = {
  decision: 'Decision',
  action: 'Action Item',
  risk: 'Risk / Blocker'
};

export function sanitizeExportSlug(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'meeting_session';
}

function escapePdfString(input: string): string {
  return input
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapTextLine(text: string, maxChars = 84): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if (!current) {
      current = w;
    } else if (current.length + 1 + w.length <= maxChars) {
      current += ` ${w}`;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export interface PdfLineSpec {
  text: string;
  font?: 'F1' | 'F2';
  size?: number;
  spaceAfter?: number;
}

/**
 * Generates multi-page standard %PDF-1.4 bytes with Type1 Helvetica & Helvetica-Bold fonts.
 */
export function buildMultiPagePdfBytes(lineSpecs: PdfLineSpec[]): Uint8Array {
  const pageHeight = 792;
  const topY = 748;
  const bottomY = 58;
  const pages: PdfLineSpec[][] = [[]];
  let y = topY;

  for (const spec of lineSpecs) {
    const size = spec.size ?? 10;
    const step = size + 4 + (spec.spaceAfter ?? 2);
    if (y - step < bottomY && pages[pages.length - 1].length > 0) {
      pages.push([]);
      y = topY;
    }
    pages[pages.length - 1].push(spec);
    y -= step;
  }

  // Build objects:
  // 1: Catalog, 2: Pages, 3: F1 Helvetica, 4: F2 Helvetica-Bold,
  // followed by pairs of (Page object, Content stream object) per page.
  const objects: string[] = ['', '', '', ''];
  objects[0] = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  objects[2] = '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';
  objects[3] = '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n';

  const pageObjNums: number[] = [];
  let nextObjNum = 5;

  pages.forEach((pageLines, pageIdx) => {
    const pageObjNum = nextObjNum++;
    const contentObjNum = nextObjNum++;
    pageObjNums.push(pageObjNum);

    let stream = 'BT\n';
    let currY = topY;
    for (const item of pageLines) {
      const font = item.font ?? 'F1';
      const size = item.size ?? 10;
      if (item.text) {
        stream += `/${font} ${size} Tf\n1 0 0 1 48 ${currY} Tm\n(${escapePdfString(item.text)}) Tj\n`;
      }
      currY -= size + 4 + (item.spaceAfter ?? 2);
    }
    // Subtle page footer
    stream += `/F1 8 Tf\n1 0 0 1 48 34 Tm\n(Page ${pageIdx + 1} of ${pages.length}) Tj\n`;
    stream += 'ET\n';

    const pageObj =
      `${pageObjNum} 0 obj\n` +
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 ${pageHeight}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjNum} 0 R >>\n` +
      `endobj\n`;
    const contentObj =
      `${contentObjNum} 0 obj\n` +
      `<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`;

    objects.push(pageObj, contentObj);
  });

  objects[1] =
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums.map(n => `${n} 0 R`).join(' ')}] /Count ${pageObjNums.length} >>\nendobj\n`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}

// IEEE 802.3 CRC-32 lookup table for ZIP entries
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntryInput {
  path: string;
  content: string | Uint8Array;
}

/**
 * Writes an uncompressed (STORE method 0) PKWARE ZIP archive.
 * Universally valid across Word, Google Docs, Apple Pages, LibreOffice, and unzip tools.
 */
export function createStoredZipArchive(entries: ZipEntryInput[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const dataBytes =
      typeof entry.content === 'string' ? encoder.encode(entry.content) : entry.content;
    const crc = computeCrc32(dataBytes);

    // Local File Header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header signature
    lv.setUint16(4, 20, true); // version needed (2.0)
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // compression method: 0 (STORE)
    lv.setUint16(10, 0, true); // mod time
    lv.setUint16(12, 0x5421, true); // mod date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, dataBytes.length, true); // compressed size
    lv.setUint32(22, dataBytes.length, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra len
    localHeader.set(nameBytes, 30);

    // Central Directory Header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // central file header signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true); // UTF-8 filename flag
    cv.setUint16(10, 0, true); // STORE
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x5421, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dataBytes.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra len
    cv.setUint16(32, 0, true); // comment len
    cv.setUint16(34, 0, true); // disk start
    cv.setUint16(36, 0, true); // internal attrs
    cv.setUint32(38, 0, true); // external attrs
    cv.setUint32(42, offset, true); // local header offset
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, dataBytes);
    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const centralDirSize = centralParts.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // End of Central Directory signature
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalSize = offset + centralDirSize + eocd.length;
  const archive = new Uint8Array(totalSize);
  let cursor = 0;
  for (const part of localParts) {
    archive.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralParts) {
    archive.set(part, cursor);
    cursor += part.length;
  }
  archive.set(eocd, cursor);
  return archive;
}

async function compressDeflateRaw(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined' || bytes.length < 48) {
    return null;
  }
  try {
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    void writer.write(copy);
    void writer.close();
    const compressedBuf = await new Response(cs.readable).arrayBuffer();
    const compressed = new Uint8Array(compressedBuf);
    return compressed.length < bytes.length ? compressed : null;
  } catch {
    return null;
  }
}

/**
 * Writes a compressed PKWARE ZIP archive using DEFLATE (method 8) via CompressionStream('deflate-raw')
 * whenever compression reduces payload size, falling back cleanly to STORE (method 0).
 */
export async function createCompressedZipArchive(entries: ZipEntryInput[]): Promise<{
  bytes: Uint8Array;
  rawByteLength: number;
  compressedEntryCount: number;
}> {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  let rawByteLength = 0;
  let compressedEntryCount = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const rawBytes =
      typeof entry.content === 'string' ? encoder.encode(entry.content) : entry.content;
    rawByteLength += rawBytes.length;

    const crc = computeCrc32(rawBytes);
    const deflated = await compressDeflateRaw(rawBytes);
    const method = deflated ? 8 : 0;
    const storedBytes = deflated || rawBytes;
    if (deflated) compressedEntryCount += 1;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, method, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x5421, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, storedBytes.length, true);
    lv.setUint32(22, rawBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x5421, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, storedBytes.length, true);
    cv.setUint32(24, rawBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, storedBytes);
    centralParts.push(centralHeader);
    offset += localHeader.length + storedBytes.length;
  }

  const centralDirSize = centralParts.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const archive = new Uint8Array(offset + centralDirSize + eocd.length);
  let cursor = 0;
  for (const part of localParts) {
    archive.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralParts) {
    archive.set(part, cursor);
    cursor += part.length;
  }
  archive.set(eocd, cursor);
  return {
    bytes: archive,
    rawByteLength,
    compressedEntryCount
  };
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface DocxBlock {
  kind: 'title' | 'subtitle' | 'heading' | 'paragraph' | 'bullet';
  text: string;
  boldPrefix?: string;
}

/**
 * Generates authentic Office Open XML (.docx) bytes.
 */
export function buildDocxBytes(blocks: DocxBlock[]): Uint8Array {
  const paragraphsXml = blocks
    .map((block) => {
      if (block.kind === 'title') {
        return `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="18181B"/></w:rPr><w:t xml:space="preserve">${escapeXml(block.text)}</w:t></w:r></w:p>`;
      }
      if (block.kind === 'subtitle') {
        return `<w:p><w:pPr><w:spacing w:after="200"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/><w:color w:val="52525B"/></w:rPr><w:t xml:space="preserve">${escapeXml(block.text)}</w:t></w:r></w:p>`;
      }
      if (block.kind === 'heading') {
        return `<w:p><w:pPr><w:spacing w:before="220" w:after="80"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="18181B"/></w:rPr><w:t xml:space="preserve">${escapeXml(block.text)}</w:t></w:r></w:p>`;
      }
      const prefix = block.boldPrefix
        ? `<w:r><w:rPr><w:b/><w:sz w:val="21"/></w:rPr><w:t xml:space="preserve">${escapeXml(block.boldPrefix)}</w:t></w:r>`
        : '';
      const bulletLead = block.kind === 'bullet' ? '• ' : '';
      const indentXml = block.kind === 'bullet' ? '<w:ind w:left="280"/>' : '';
      return `<w:p><w:pPr><w:spacing w:after="100"/>${indentXml}</w:pPr>${prefix}<w:r><w:rPr><w:sz w:val="21"/></w:rPr><w:t xml:space="preserve">${escapeXml(bulletLead + block.text)}</w:t></w:r></w:p>`;
    })
    .join('');

  const contentTypesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>';

  const rootRelsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>';

  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${paragraphsXml}` +
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/></w:sectPr>' +
    '</w:body></w:document>';

  return createStoredZipArchive([
    { path: '[Content_Types].xml', content: contentTypesXml },
    { path: '_rels/.rels', content: rootRelsXml },
    { path: 'word/document.xml', content: documentXml }
  ]);
}

function formatVttTimestamp(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.000`;
}

export function exportMeetingTranscript(
  session: MeetingSession,
  format: TranscriptExportFormat,
  dictionaryEntries: DictionaryEntry[] = [],
  options: TranscriptExportOptions = {}
): ExportDocumentPayload {
  const includeMetadata = options.includeMetadata !== false;
  const includeDictionaryTerms = options.includeDictionaryTerms !== false;
  const allowedIndices = options.includedHighlightIndices
    ? new Set(options.includedHighlightIndices)
    : null;

  const selectedHighlights = session.highlights.filter((_, idx) =>
    allowedIndices ? allowedIndices.has(idx) : true
  );

  const slug = sanitizeExportSlug(`${session.title}_s${session.sessionNumber}_transcript`);
  const asrLabel = session.generatedBy?.transcriptionSummary || 'WhisperKit + FluidAudio Speaker ID';
  const audioLabel = session.audioDeleted
    ? `${session.audioFileName} (Audio Deleted)`
    : session.audioFileName;

  const matchedTerms = includeDictionaryTerms
    ? dictionaryEntries
        .map(d => d.term)
        .filter(term =>
          selectedHighlights.some(h => h.text.toLowerCase().includes(term.toLowerCase())) ||
          session.summary.toLowerCase().includes(term.toLowerCase())
        )
    : [];

  if (format === 'markdown') {
    const lines: string[] = [`# ${session.title} — Transcript`, ``];
    if (includeMetadata) {
      lines.push(
        `- **Session**: S${session.sessionNumber}`,
        `- **Recorded At**: ${session.recordedAt}`,
        `- **Source**: ${audioLabel} (${session.audioDurationLabel})`,
        `- **Transcription Model**: ${asrLabel}`
      );
    }
    if (matchedTerms.length > 0) {
      lines.push(`- **Dictionary Terms**: ${matchedTerms.join(', ')}`);
    }
    if (includeMetadata || matchedTerms.length > 0) {
      lines.push(``);
    }
    lines.push(`## Transcript`, ``);
    if (selectedHighlights.length === 0) {
      lines.push(`_(No speaker turns selected)_`);
    } else {
      selectedHighlights.forEach(h => {
        const tag = h.speakerTag ? `[${h.speakerTag}] ` : '';
        lines.push(`- **[${h.timestamp}]** ${tag}**${h.speaker}**: ${h.text}`);
      });
    }
    return {
      fileName: `${slug}.md`,
      mimeType: 'text/markdown;charset=utf-8',
      data: lines.join('\n'),
      formatLabel: 'Markdown (.md)'
    };
  }

  if (format === 'json') {
    const payload = {
      schema: 'locally.meeting.transcript.v1',
      exportedAt: new Date().toISOString(),
      ...(includeMetadata
        ? {
            session: {
              id: session.id,
              sessionNumber: session.sessionNumber,
              title: session.title,
              recordedAt: session.recordedAt,
              sourceFile: session.audioFileName,
              audioDeleted: Boolean(session.audioDeleted),
              durationLabel: session.audioDurationLabel,
              durationSec: session.audioDurationSec ?? null,
              transcriptionModel: asrLabel,
              notesModel: session.generatedBy?.notesSummary ?? null,
              speakerIdEnabled: session.generatedBy?.speakerIdEnabled ?? true
            }
          }
        : {}),
      ...(includeDictionaryTerms ? { matchedDictionaryTerms: matchedTerms } : {}),
      transcript: selectedHighlights.map((h, index) => ({
        index: index + 1,
        timestamp: h.timestamp,
        startSeconds: parseTimestampToSeconds(h.timestamp),
        speaker: h.speaker,
        speakerTag: h.speakerTag ?? null,
        text: h.text
      }))
    };
    return {
      fileName: `${slug}.json`,
      mimeType: 'application/json;charset=utf-8',
      data: JSON.stringify(payload, null, 2),
      formatLabel: 'JSON (.json)'
    };
  }

  if (format === 'vtt') {
    const totalSec = Math.max(60, session.audioDurationSec || 760);
    const cues = selectedHighlights.map((h, idx) => {
      const startSec = parseTimestampToSeconds(h.timestamp);
      const nextStart =
        idx + 1 < selectedHighlights.length
          ? parseTimestampToSeconds(selectedHighlights[idx + 1].timestamp)
          : Math.min(totalSec, startSec + 18);
      const endSec = Math.max(startSec + 4, Math.min(nextStart, totalSec));
      const voiceName = h.speaker.replace(/[<>]/g, '');
      return `${idx + 1}\n${formatVttTimestamp(startSec)} --> ${formatVttTimestamp(endSec)}\n<v ${voiceName}>${h.text}</v>`;
    });

    const headerLines = includeMetadata
      ? ['WEBVTT', `Kind: captions`, `Title: ${session.title} (S${session.sessionNumber})`, '']
      : ['WEBVTT', ''];

    const vtt = [...headerLines, ...cues].join('\n\n');

    return {
      fileName: `${slug}.vtt`,
      mimeType: 'text/vtt;charset=utf-8',
      data: vtt,
      formatLabel: 'WebVTT (.vtt)'
    };
  }

  if (format === 'txt') {
    const headerLines = includeMetadata
      ? [
          `${session.title} — Transcript (Session ${session.sessionNumber})`,
          `Source: ${audioLabel} · ${session.audioDurationLabel} · ${asrLabel}`,
          ''
        ]
      : [`${session.title} — Transcript`, ''];
    const txt = [
      ...headerLines,
      ...selectedHighlights.map(h => {
        const tag = h.speakerTag ? `[${h.speakerTag}] ` : '';
        return `[${h.timestamp}] ${tag}${h.speaker}: ${h.text}`;
      })
    ].join('\n');
    return {
      fileName: `${slug}.txt`,
      mimeType: 'text/plain;charset=utf-8',
      data: txt,
      formatLabel: 'Plain Text (.txt)'
    };
  }

  if (format === 'docx') {
    const blocks: DocxBlock[] = [
      { kind: 'title', text: `${session.title} — Transcript` }
    ];
    if (includeMetadata) {
      blocks.push({
        kind: 'subtitle',
        text: `Session ${session.sessionNumber} · ${session.recordedAt} · ${audioLabel} · ${asrLabel}`
      });
    }
    blocks.push({ kind: 'heading', text: 'Speaker-Diarized Transcript' });
    selectedHighlights.forEach(h => {
      blocks.push({
        kind: 'paragraph',
        boldPrefix: `[${h.timestamp}] ${h.speakerTag ? `[${h.speakerTag}] ` : ''}${h.speaker}: `,
        text: h.text
      });
    });
    if (matchedTerms.length > 0) {
      blocks.push({ kind: 'heading', text: 'Linked Domain Vocabulary' });
      blocks.push({ kind: 'paragraph', text: matchedTerms.join(', ') });
    }
    return {
      fileName: `${slug}.docx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      data: buildDocxBytes(blocks),
      formatLabel: 'Word (.docx)'
    };
  }

  // PDF format
  const pdfLines: PdfLineSpec[] = [
    { text: `${session.title} - Transcript`, font: 'F2', size: 15, spaceAfter: 4 }
  ];
  if (includeMetadata) {
    pdfLines.push(
      {
        text: `Session S${session.sessionNumber} | ${session.recordedAt} | ${audioLabel}`,
        font: 'F1',
        size: 9,
        spaceAfter: 2
      },
      { text: `ASR Model: ${asrLabel}`, font: 'F1', size: 9, spaceAfter: 10 }
    );
  }
  pdfLines.push({ text: 'TRANSCRIPT SEGMENTS', font: 'F2', size: 11, spaceAfter: 6 });

  selectedHighlights.forEach(h => {
    const tag = h.speakerTag ? `[${h.speakerTag}] ` : '';
    pdfLines.push({
      text: `[${h.timestamp}] ${tag}${h.speaker}`,
      font: 'F2',
      size: 10,
      spaceAfter: 1
    });
    wrapTextLine(h.text, 86).forEach(line =>
      pdfLines.push({ text: line, font: 'F1', size: 10, spaceAfter: 2 })
    );
    pdfLines.push({ text: '', font: 'F1', size: 6, spaceAfter: 2 });
  });

  if (matchedTerms.length > 0) {
    pdfLines.push({ text: 'DOMAIN TERMS', font: 'F2', size: 11, spaceAfter: 4 });
    wrapTextLine(matchedTerms.join(', '), 86).forEach(line =>
      pdfLines.push({ text: line, font: 'F1', size: 10, spaceAfter: 2 })
    );
  }

  return {
    fileName: `${slug}.pdf`,
    mimeType: 'application/pdf',
    data: buildMultiPagePdfBytes(pdfLines),
    formatLabel: 'PDF (.pdf)'
  };
}

export function convertPodcastEpisodeToSession(
  episode: PodcastEpisode,
  engineLabel = 'Dual-Host Audio Overview Synthesis'
): MeetingSession {
  const timedTurns = computeTranscriptTurnsWithOffsets(episode.dialogue);
  const { totalSec, formatted } = calculateEpisodeDuration(episode.dialogue);
  const safeTotalSec = Math.max(totalSec, Math.round(episode.durationMinutes * 60));

  return {
    id: episode.id,
    sessionNumber: 1,
    title: episode.title,
    audioFileName: `${sanitizeExportSlug(episode.title)}.wav`,
    audioDurationLabel: formatted !== '0:00' ? formatted : `~${episode.durationMinutes} min`,
    audioDurationSec: safeTotalSec,
    audioSizeLabel: `${episode.dialogue.length} turns`,
    recordedAt: episode.topic,
    summary: episode.subtitle,
    items: [],
    highlights: timedTurns.map(({ turn, timestampLabel }) => ({
      timestamp: timestampLabel,
      speaker: turn.speaker,
      speakerTag: turn.speakerRole,
      text: turn.text
    })),
    generatedBy: {
      transcriptionSummary: engineLabel,
      notesSummary: episode.topic,
      speakerIdEnabled: true
    }
  };
}

export function exportPodcastEpisodeTranscript(
  episode: PodcastEpisode,
  format: TranscriptExportFormat,
  options: TranscriptExportOptions & { engineLabel?: string } = {}
): ExportDocumentPayload {
  const session = convertPodcastEpisodeToSession(episode, options.engineLabel);
  return exportMeetingTranscript(session, format, [], options);
}

export function exportMeetingNotesDocument(
  session: MeetingSession,
  format: MeetingNotesExportFormat,
  options: MeetingNotesExportOptions = {}
): ExportDocumentPayload {
  const includeMetadata = options.includeMetadata !== false;
  const includeSummary = options.includeSummary !== false;
  const includeDecisions = options.includeDecisions !== false;
  const includeActions = options.includeActions !== false;
  const includeRisks = options.includeRisks !== false;
  const includeHighlights = options.includeHighlights !== false;

  const allowedItemIds = options.includedItemIds ? new Set(options.includedItemIds) : null;
  const allowedHighlightIndices = options.includedHighlightIndices
    ? new Set(options.includedHighlightIndices)
    : null;

  const categoryEnabled: Record<MeetingItemCategory, boolean> = {
    decision: includeDecisions,
    action: includeActions,
    risk: includeRisks
  };

  const slug = sanitizeExportSlug(`${session.title}_s${session.sessionNumber}_notes`);
  const asrLabel = session.generatedBy?.transcriptionSummary || 'WhisperKit + FluidAudio Speaker ID';
  const notesLabel = session.generatedBy?.notesSummary || 'Llama 3 8B (MLX Local)';
  const sourceLabel = session.audioDeleted
    ? `${session.audioFileName} (Audio Deleted)`
    : session.audioFileName;

  const filteredItems = session.items.filter(
    item => categoryEnabled[item.category] && (!allowedItemIds || allowedItemIds.has(item.id))
  );
  const grouped: Record<MeetingItemCategory, typeof session.items> = {
    decision: filteredItems.filter(i => i.category === 'decision'),
    action: filteredItems.filter(i => i.category === 'action'),
    risk: filteredItems.filter(i => i.category === 'risk')
  };

  const selectedHighlights = includeHighlights
    ? session.highlights.filter((_, idx) =>
        allowedHighlightIndices ? allowedHighlightIndices.has(idx) : true
      )
    : [];

  if (format === 'markdown') {
    const md: string[] = [`# ${session.title} — Meeting Notes`, ``];
    if (includeMetadata) {
      md.push(
        `- **Session**: S${session.sessionNumber}`,
        `- **Recorded At**: ${session.recordedAt}`,
        `- **Source**: ${sourceLabel} (${session.audioDurationLabel})`,
        `- **Pipelines**: ASR (${asrLabel}) · Notes (${notesLabel})`,
        ``
      );
    }

    if (includeSummary) {
      md.push(`## Executive Summary`, session.summary, ``);
    }

    (['decision', 'action', 'risk'] as MeetingItemCategory[]).forEach(cat => {
      if (grouped[cat].length === 0) return;
      md.push(`## ${CATEGORY_HEADING[cat]}s`);
      grouped[cat].forEach(item => {
        md.push(`- ${item.owner ? `**[${item.owner}]** ` : ''}${item.text}`);
      });
      md.push('');
    });

    if (selectedHighlights.length > 0) {
      md.push(`## Key Timestamped Highlights`);
      selectedHighlights.forEach(h => {
        md.push(`- **[${h.timestamp}]** **${h.speaker}**: ${h.text}`);
      });
    }

    return {
      fileName: `${slug}.md`,
      mimeType: 'text/markdown;charset=utf-8',
      data: md.join('\n'),
      formatLabel: 'Markdown (.md)'
    };
  }

  if (format === 'docx') {
    const blocks: DocxBlock[] = [
      { kind: 'title', text: `${session.title} — Meeting Notes` }
    ];
    if (includeMetadata) {
      blocks.push({
        kind: 'subtitle',
        text: `Session S${session.sessionNumber} · ${session.recordedAt} · ASR: ${asrLabel} · Notes: ${notesLabel}`
      });
    }
    if (includeSummary) {
      blocks.push({ kind: 'heading', text: 'Executive Summary' });
      blocks.push({ kind: 'paragraph', text: session.summary });
    }

    (['decision', 'action', 'risk'] as MeetingItemCategory[]).forEach(cat => {
      if (grouped[cat].length === 0) return;
      blocks.push({ kind: 'heading', text: `${CATEGORY_HEADING[cat]}s` });
      grouped[cat].forEach(item => {
        blocks.push({
          kind: 'bullet',
          boldPrefix: item.owner ? `[${item.owner}] ` : undefined,
          text: item.text
        });
      });
    });

    if (selectedHighlights.length > 0) {
      blocks.push({ kind: 'heading', text: 'Timestamped Highlights' });
      selectedHighlights.forEach(h => {
        blocks.push({
          kind: 'bullet',
          boldPrefix: `[${h.timestamp}] ${h.speaker}: `,
          text: h.text
        });
      });
    }

    return {
      fileName: `${slug}.docx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      data: buildDocxBytes(blocks),
      formatLabel: 'Word (.docx)'
    };
  }

  // PDF format
  const pdfLines: PdfLineSpec[] = [
    { text: `${session.title} - Meeting Notes`, font: 'F2', size: 15, spaceAfter: 4 }
  ];
  if (includeMetadata) {
    pdfLines.push(
      {
        text: `Session S${session.sessionNumber} | ${session.recordedAt} | ${sourceLabel}`,
        font: 'F1',
        size: 9,
        spaceAfter: 2
      },
      {
        text: `ASR: ${asrLabel} | Notes: ${notesLabel}`,
        font: 'F1',
        size: 9,
        spaceAfter: 10
      }
    );
  }

  if (includeSummary) {
    pdfLines.push({ text: 'EXECUTIVE SUMMARY', font: 'F2', size: 11, spaceAfter: 4 });
    wrapTextLine(session.summary, 86).forEach(line =>
      pdfLines.push({ text: line, font: 'F1', size: 10, spaceAfter: 2 })
    );
    pdfLines.push({ text: '', font: 'F1', size: 6, spaceAfter: 4 });
  }

  (['decision', 'action', 'risk'] as MeetingItemCategory[]).forEach(cat => {
    if (grouped[cat].length === 0) return;
    pdfLines.push({
      text: `${CATEGORY_HEADING[cat].toUpperCase()}S`,
      font: 'F2',
      size: 11,
      spaceAfter: 4
    });
    grouped[cat].forEach(item => {
      const lineText = `- ${item.owner ? `[${item.owner}] ` : ''}${item.text}`;
      wrapTextLine(lineText, 86).forEach(line =>
        pdfLines.push({ text: line, font: 'F1', size: 10, spaceAfter: 2 })
      );
    });
    pdfLines.push({ text: '', font: 'F1', size: 6, spaceAfter: 4 });
  });

  if (selectedHighlights.length > 0) {
    pdfLines.push({ text: 'TIMESTAMPED HIGHLIGHTS', font: 'F2', size: 11, spaceAfter: 4 });
    selectedHighlights.forEach(h => {
      wrapTextLine(`[${h.timestamp}] ${h.speaker}: ${h.text}`, 86).forEach(line =>
        pdfLines.push({ text: line, font: 'F1', size: 10, spaceAfter: 2 })
      );
    });
  }

  return {
    fileName: `${slug}.pdf`,
    mimeType: 'application/pdf',
    data: buildMultiPagePdfBytes(pdfLines),
    formatLabel: 'PDF (.pdf)'
  };
}

export function triggerBrowserDownload(payload: ExportDocumentPayload): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') {
    return;
  }
  const blobPart: BlobPart =
    typeof payload.data === 'string'
      ? payload.data
      : (payload.data.buffer.slice(
          payload.data.byteOffset,
          payload.data.byteOffset + payload.data.byteLength
        ) as ArrayBuffer);

  const blob = new Blob([blobPart], { type: payload.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = payload.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function getExportByteLength(data: string | Uint8Array): number {
  if (typeof data === 'string') {
    return new TextEncoder().encode(data).byteLength;
  }
  return data.byteLength;
}

export function getExportStageSteps(
  kind: 'transcript' | 'notes' | 'batch-zip',
  format: string,
  segmentOrItemCount: number,
  batchFormatCount = 1
): [string, string, string] {
  if (kind === 'batch-zip') {
    const totalFiles = Math.max(1, segmentOrItemCount * batchFormatCount);
    return [
      `Collecting ${segmentOrItemCount} ${segmentOrItemCount === 1 ? 'session' : 'sessions'} across ${batchFormatCount} ${batchFormatCount === 1 ? 'format' : 'formats'}`,
      `Compiling ${totalFiles} files & compressing ZIP archive`,
      'ZIP archive ready · Triggering download'
    ];
  }

  const collectLabel =
    kind === 'transcript'
      ? `Collecting ${segmentOrItemCount} transcript ${segmentOrItemCount === 1 ? 'segment' : 'segments'} & speaker tags`
      : `Collecting ${segmentOrItemCount} structured ${segmentOrItemCount === 1 ? 'note' : 'notes'} & summary`;

  const formatMap: Record<string, string> = {
    docx: 'Packaging WordprocessingML & CRC-32 ZIP archive',
    pdf: 'Paginating multi-page Type1 %PDF-1.4 document',
    json: 'Serializing schema-validated JSON payload',
    vtt: 'Aligning WebVTT cue intervals & voice spans',
    markdown: 'Rendering clean Markdown headings & timestamps',
    txt: 'Formatting plain-text speaker transcript'
  };

  const compileLabel = formatMap[format] || `Compiling ${format.toUpperCase()} document`;
  const readyLabel = 'File ready · Triggering download';

  return [collectLabel, compileLabel, readyLabel];
}

export function summarizeExportSelection(
  session: MeetingSession,
  kind: 'transcript' | 'notes',
  options?: ExportFilterOptions
): string {
  if (kind === 'transcript') {
    const opts = (options || {}) as TranscriptExportOptions;
    const total = session.highlights.length;
    const selected = opts.includedHighlightIndices
      ? opts.includedHighlightIndices.filter(i => i >= 0 && i < total).length
      : total;
    const extras: string[] = [];
    if (opts.includeMetadata === false) extras.push('no header');
    if (opts.includeDictionaryTerms === false) extras.push('no glossary');
    if (selected === total && extras.length === 0) {
      return `All ${total} speaker ${total === 1 ? 'turn' : 'turns'}`;
    }
    return `${selected}/${total} speaker ${total === 1 ? 'turn' : 'turns'}${
      extras.length > 0 ? ` · ${extras.join(', ')}` : ''
    }`;
  }

  const opts = (options || {}) as MeetingNotesExportOptions;
  const parts: string[] = [];
  if (opts.includeSummary !== false) parts.push('Summary');
  if (opts.includeDecisions !== false) parts.push('Decisions');
  if (opts.includeActions !== false) parts.push('Actions');
  if (opts.includeRisks !== false) parts.push('Risks');
  if (opts.includeHighlights !== false) parts.push('Highlights');
  if (parts.length === 5 && !opts.includedItemIds && !opts.includedHighlightIndices) {
    return `Full notes (${session.items.length} items)`;
  }
  return parts.length > 0 ? parts.join(' · ') : 'Custom sections';
}

export function buildPreparedExportPreview(
  session: MeetingSession,
  kind: 'transcript' | 'notes',
  format: AnyExportFormat,
  dictionaryEntries: DictionaryEntry[] = [],
  options: ExportFilterOptions = {}
): {
  previewText: string;
  fileName: string;
  byteLength: number;
  isTextFormat: boolean;
} {
  const actualPayload =
    kind === 'transcript'
      ? exportMeetingTranscript(
          session,
          format as TranscriptExportFormat,
          dictionaryEntries,
          options as TranscriptExportOptions
        )
      : exportMeetingNotesDocument(
          session,
          format as MeetingNotesExportFormat,
          options as MeetingNotesExportOptions
        );

  const byteLength = getExportByteLength(actualPayload.data);
  if (typeof actualPayload.data === 'string') {
    return {
      previewText: actualPayload.data,
      fileName: actualPayload.fileName,
      byteLength,
      isTextFormat: true
    };
  }

  // Binary formats (DOCX, PDF): mirror the exact filtered content into a clean readable preview
  const mirrorPayload =
    kind === 'transcript'
      ? exportMeetingTranscript(
          session,
          'markdown',
          dictionaryEntries,
          options as TranscriptExportOptions
        )
      : exportMeetingNotesDocument(
          session,
          'markdown',
          options as MeetingNotesExportOptions
        );

  return {
    previewText: typeof mirrorPayload.data === 'string' ? mirrorPayload.data : '',
    fileName: actualPayload.fileName,
    byteLength,
    isTextFormat: false
  };
}

export interface BatchZipExportInput {
  sessions: MeetingSession[];
  transcriptFormats: TranscriptExportFormat[];
  notesFormats: MeetingNotesExportFormat[];
  dictionaryEntries?: DictionaryEntry[];
}

export interface BatchZipExportResult {
  payload: ExportDocumentPayload;
  fileRecordsBySession: Record<string, DownloadedMeetingExport[]>;
  fileCount: number;
  rawByteLength: number;
  compressedByteLength: number;
  compressedEntryCount: number;
}

export async function buildBatchExportZip(
  input: BatchZipExportInput
): Promise<BatchZipExportResult> {
  const {
    sessions,
    transcriptFormats,
    notesFormats,
    dictionaryEntries = []
  } = input;

  const entries: ZipEntryInput[] = [];
  const fileRecordsBySession: Record<string, DownloadedMeetingExport[]> = {};
  const nowLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const nowIso = new Date().toISOString();
  const manifestItems: Array<{
    sessionNumber: number;
    title: string;
    path: string;
    kind: 'transcript' | 'notes';
    format: AnyExportFormat;
    sizeBytes: number;
  }> = [];

  for (const session of sessions) {
    const folder = sanitizeExportSlug(`s${session.sessionNumber}_${session.title}`);
    fileRecordsBySession[session.id] = [];

    for (const fmt of transcriptFormats) {
      const doc = exportMeetingTranscript(session, fmt, dictionaryEntries);
      const path = `${folder}/transcript/${doc.fileName}`;
      const sizeBytes = getExportByteLength(doc.data);
      entries.push({ path, content: doc.data });
      manifestItems.push({
        sessionNumber: session.sessionNumber,
        title: session.title,
        path,
        kind: 'transcript',
        format: fmt,
        sizeBytes
      });
      fileRecordsBySession[session.id].push({
        id: `exp-${session.id}-transcript-${fmt}`,
        kind: 'transcript',
        format: fmt,
        fileName: doc.fileName,
        exportedAt: nowLabel,
        exportedIso: nowIso,
        sizeBytes,
        sourceMode: 'batch-zip',
        selectionSummary: `ZIP Bundle · All ${session.highlights.length} turns`
      });
    }

    for (const fmt of notesFormats) {
      const doc = exportMeetingNotesDocument(session, fmt);
      const path = `${folder}/notes/${doc.fileName}`;
      const sizeBytes = getExportByteLength(doc.data);
      entries.push({ path, content: doc.data });
      manifestItems.push({
        sessionNumber: session.sessionNumber,
        title: session.title,
        path,
        kind: 'notes',
        format: fmt,
        sizeBytes
      });
      fileRecordsBySession[session.id].push({
        id: `exp-${session.id}-notes-${fmt}`,
        kind: 'notes',
        format: fmt,
        fileName: doc.fileName,
        exportedAt: nowLabel,
        exportedIso: nowIso,
        sizeBytes,
        sourceMode: 'batch-zip',
        selectionSummary: `ZIP Bundle · ${session.items.length} notes`
      });
    }
  }

  entries.push({
    path: 'manifest.json',
    content: JSON.stringify(
      {
        schema: 'locally.meetings.batch_export.v1',
        exportedAt: nowIso,
        sessionCount: sessions.length,
        fileCount: manifestItems.length,
        files: manifestItems
      },
      null,
      2
    )
  });

  const { bytes, rawByteLength, compressedEntryCount } = await createCompressedZipArchive(entries);
  const dateTag = nowIso.slice(0, 10);
  const archiveName =
    sessions.length === 1
      ? `${sanitizeExportSlug(`s${sessions[0].sessionNumber}_${sessions[0].title}`)}_bundle.zip`
      : `locally_meetings_${sessions.length}_sessions_${dateTag}.zip`;

  return {
    payload: {
      fileName: archiveName,
      mimeType: 'application/zip',
      data: bytes,
      formatLabel: 'Compressed Archive (.zip)'
    },
    fileRecordsBySession,
    fileCount: manifestItems.length,
    rawByteLength,
    compressedByteLength: bytes.byteLength,
    compressedEntryCount
  };
}

