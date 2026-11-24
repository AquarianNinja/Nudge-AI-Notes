import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClientReportPdfBytes,
  checkStudioCloudReadiness,
  exportAnnotatedTranscriptToMarkdown,
  exportGwtCriteriaToMarkdown,
  generateAnnotatedTranscript,
  generateClientPdfReport,
  generateGwtCriteriaFromPdfText,
  SIMULATED_REQUIREMENTS_PDF_TEXT
} from './studioEngine.ts';
import { resolvePodcastVoiceProfile } from './audioSynthesis.ts';
import {
  DEFAULT_APP_SETTINGS,
  INITIAL_DICTIONARY_ENTRIES
} from '../data/mockData.ts';
import { INITIAL_MEETING_SESSION } from './meetingNotes.ts';

test('checkStudioCloudReadiness strictly enforces paid Cloud API keys and blocks offline mode', () => {
  const noKey = checkStudioCloudReadiness(DEFAULT_APP_SETTINGS);
  assert.equal(noKey.ready, false);
  assert.match(noKey.reason || '', /paid Cloud API key/);

  const withGemini = checkStudioCloudReadiness({
    ...DEFAULT_APP_SETTINGS,
    apiKeys: { ...DEFAULT_APP_SETTINGS.apiKeys, gemini: 'AIzaSyValidCloudKey99' }
  });
  assert.equal(withGemini.ready, true);
  assert.equal(withGemini.activeProvider, 'gemini');
  assert.equal(withGemini.providerLabel, 'Google Gemini');

  const preferredOpenAi = checkStudioCloudReadiness(
    {
      ...DEFAULT_APP_SETTINGS,
      apiKeys: {
        ...DEFAULT_APP_SETTINGS.apiKeys,
        gemini: 'AIzaSyValidCloudKey99',
        openai: 'sk-proj-validstudio99'
      }
    },
    'openai'
  );
  assert.equal(preferredOpenAi.ready, true);
  assert.equal(preferredOpenAi.activeProvider, 'openai');

  const blockedOffline = checkStudioCloudReadiness({
    ...DEFAULT_APP_SETTINGS,
    offlineOnly: true,
    apiKeys: { ...DEFAULT_APP_SETTINGS.apiKeys, anthropic: 'sk-ant-api03-validkey99' }
  });
  assert.equal(blockedOffline.ready, false);
  assert.match(blockedOffline.reason || '', /Local-Only \/ Offline Mode/);
});

test('generateGwtCriteriaFromPdfText extracts ClaimCenter Given/When/Then criteria and exports markdown', () => {
  const criteria = generateGwtCriteriaFromPdfText(
    SIMULATED_REQUIREMENTS_PDF_TEXT,
    'ClaimCenter_FNOL_PRD.pdf',
    'Anthropic'
  );
  assert.equal(criteria.length, 5);
  assert.equal(criteria[0].storyCode, 'CC-FNOL-101');
  assert.ok(criteria.some(c => c.storyCode === 'CC-RSV-103'));

  const md = exportGwtCriteriaToMarkdown(criteria, 'ClaimCenter_FNOL_PRD.pdf', 'Anthropic');
  assert.match(md, /Business Acceptance Criteria \(GWT\)/);
  assert.match(md, /\*\*Given\*\*/);
  assert.match(md, /\*\*When\*\*/);
  assert.match(md, /\*\*Then\*\*/);
});

test('generateClientPdfReport and buildClientReportPdfBytes generate valid downloadable %PDF-1.4 bytes', () => {
  const report = generateClientPdfReport({
    clientName: 'Apex Mutual Insurance',
    preparedFor: 'Claims Architecture Steering Committee',
    tone: 'Executive',
    session: INITIAL_MEETING_SESSION,
    gwtCount: 5,
    providerLabel: 'OpenAI'
  });
  assert.match(report.title, /Apex Mutual Insurance/);
  assert.ok(report.decisions.length >= 1);

  const bytes = buildClientReportPdfBytes(report);
  const decoded = new TextDecoder('latin1').decode(bytes);
  assert.ok(decoded.startsWith('%PDF-1.4'));
  assert.ok(decoded.trimEnd().endsWith('%%EOF'));
  assert.match(decoded, /Apex Mutual Insurance/);
  assert.match(decoded, /Helvetica-Bold/);
});

test('generateAnnotatedTranscript enriches meeting highlights with semantic tags and dictionary links', () => {
  const annotated = generateAnnotatedTranscript(
    INITIAL_MEETING_SESSION,
    INITIAL_DICTIONARY_ENTRIES,
    'Google Gemini'
  );
  assert.equal(annotated.length, INITIAL_MEETING_SESSION.highlights.length);
  assert.ok(annotated.some(a => a.annotations.some(t => t.type === 'ENTITY' || t.type === 'RULE')));
  assert.ok(annotated.some(a => a.linkedDictionaryTerms.includes('ClaimCenter') || a.linkedDictionaryTerms.includes('FNOL')));

  const md = exportAnnotatedTranscriptToMarkdown(annotated, INITIAL_MEETING_SESSION.title, 'Google Gemini');
  assert.match(md, /Annotated Structured Transcript/);
});

test('resolvePodcastVoiceProfile differentiates trained personal voice vs open-source cloud voice mods', () => {
  const defaultMod = resolvePodcastVoiceProfile(DEFAULT_APP_SETTINGS.voiceProfile);
  assert.equal(defaultMod.isPersonalTrained, false);
  assert.match(defaultMod.engineLabel, /Dia 1\.6B/);

  const trained = resolvePodcastVoiceProfile({
    ...DEFAULT_APP_SETTINGS.voiceProfile,
    activeMode: 'trained-personal',
    personalProfile: {
      ...DEFAULT_APP_SETTINGS.voiceProfile.personalProfile,
      name: 'Founder Voice',
      samplesCompleted: 3,
      status: 'ready',
      pitchMultiplier: 0.92,
      rateMultiplier: 1.05
    }
  });
  assert.equal(trained.isPersonalTrained, true);
  assert.match(trained.hostAlexLabel, /Founder Voice/);
  assert.equal(trained.alexPitch, 0.92);
});
