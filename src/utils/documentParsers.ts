import type { CoreDataDocumentFormat } from '../types/index.ts';

export interface ParsedDocumentSection {
  label: string;
  text: string;
}

export interface ParsedDocumentResult {
  title: string;
  format: CoreDataDocumentFormat;
  extractedText: string;
  sections: ParsedDocumentSection[];
  sectionCount: number;
  tags: string[];
}

export interface ZipDecompressionHooks {
  inflate?: (compressed: Uint8Array) => Uint8Array;
  inflateRaw?: (compressed: Uint8Array) => Uint8Array;
}

function normalizeWhitespace(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) && code > 0 ? String.fromCharCode(code) : ' ';
    });
}

function stripMarkupToReadableText(markup: string): string {
  const withoutScripts = markup
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr|section|article|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return normalizeWhitespace(decodeHtmlEntities(withoutScripts));
}

function inferTagsFromText(fileName: string, text: string): string[] {
  const lower = `${fileName} ${text.slice(0, 3000)}`.toLowerCase();
  const candidates: Array<[RegExp, string]> = [
    [/claimcenter/i, 'ClaimCenter'],
    [/policycenter/i, 'PolicyCenter'],
    [/billingcenter/i, 'BillingCenter'],
    [/\bfnol\b|first notice of loss/i, 'FNOL'],
    [/\bgosu\b|transactionset/i, 'Gosu'],
    [/subrogation/i, 'Subrogation'],
    [/\bsiu\b|fraud/i, 'SIU'],
    [/cloud\s*api|json:api|rest/i, 'Cloud API'],
    [/reserve|indemnity/i, 'Reserves'],
    [/rag|vector|embedding/i, 'RAG']
  ];
  const matched = candidates.filter(([re]) => re.test(lower)).map(([, tag]) => tag);
  if (matched.length > 0) return matched.slice(0, 3);
  return ['Uploaded', fileName.split('.').pop()?.toUpperCase() || 'DOC'];
}

export function detectDocumentFormat(fileName: string, mimeType = ''): CoreDataDocumentFormat {
  const lower = fileName.toLowerCase();
  const mime = mimeType.toLowerCase();
  if (lower.endsWith('.pdf') || mime.includes('pdf')) return 'PDF';
  if (lower.endsWith('.epub') || mime.includes('epub')) return 'EPUB';
  if (lower.endsWith('.md') || lower.endsWith('.markdown') || mime.includes('markdown')) {
    return 'Markdown';
  }
  return 'TXT';
}

export function parseTxtDocument(bytes: Uint8Array, fileName: string): ParsedDocumentResult {
  const decoded = normalizeWhitespace(new TextDecoder('utf-8', { fatal: false }).decode(bytes));
  const format = detectDocumentFormat(fileName);
  const paragraphs = decoded
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const sections: ParsedDocumentSection[] = [];
  if (paragraphs.length === 0 && decoded) {
    sections.push({ label: 'Section 1', text: decoded });
  } else {
    let buffer = '';
    let idx = 1;
    for (const para of paragraphs) {
      if (buffer && buffer.length + para.length + 2 > 900) {
        sections.push({ label: `Section ${idx++}`, text: buffer });
        buffer = para;
      } else {
        buffer = buffer ? `${buffer}\n\n${para}` : para;
      }
    }
    if (buffer) {
      sections.push({ label: `Section ${idx}`, text: buffer });
    }
  }

  return {
    title: fileName,
    format,
    extractedText: decoded,
    sections: sections.length > 0 ? sections : [{ label: 'Section 1', text: fileName }],
    sectionCount: Math.max(1, sections.length),
    tags: inferTagsFromText(fileName, decoded)
  };
}

