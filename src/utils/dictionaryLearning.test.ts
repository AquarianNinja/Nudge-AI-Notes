import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCustomDictionaryWithAgents,
  extractDomainTermsFromText,
  extractTextFromPdfBytesOrString,
  formatDictionaryTermsCsv,
  learnTermsFromContext
} from './dictionaryLearning.ts';
import { DEFAULT_APP_SETTINGS, INITIAL_DICTIONARY_ENTRIES } from '../data/mockData.ts';

test('extractTextFromPdfBytesOrString parses PDF text operators and plain text cleanly', () => {
  const samplePdf = `%PDF-1.4
1 0 obj << /Type /Page >> endobj
stream
BT /F1 12 Tf (Maya: Route Jutro FNOL through Cloud API and BillingCenter.) Tj
(Alex: Keep TransactionSet authority inside Gosu pre-update rules.) Tj ET
endstream`;

  const extracted = extractTextFromPdfBytesOrString(samplePdf, 'fnol_architecture_notes.pdf');
  assert.match(extracted, /Jutro FNOL/);
  assert.match(extracted, /BillingCenter/);
  assert.match(extracted, /TransactionSet/);

  const plain = extractTextFromPdfBytesOrString('FNOL SubrogationSummary test', 'notes.txt');
  assert.equal(plain, 'FNOL SubrogationSummary test');
});

test('extractDomainTermsFromText extracts ClaimCenter entities, camelCase classes, acronyms, and speakers', () => {
  const text =
    'Maya confirmed Jutro submits ClaimCenter FNOL via Cloud API while BillingCenter reconciles ExposureLifecycle reserves under SIU SLA rules.';
  const terms = extractDomainTermsFromText(text, ['Maya (Architect)', 'Alex (Tech Lead)']);
  const names = terms.map(t => t.term);

  assert.ok(names.includes('ClaimCenter'));
  assert.ok(names.includes('Jutro'));
  assert.ok(names.includes('BillingCenter'));
  assert.ok(names.includes('ExposureLifecycle'));
  assert.ok(names.includes('SIU'));
  assert.ok(names.includes('SLA'));
  assert.ok(names.includes('Maya'));
});

test('learnTermsFromContext adds new terms from transcript PDF and increments existing occurrences', () => {
  const res = learnTermsFromContext(INITIAL_DICTIONARY_ENTRIES, {
    text: 'Uploaded PDF covers FNOL intake with Jutro, BillingCenter ledger sync, and ExposureLifecycle.',
    source: 'transcript-pdf',
    sourceFile: 'carrier_fnol_transcript.pdf',
    learnedAt: '14:20'
  });

  assert.ok(res.addedCount >= 2);
  assert.ok(res.updatedCount >= 1);

  const jutro = res.entries.find(e => e.term === 'Jutro');
  assert.ok(jutro);
  assert.equal(jutro.source, 'transcript-pdf');
  assert.equal(jutro.sourceFile, 'carrier_fnol_transcript.pdf');
  assert.equal(jutro.verifiedByAgent, false);

  const fnol = res.entries.find(e => e.term === 'FNOL');
  assert.ok(fnol);
  assert.equal(fnol.occurrences, 6);
});

test('buildCustomDictionaryWithAgents requires paid key / online mode and enriches dictionary when ready', () => {
  const blocked = buildCustomDictionaryWithAgents(
    INITIAL_DICTIONARY_ENTRIES,
    'anthropic',
    DEFAULT_APP_SETTINGS
  );
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason || '', /Anthropic paid API key/);

  const offlineBlocked = buildCustomDictionaryWithAgents(
    INITIAL_DICTIONARY_ENTRIES,
    'openai',
    {
      ...DEFAULT_APP_SETTINGS,
      offlineOnly: true,
      apiKeys: { ...DEFAULT_APP_SETTINGS.apiKeys, openai: 'sk-proj-validkey123' }
    }
  );
  assert.equal(offlineBlocked.ok, false);
  assert.match(offlineBlocked.reason || '', /Local-Only Mode/);

  const readySettings = {
    ...DEFAULT_APP_SETTINGS,
    offlineOnly: false,
    apiKeys: { ...DEFAULT_APP_SETTINGS.apiKeys, openai: 'sk-proj-validkey123' }
  };
  const learned = learnTermsFromContext(INITIAL_DICTIONARY_ENTRIES, {
    text: 'Check ExposureLifecycle in BillingCenter.',
    source: 'transcript-pdf',
    sourceFile: 'transcript.pdf'
  });

  const built = buildCustomDictionaryWithAgents(learned.entries, 'openai', readySettings);
  assert.equal(built.ok, true);
  assert.equal(built.stages.length, 3);
  assert.ok(built.entries.every(e => e.verifiedByAgent));
  assert.ok(built.entries.some(e => e.term === 'Composite API'));
  assert.match(formatDictionaryTermsCsv(built.entries), /ClaimCenter/);
});
