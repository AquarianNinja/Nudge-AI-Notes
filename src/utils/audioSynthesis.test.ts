import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateSpokenDurationSec,
  calculateEpisodeDuration,
  generateDualHostScriptFromDocument,
  computeTranscriptTurnsWithOffsets,
  filterTranscriptTurns,
  formatEpisodeTranscriptText
} from './audioSynthesis.ts';
import { LocalDocument } from '../types/index.ts';

test('estimateSpokenDurationSec calculates realistic speaking time', () => {
  const sample =
    'Guidewire ClaimCenter coordinates First Notice of Loss intake, PolicyCenter coverage verification, exposure segmentation, and automated initial reserve allocation cleanly.';
  const duration = estimateSpokenDurationSec(sample, 1.0);
  assert.ok(duration >= 6 && duration <= 12, `Duration should be ~7-9s, got ${duration}`);

  assert.equal(estimateSpokenDurationSec(''), 0);
});

test('calculateEpisodeDuration formats minutes and seconds cleanly', () => {
  const turns = [
    { id: '1', speaker: 'Alex' as const, speakerRole: 'Deep Tech Host' as const, text: 'Hello', durationSec: 45 },
    { id: '2', speaker: 'Maya' as const, speakerRole: 'Practical Synthesizer' as const, text: 'World', durationSec: 30 }
  ];

  const result = calculateEpisodeDuration(turns);
  assert.equal(result.totalSec, 75);
  assert.equal(result.formatted, '1:15');
});

test('generateDualHostScriptFromDocument outputs alternating hosts with ClaimCenter context', () => {
  const mockDoc: LocalDocument = {
    id: 'doc-cc-1',
    title: 'ClaimCenter_FNOL_Integration_Guide.pdf',
    format: 'PDF',
    sizeKB: 2450,
    chunkCount: 142,
    dateAdded: '2026-11-05',
    summary: 'Composite REST endpoints for FNOL intake and reserve allocation',
    contentExcerpt: 'POST /claim/v1/claims creates draft claims with verified PolicyCenter coverage snapshots...',
    tags: ['ClaimCenter', 'FNOL']
  };

  const script = generateDualHostScriptFromDocument(mockDoc);
  assert.ok(script.length >= 4);
  assert.equal(script[0].speaker, 'Alex');
  assert.equal(script[1].speaker, 'Maya');
  assert.ok(script[0].text.includes(mockDoc.title));
  assert.ok(script.some(t => t.text.includes('ClaimCenter')));
  assert.ok(script.every(t => t.durationSec > 0));
});

test('computeTranscriptTurnsWithOffsets and filterTranscriptTurns preserve original indices and timestamps', () => {
  const turns = [
    { id: 't1', speaker: 'Alex' as const, speakerRole: 'Deep Tech Host' as const, text: 'Intro to FNOL', durationSec: 7.4 },
    { id: 't2', speaker: 'Maya' as const, speakerRole: 'Practical Synthesizer' as const, text: 'Cloud API sync', durationSec: 8.6 },
    { id: 't3', speaker: 'Alex' as const, speakerRole: 'Deep Tech Host' as const, text: 'Gosu reserve authority', durationSec: 6.0 }
  ];

  const timed = computeTranscriptTurnsWithOffsets(turns);
  assert.equal(timed[0].timestampLabel, '00:00');
  assert.equal(timed[1].timestampLabel, '00:07');
  assert.equal(timed[2].timestampLabel, '00:16');

  const mayaOnly = filterTranscriptTurns(timed, 'Maya', '');
  assert.equal(mayaOnly.length, 1);
  assert.equal(mayaOnly[0].originalIndex, 1);

  const gosuSearch = filterTranscriptTurns(timed, 'all', 'reserve');
  assert.equal(gosuSearch.length, 1);
  assert.equal(gosuSearch[0].originalIndex, 2);

  const text = formatEpisodeTranscriptText('FNOL Deep Dive', turns);
  assert.match(text, /\[00:07\] Maya \(Practical Synthesizer\): Cloud API sync/);
});