function unescapePdfLiteral(literal: string): string {
  let out = '';
  for (let i = 0; i < literal.length; i++) {
    const ch = literal[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = literal[i + 1];
    if (!next) break;
    i += 1;
    if (next === 'n') out += '\n';
    else if (next === 'r') out += ' ';
    else if (next === 't') out += ' ';
    else if (next === 'b' || next === 'f') out += '';
    else if (next === '\\' || next === '(' || next === ')') out += next;
    else if (next >= '0' && next <= '7') {
      const oct = literal.slice(i, i + 3).match(/^[0-7]{1,3}/)?.[0] || next;
      i += oct.length - 1;
      const code = parseInt(oct, 8);
      if (code >= 32 && code <= 126) out += String.fromCharCode(code);
    } else {
      out += next;
    }
  }
  return out;
}

function extractTextOperatorsFromPdfStream(streamText: string): string {
  const fragments: string[] = [];
  const btBlocks = streamText.match(/BT[\s\S]*?ET/g) || [streamText];

  for (const block of btBlocks) {
    // Handle [(foo) -12 (bar)] TJ arrays
    const tjArrayMatches = block.match(/\[[\s\S]*?\]\s*TJ/g) || [];
    for (const arrExpr of tjArrayMatches) {
      const literalMatches = arrExpr.match(/\((?:\\.|[^\\()])*\)/g) || [];
      const joined = literalMatches
        .map((m) => unescapePdfLiteral(m.slice(1, -1)))
        .join('');
      if (joined.trim()) fragments.push(joined);
    }

    // Handle (foo) Tj or ' / "
    const blockWithoutArrays = block.replace(/\[[\s\S]*?\]\s*TJ/g, ' ');
    const singleMatches = blockWithoutArrays.match(/\((?:\\.|[^\\()])*\)\s*(?:Tj|'|")/g) || [];
    for (const expr of singleMatches) {
      const inner = expr.replace(/\)\s*(?:Tj|'|")$/, '').slice(1);
      const clean = unescapePdfLiteral(inner);
      if (clean.trim()) fragments.push(clean);
    }
  }

  return normalizeWhitespace(fragments.join('\n'));
}

function extractPrintableAsciiFallback(bytes: Uint8Array): string {
  const latin1 = new TextDecoder('latin1').decode(bytes);
  const runs = latin1.match(/[A-Za-z0-9][A-Za-z0-9 ,.;:'"/?()\-_%$@]{18,}/g) || [];
  const filtered = runs.filter(
    (r) =>
      !/^(obj|endobj|stream|endstream|xref|trailer|Type\s+\/|Filter\s+\/|BaseFont)/i.test(r.trim()) &&
      /[a-z]{3,}/.test(r)
  );
  return normalizeWhitespace(filtered.slice(0, 120).join('\n'));
}

export function parsePdfDocument(
  bytes: Uint8Array,
  fileName: string,
  hooks: ZipDecompressionHooks = {}
): ParsedDocumentResult {
  const latin1 = new TextDecoder('latin1').decode(bytes);
  const pageTexts: string[] = [];

  // Match PDF stream ... endstream blocks along with preceding dictionary if present
  const streamRegex = /(<<[\s\S]{0,400}?>>)?\s*stream\r?\n([\s\S]*?)endstream/g;
  let match: RegExpExecArray | null;

  while ((match = streamRegex.exec(latin1)) !== null) {
    const dict = match[1] || '';
    const bodyStr = match[2] || '';
    if (!bodyStr) continue;

    const startOffset = match.index + match[0].indexOf(bodyStr);
    const rawSlice = bytes.slice(startOffset, startOffset + bodyStr.length);

    let decodedStream = bodyStr;
    if (/\/FlateDecode/i.test(dict) && hooks.inflate) {
      try {
        const inflated = hooks.inflate(rawSlice);
        decodedStream = new TextDecoder('latin1').decode(inflated);
      } catch {
        // Ignore corrupted or non-zlib streams cleanly
      }
    }

    if (decodedStream.includes('Tj') || decodedStream.includes('TJ') || decodedStream.includes('BT')) {
      const extracted = extractTextOperatorsFromPdfStream(decodedStream);
      if (extracted.length > 0) {
        pageTexts.push(extracted);
      }
    }
  }

  let sections: ParsedDocumentSection[] = pageTexts.map((txt, idx) => ({
    label: `Page ${idx + 1}`,
    text: txt
  }));

  let fullText = normalizeWhitespace(pageTexts.join('\n\n'));

  if (!fullText) {
    fullText = extractPrintableAsciiFallback(bytes);
    if (fullText) {
      sections = [{ label: 'Page 1', text: fullText }];
    }
  }

  if (!fullText) {
    fullText = `${fileName} uploaded as binary PDF (${Math.max(1, Math.round(bytes.byteLength / 1024))} KB). Ready for semantic tagging and RAG indexing.`;
    sections = [{ label: 'Page 1', text: fullText }];
  }

  return {
    title: fileName,
    format: 'PDF',
    extractedText: fullText,
    sections,
    sectionCount: sections.length,
    tags: inferTagsFromText(fileName, fullText)
  };
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

export interface ZipEntryExtracted {
  path: string;
  data: Uint8Array;
}

/**
 * Lightweight ZIP reader supporting stored (method 0) and DEFLATE (method 8) entries
 * via Central Directory headers, used to unpack real .epub containers.
 */
export function readZipEntries(
  bytes: Uint8Array,
  inflateRaw?: (compressed: Uint8Array) => Uint8Array
): ZipEntryExtracted[] {
  // Locate End of Central Directory (PK\x05\x06) scanning backwards
  let eocdOffset = -1;
  const minOffset = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= minOffset; i--) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) return [];

  const totalEntries = readUint16LE(bytes, eocdOffset + 10);
  const centralDirOffset = readUint32LE(bytes, eocdOffset + 16);
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const results: ZipEntryExtracted[] = [];

  let ptr = centralDirOffset;
  for (let idx = 0; idx < totalEntries && ptr + 46 <= bytes.length; idx++) {
    if (
      bytes[ptr] !== 0x50 ||
      bytes[ptr + 1] !== 0x4b ||
      bytes[ptr + 2] !== 0x01 ||
      bytes[ptr + 3] !== 0x02
    ) {
      break;
    }

    const compressionMethod = readUint16LE(bytes, ptr + 10);
    const compressedSize = readUint32LE(bytes, ptr + 20);
    const nameLen = readUint16LE(bytes, ptr + 28);
    const extraLen = readUint16LE(bytes, ptr + 30);
    const commentLen = readUint16LE(bytes, ptr + 32);
    const localHeaderOffset = readUint32LE(bytes, ptr + 42);
    const entryName = decoder.decode(bytes.slice(ptr + 46, ptr + 46 + nameLen));

    ptr += 46 + nameLen + extraLen + commentLen;

    if (
      localHeaderOffset + 30 <= bytes.length &&
      bytes[localHeaderOffset] === 0x50 &&
      bytes[localHeaderOffset + 1] === 0x4b &&
      bytes[localHeaderOffset + 2] === 0x03 &&
      bytes[localHeaderOffset + 3] === 0x04
    ) {
      const localNameLen = readUint16LE(bytes, localHeaderOffset + 26);
      const localExtraLen = readUint16LE(bytes, localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
      const slice = bytes.slice(dataStart, dataStart + compressedSize);

      if (compressionMethod === 0) {
        results.push({ path: entryName, data: slice });
      } else if (compressionMethod === 8 && inflateRaw) {
        try {
          results.push({ path: entryName, data: inflateRaw(slice) });
        } catch {
          // Skip malformed compressed entry cleanly
        }
      }
    }
  }

  return results;
}

export function parseEpubDocument(
  bytes: Uint8Array,
  fileName: string,
  hooks: ZipDecompressionHooks = {}
): ParsedDocumentResult {
  const entries = readZipEntries(bytes, hooks.inflateRaw);
  const decoder = new TextDecoder('utf-8', { fatal: false });

  const chapterEntries = entries
    .filter((entry) => /\.(xhtml|html|htm)$/i.test(entry.path) && !/nav\.(xhtml|html)$/i.test(entry.path))
    .sort((a, b) => a.path.localeCompare(b.path));

  const sections: ParsedDocumentSection[] = [];
  chapterEntries.forEach((entry, idx) => {
    const rawHtml = decoder.decode(entry.data);
    const titleMatch = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || rawHtml.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i);
    const chapterTitle = titleMatch
      ? stripMarkupToReadableText(titleMatch[1]).slice(0, 60)
      : `Chapter ${idx + 1}`;
    const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyText = stripMarkupToReadableText(bodyMatch ? bodyMatch[1] : rawHtml);
    if (bodyText) {
      sections.push({
        label: chapterTitle || `Chapter ${idx + 1}`,
        text: bodyText
      });
    }
  });

  // Fallback: if EPUB had non-standard text entries or no deflate hook
  if (sections.length === 0) {
    const fallbackText = extractPrintableAsciiFallback(bytes);
    const text =
      fallbackText ||
      `${fileName} EPUB package indexed (${Math.max(1, Math.round(bytes.byteLength / 1024))} KB).`;
    sections.push({ label: 'Chapter 1', text });
  }

  const extractedText = normalizeWhitespace(sections.map((s) => `${s.label}\n${s.text}`).join('\n\n'));

  return {
    title: fileName,
    format: 'EPUB',
    extractedText,
    sections,
    sectionCount: sections.length,
    tags: inferTagsFromText(fileName, extractedText)
  };
}

export function parseDocumentBytes(
  bytes: Uint8Array,
  fileName: string,
  mimeType = '',
  hooks: ZipDecompressionHooks = {}
): ParsedDocumentResult {
  const format = detectDocumentFormat(fileName, mimeType);
  if (format === 'PDF') return parsePdfDocument(bytes, fileName, hooks);
  if (format === 'EPUB') return parseEpubDocument(bytes, fileName, hooks);
  return parseTxtDocument(bytes, fileName);
}

export function chunkDocumentSections(
  sections: ParsedDocumentSection[],
  maxChunkChars = 420,
  overlapChars = 60
): Array<{ sectionLabel: string; text: string }> {
  const chunks: Array<{ sectionLabel: string; text: string }> = [];

  for (const sec of sections) {
    const cleaned = normalizeWhitespace(sec.text);
    if (!cleaned) continue;

    if (cleaned.length <= maxChunkChars) {
      chunks.push({ sectionLabel: sec.label, text: cleaned });
      continue;
    }

    let cursor = 0;
    while (cursor < cleaned.length) {
      let end = Math.min(cleaned.length, cursor + maxChunkChars);
      if (end < cleaned.length) {
        const lastBoundary = Math.max(
          cleaned.lastIndexOf('. ', end),
          cleaned.lastIndexOf('\n', end),
          cleaned.lastIndexOf(' ', end)
        );
        if (lastBoundary > cursor + Math.floor(maxChunkChars * 0.45)) {
          end = lastBoundary + 1;
        }
      }
      const slice = cleaned.slice(cursor, end).trim();
      if (slice) {
        chunks.push({ sectionLabel: sec.label, text: slice });
      }
      if (end >= cleaned.length) break;
      cursor = Math.max(cursor + 1, end - overlapChars);
    }
  }

  return chunks;
}
