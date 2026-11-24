import test from 'node:test';
import assert from 'node:assert/strict';
import type { DictationHistoryEntry } from '../types/index.ts';
import {
  formatHistoryEntryAsMarkdown,
  formatHistoryEntryAsSrt,
  formatHistoryEntryAsTxt,
  formatHistoryEntryAsVtt,
  pruneDictationHistoryByRetention,
  searchDictationHistory
} from './dictationHistory.ts';

const SAMPLE_ENTRY: DictationHistoryEntry = {
  id: 'hist-1',
  createdIso: '2026-11-20T12:00:00.000Z',
  modeId: 'translate-ab',
  modeName: 'Translate A → B',
  sttModelId: 'whisper-tiny-local',
  sttModelName: 'Whisper Tiny (WebGPU/WASM)',
  textModelId: 'gemini-4-hydrogen',
  rawText: 'um ship ClaimCenter telemetry today',
  finalText: 'Ship ClaimCenter telemetry today.',
  translatedText: 'Enviar telemetría de ClaimCenter hoy.',
  detectedLang: 'English (US)',
  sourceLang: 'English (US)',
  targetLang: 'Spanish',
  durationSec: 4,
  wordCount: 5,
  insertedTarget: 'diary',
  localOnlyUsed: false
};

test('pruneDictationHistoryByRetention enforces none, 30d, and forever policies', () => {
  const nowMs = Date.parse('2026-11-22T00:00:00.000Z');
  const oldEntry: DictationHistoryEntry = {
    ...SAMPLE_ENTRY,
    id: 'hist-old',
    createdIso: '2026-09-01T00:00:00.000Z'
  };

  assert.equal(pruneDictationHistoryByRetention([SAMPLE_ENTRY, oldEntry], 'none', nowMs).length, 0);
  assert.deepEqual(
    pruneDictationHistoryByRetention([SAMPLE_ENTRY, oldEntry], '30d', nowMs).map((e) => e.id),
    ['hist-1']
  );
  assert.equal(pruneDictationHistoryByRetention([SAMPLE_ENTRY, oldEntry], 'forever', nowMs).length, 2);
});

test('searchDictationHistory matches translated text, raw text, mode, and model', () => {
  const hits = searchDictationHistory([SAMPLE_ENTRY], 'telemetría');
  assert.equal(hits.length, 1);
  assert.equal(searchDictationHistory([SAMPLE_ENTRY], 'nonexistent').length, 0);
});

test('history formatters emit valid Markdown, TXT, SRT, and WebVTT exports', () => {
  const md = formatHistoryEntryAsMarkdown(SAMPLE_ENTRY);
  assert.match(md, /^# Dictation Note — Translate A → B/);
  assert.match(md, /Enviar telemetría de ClaimCenter hoy\./);
  assert.match(md, /## Source Transcript \(English \(US\)\)/);

  const txt = formatHistoryEntryAsTxt(SAMPLE_ENTRY);
  assert.match(txt, /Enviar telemetría de ClaimCenter hoy\./);
  assert.match(txt, /--- Source \(English \(US\)\) ---/);

  const srt = formatHistoryEntryAsSrt(SAMPLE_ENTRY);
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:04,000\nEnviar telemetría de ClaimCenter hoy\./);

  const vtt = formatHistoryEntryAsVtt(SAMPLE_ENTRY);
  assert.match(vtt, /^WEBVTT\n\n00:00:00\.000 --> 00:00:04\.000\nEnviar telemetría de ClaimCenter hoy\./);
});
