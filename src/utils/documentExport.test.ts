import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBatchExportZip,
  buildMultiPagePdfBytes,
  buildPreparedExportPreview,
  computeCrc32,
  exportMeetingNotesDocument,
  exportMeetingTranscript,
  exportPodcastEpisodeTranscript,
  getExportByteLength,
  getExportStageSteps,
  summarizeExportSelection,
  TRANSCRIPT_EXPORT_FORMATS
} from './documentExport.ts';
import {
  buildMeetingSessionFromAudio,
  INITIAL_MEETING_SESSION
} from './meetingNotes.ts';
import { INITIAL_DICTIONARY_ENTRIES, SAMPLE_PODCAST_EPISODES } from '../data/mockData.ts';

test('exportMeetingTranscript supports markdown, json, vtt, txt, docx, and pdf', () => {
  const md = exportMeetingTranscript(INITIAL_MEETING_SESSION, 'markdown', INITIAL_DICTIONARY_ENTRIES);
  assert.ok(md.fileName.endsWith('.md'));
  assert.equal(typeof md.data, 'string');
  assert.match(md.data as string, /# ClaimCenter FNOL & Reserve Triage — Transcript/);
  assert.match(md.data as string, /\*\*\[02:14\]\*\*/);
  assert.match(md.data as string, /Dictionary Terms/);

  const json = exportMeetingTranscript(INITIAL_MEETING_SESSION, 'json', INITIAL_DICTIONARY_ENTRIES);
  assert.ok(json.fileName.endsWith('.json'));
  const parsed = JSON.parse(json.data as string);
  assert.equal(parsed.schema, 'locally.meeting.transcript.v1');
  assert.equal(parsed.transcript.length, INITIAL_MEETING_SESSION.highlights.length);
  assert.equal(parsed.transcript[0].startSeconds, 134);

  const vtt = exportMeetingTranscript(INITIAL_MEETING_SESSION, 'vtt', INITIAL_DICTIONARY_ENTRIES);
  assert.ok(vtt.fileName.endsWith('.vtt'));
  assert.match(vtt.data as string, /^WEBVTT/);
  assert.match(vtt.data as string, /00:02:14\.000 --> 00:07:48\.000/);
  assert.match(vtt.data as string, /<v Maya>/);

  const txt = exportMeetingTranscript(INITIAL_MEETING_SESSION, 'txt', INITIAL_DICTIONARY_ENTRIES);
  assert.ok(txt.fileName.endsWith('.txt'));
  assert.match(txt.data as string, /\[02:14\] Maya:/);

  const docx = exportMeetingTranscript(INITIAL_MEETING_SESSION, 'docx', INITIAL_DICTIONARY_ENTRIES);
  assert.ok(docx.fileName.endsWith('.docx'));
  assert.ok(docx.data instanceof Uint8Array);
  // PKZIP Local File Header magic PK\x03\x04
  assert.equal(docx.data[0], 0x50);
  assert.equal(docx.data[1], 0x4b);
  assert.equal(docx.data[2], 0x03);
  assert.equal(docx.data[3], 0x04);
  const docxText = new TextDecoder('utf-8').decode(docx.data);
  assert.match(docxText, /word\/document\.xml/);
  assert.match(docxText, /\[Content_Types\]\.xml/);
  assert.match(docxText, /<w:document/);
  assert.match(docxText, /ClaimCenter FNOL &amp; Reserve Triage/);

  const pdf = exportMeetingTranscript(INITIAL_MEETING_SESSION, 'pdf', INITIAL_DICTIONARY_ENTRIES);
  assert.ok(pdf.fileName.endsWith('.pdf'));
  assert.ok(pdf.data instanceof Uint8Array);
  const pdfDecoded = new TextDecoder('latin1').decode(pdf.data);
  assert.ok(pdfDecoded.startsWith('%PDF-1.4'));
  assert.ok(pdfDecoded.trimEnd().endsWith('%%EOF'));
  assert.match(pdfDecoded, /TRANSCRIPT SEGMENTS/);
});

test('exportMeetingNotesDocument supports docx, pdf, and markdown formats', () => {
  const md = exportMeetingNotesDocument(INITIAL_MEETING_SESSION, 'markdown');
  assert.ok(md.fileName.endsWith('.md'));
  assert.match(md.data as string, /## Executive Summary/);
  assert.match(md.data as string, /## Decisions/);
  assert.match(md.data as string, /## Action Items/);
  assert.match(md.data as string, /\*\*\[Priya\]\*\*/);

  const docx = exportMeetingNotesDocument(INITIAL_MEETING_SESSION, 'docx');
  assert.ok(docx.fileName.endsWith('.docx'));
  assert.ok(docx.data instanceof Uint8Array);
  const docxDecoded = new TextDecoder('utf-8').decode(docx.data);
  assert.match(docxDecoded, /Executive Summary/);
  assert.match(docxDecoded, /Benchmark PolicyCenter coverage snapshot SLA under 800ms\./);

  const pdf = exportMeetingNotesDocument(INITIAL_MEETING_SESSION, 'pdf');
  assert.ok(pdf.fileName.endsWith('.pdf'));
  assert.ok(pdf.data instanceof Uint8Array);
  const pdfDecoded = new TextDecoder('latin1').decode(pdf.data);
  assert.ok(pdfDecoded.startsWith('%PDF-1.4'));
  assert.ok(pdfDecoded.trimEnd().endsWith('%%EOF'));
  assert.match(pdfDecoded, /EXECUTIVE SUMMARY/);
  assert.match(pdfDecoded, /DECISIONS/);
});

test('buildMultiPagePdfBytes splits long documents across multiple valid PDF pages', () => {
  const manyLines = Array.from({ length: 120 }, (_, i) => ({
    text: `Segment line ${i + 1}: ClaimCenter reserve and subrogation verification.`,
    font: 'F1' as const,
    size: 10,
    spaceAfter: 2
  }));
  const bytes = buildMultiPagePdfBytes(manyLines);
  const decoded = new TextDecoder('latin1').decode(bytes);
  assert.match(decoded, /\/Count [2-9]/);
  assert.match(decoded, /Page 1 of /);
  assert.match(decoded, /Page 2 of /);
});

test('computeCrc32 computes standard IEEE 802.3 CRC-32 checksum', () => {
  const bytes = new TextEncoder().encode('123456789');
  assert.equal(computeCrc32(bytes), 0xcbf43926);
});

test('getExportByteLength handles UTF-8 strings and Uint8Array payloads', () => {
  assert.equal(getExportByteLength('hello'), 5);
  assert.equal(getExportByteLength('café'), 5);
  assert.equal(getExportByteLength(new Uint8Array([1, 2, 3, 4])), 4);
});

test('getExportStageSteps returns format-specific labels for transcript and notes exports', () => {
  const docxSteps = getExportStageSteps('transcript', 'docx', 4);
  assert.equal(docxSteps.length, 3);
  assert.match(docxSteps[0], /4 transcript segments/);
  assert.match(docxSteps[1], /WordprocessingML/);
  assert.match(docxSteps[2], /File ready/);

  const pdfSteps = getExportStageSteps('notes', 'pdf', 1);
  assert.match(pdfSteps[0], /1 structured note /);
  assert.match(pdfSteps[1], /Type1 %PDF-1\.4/);

  const vttSteps = getExportStageSteps('transcript', 'vtt', 3);
  assert.match(vttSteps[1], /WebVTT cue intervals/);

  const jsonSteps = getExportStageSteps('transcript', 'json', 3);
  assert.match(jsonSteps[1], /JSON payload/);

  const mdSteps = getExportStageSteps('notes', 'markdown', 2);
  assert.match(mdSteps[1], /Markdown headings/);

  const batchSteps = getExportStageSteps('batch-zip', 'zip', 2, 4);
  assert.match(batchSteps[0], /2 sessions across 4 formats/);
  assert.match(batchSteps[1], /8 files & compressing ZIP archive/);
});

test('exportMeetingTranscript and exportMeetingNotesDocument honor Prepare Export section and turn filters', () => {
  const filteredTranscript = exportMeetingTranscript(
    INITIAL_MEETING_SESSION,
    'markdown',
    INITIAL_DICTIONARY_ENTRIES,
    {
      includeMetadata: false,
      includeDictionaryTerms: false,
      includedHighlightIndices: [1]
    }
  );
  const trText = filteredTranscript.data as string;
  assert.ok(!trText.includes('**Recorded At**:'), 'Metadata should be excluded');
  assert.ok(!trText.includes('**Dictionary Terms**:'), 'Glossary should be excluded');
  assert.ok(!trText.includes('Maya'), 'Excluded speaker turn 0 should be omitted');
  assert.match(trText, /Priya/);

  const filteredJson = exportMeetingTranscript(
    INITIAL_MEETING_SESSION,
    'json',
    INITIAL_DICTIONARY_ENTRIES,
    { includeMetadata: false, includedHighlightIndices: [0] }
  );
  const parsed = JSON.parse(filteredJson.data as string);
  assert.equal(parsed.session, undefined);
  assert.equal(parsed.transcript.length, 1);
  assert.equal(parsed.transcript[0].speaker, 'Maya');

  const filteredNotes = exportMeetingNotesDocument(INITIAL_MEETING_SESSION, 'markdown', {
    includeMetadata: false,
    includeSummary: false,
    includeDecisions: false,
    includeActions: true,
    includeRisks: false,
    includeHighlights: false
  });
  const notesText = filteredNotes.data as string;
  assert.ok(!notesText.includes('## Executive Summary'));
  assert.ok(!notesText.includes('## Decisions'));
  assert.match(notesText, /## Action Items/);
  assert.ok(!notesText.includes('## Key Timestamped Highlights'));

  const preview = buildPreparedExportPreview(
    INITIAL_MEETING_SESSION,
    'transcript',
    'pdf',
    INITIAL_DICTIONARY_ENTRIES,
    { includedHighlightIndices: [1] }
  );
  assert.equal(preview.isTextFormat, false);
  assert.ok(preview.fileName.endsWith('.pdf'));
  assert.ok(preview.byteLength > 200);
  assert.match(preview.previewText, /Priya/);
  assert.ok(!preview.previewText.includes('Maya'));

  assert.equal(
    summarizeExportSelection(INITIAL_MEETING_SESSION, 'transcript', {
      includeMetadata: false,
      includedHighlightIndices: [1]
    }),
    '1/2 speaker turns · no header'
  );
});

test('buildBatchExportZip packages multiple sessions and formats into a compressed PKZIP archive', async () => {
  const s2 = buildMeetingSessionFromAudio({
    fileName: 'claimcenter_fnol_s2.m4a',
    fileSizeBytes: 2400000,
    durationSec: 420,
    previousSession: INITIAL_MEETING_SESSION,
    sessionNumber: 2
  });

  const result = await buildBatchExportZip({
    sessions: [INITIAL_MEETING_SESSION, s2],
    transcriptFormats: ['markdown', 'json'],
    notesFormats: ['markdown', 'pdf'],
    dictionaryEntries: INITIAL_DICTIONARY_ENTRIES
  });

  assert.ok(result.payload.fileName.endsWith('.zip'));
  assert.equal(result.fileCount, 8);
  assert.ok(result.payload.data instanceof Uint8Array);
  assert.equal(result.payload.data[0], 0x50);
  assert.equal(result.payload.data[1], 0x4b);
  assert.equal(result.payload.data[2], 0x03);
  assert.equal(result.payload.data[3], 0x04);
  assert.ok(result.compressedByteLength < result.rawByteLength, 'DEFLATE should compress bundle');
  assert.ok(result.compressedEntryCount >= 1);

  const decodedPaths = new TextDecoder('latin1').decode(result.payload.data);
  assert.match(decodedPaths, /manifest\.json/);
  assert.match(decodedPaths, /s1_claimcenter_fnol_reserve_triage\/transcript\//);
  assert.match(decodedPaths, /s2_claimcenter_fnol_reserve_triage_part_2\/notes\//);
  assert.equal(result.fileRecordsBySession[INITIAL_MEETING_SESSION.id].length, 4);
  assert.equal(result.fileRecordsBySession[s2.id].length, 4);
  assert.equal(result.fileRecordsBySession[s2.id][0].sourceMode, 'batch-zip');
});

test('exportPodcastEpisodeTranscript exports Notebook episode transcript in all 6 document formats', () => {
  const episode = SAMPLE_PODCAST_EPISODES[0];
  assert.equal(TRANSCRIPT_EXPORT_FORMATS.length, 6);

  const md = exportPodcastEpisodeTranscript(episode, 'markdown');
  assert.ok(md.fileName.endsWith('.md'));
  assert.match(md.data as string, new RegExp(`# ${episode.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} — Transcript`));
  assert.match(md.data as string, /\*\*\[00:00\]\*\*/);
  assert.match(md.data as string, /Alex/);

  const json = exportPodcastEpisodeTranscript(episode, 'json');
  assert.ok(json.fileName.endsWith('.json'));
  const parsed = JSON.parse(json.data as string);
  assert.equal(parsed.schema, 'locally.meeting.transcript.v1');
  assert.equal(parsed.transcript.length, episode.dialogue.length);
  assert.equal(parsed.transcript[0].timestamp, '00:00');

  const docx = exportPodcastEpisodeTranscript(episode, 'docx');
  assert.ok(docx.fileName.endsWith('.docx'));
  assert.ok(docx.data instanceof Uint8Array);
  assert.equal(docx.data[0], 0x50);
  assert.equal(docx.data[1], 0x4b);

  const pdf = exportPodcastEpisodeTranscript(episode, 'pdf');
  assert.ok(pdf.fileName.endsWith('.pdf'));
  assert.ok(pdf.data instanceof Uint8Array);
  const pdfDecoded = new TextDecoder('latin1').decode(pdf.data);
  assert.ok(pdfDecoded.startsWith('%PDF-1.4'));
  assert.ok(pdfDecoded.trimEnd().endsWith('%%EOF'));

  const vtt = exportPodcastEpisodeTranscript(episode, 'vtt');
  assert.ok(vtt.fileName.endsWith('.vtt'));
  assert.match(vtt.data as string, /^WEBVTT/);
  assert.match(vtt.data as string, /00:00:00\.000 -->/);

  const txt = exportPodcastEpisodeTranscript(episode, 'txt');
  assert.ok(txt.fileName.endsWith('.txt'));
  assert.match(txt.data as string, /\[00:00\]/);

  const filtered = exportPodcastEpisodeTranscript(episode, 'json', {
    includedHighlightIndices: [1]
  });
  const filteredParsed = JSON.parse(filtered.data as string);
  assert.equal(filteredParsed.transcript.length, 1);
  assert.equal(filteredParsed.transcript[0].speaker, episode.dialogue[1].speaker);
});



