import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkActivityReadiness,
  checkCloudAgentReadiness,
  checkLiveTranscriptionReadiness,
  countConfiguredApiKeys,
  getDefaultModelForApproach,
  getModelsForActivity,
  maskApiKey,
  parseSpeakerLabels,
  validateApiKeyFormat
} from './providerRouting.ts';
import { DEFAULT_APP_SETTINGS } from '../data/mockData.ts';

test('validateApiKeyFormat enforces provider prefixes and length', () => {
  assert.equal(validateApiKeyFormat('openai', '').valid, false);
  assert.equal(validateApiKeyFormat('openai', 'abc12345').valid, false);
  assert.equal(validateApiKeyFormat('openai', 'sk-proj-12345678').valid, true);

  assert.equal(validateApiKeyFormat('anthropic', 'sk-12345678').valid, false);
  assert.equal(validateApiKeyFormat('anthropic', 'sk-ant-api03-123456').valid, true);

  assert.equal(validateApiKeyFormat('gemini', 'badkey12345').valid, false);
  assert.equal(validateApiKeyFormat('gemini', 'AIzaSyTestKey123').valid, true);

  assert.equal(validateApiKeyFormat('deepgram', 'dg_live_123456').valid, true);
});

test('maskApiKey safely obscures API secrets', () => {
  assert.equal(maskApiKey(''), 'Not set');
  assert.equal(maskApiKey('short'), '••••••••');
  assert.equal(maskApiKey('sk-ant-api03-9988'), 'sk-a••••9988');
});

test('getModelsForActivity returns compatible models per execution approach', () => {
  const localNotes = getModelsForActivity('meetingNotes', 'local');
  assert.equal(localNotes.every(m => !m.requiresPaidKey), true);

  const cloudTranscription = getModelsForActivity('transcription', 'cloud');
  assert.equal(cloudTranscription.some(m => m.id === 'deepgram-nova-3-diarize'), true);
  assert.equal(cloudTranscription.every(m => m.speakerIdCapable), true);

  const hybridSlides = getModelsForActivity('slideDeck', 'hybrid');
  assert.ok(hybridSlides.length >= 4);
  assert.equal(hybridSlides[0].requiresPaidKey, true);
});

test('checkActivityReadiness blocks cloud models without paid keys and unblocks once entered', () => {
  const missingKeySettings = {
    ...DEFAULT_APP_SETTINGS,
    activityRoutes: {
      ...DEFAULT_APP_SETTINGS.activityRoutes,
      meetingNotes: { approach: 'cloud' as const, modelId: 'claude-sonnet-4-notes' }
    }
  };

  const blocked = checkActivityReadiness('meetingNotes', missingKeySettings);
  assert.equal(blocked.ready, false);
  assert.equal(blocked.missingProvider, 'anthropic');

  const readySettings = {
    ...missingKeySettings,
    apiKeys: {
      ...missingKeySettings.apiKeys,
      anthropic: 'sk-ant-api03-validkey99'
    }
  };
  const unblocked = checkActivityReadiness('meetingNotes', readySettings);
  assert.equal(unblocked.ready, true);
  assert.equal(unblocked.pipelineSummary, 'Cloud · Claude Sonnet 4');
});

test('checkActivityReadiness respects offline air-gap mode for cloud and hybrid', () => {
  const offlineHybrid = {
    ...DEFAULT_APP_SETTINGS,
    offlineOnly: true,
    apiKeys: { ...DEFAULT_APP_SETTINGS.apiKeys, deepgram: 'dg_1234567890' },
    activityRoutes: {
      ...DEFAULT_APP_SETTINGS.activityRoutes,
      transcription: { approach: 'hybrid' as const, modelId: 'deepgram-nova-3-diarize' }
    }
  };

  const status = checkActivityReadiness('transcription', offlineHybrid);
  assert.equal(status.ready, false);
  assert.match(status.reason || '', /Local-Only Mode/);
});

test('checkActivityReadiness validates custom endpoint configuration', () => {
  const customEmpty = {
    ...DEFAULT_APP_SETTINGS,
    customEndpoint: {
      ...DEFAULT_APP_SETTINGS.customEndpoint,
      baseUrl: ''
    },
    activityRoutes: {
      ...DEFAULT_APP_SETTINGS.activityRoutes,
      slideDeck: { approach: 'custom' as const, modelId: 'custom-slides-endpoint' }
    }
  };

  assert.equal(checkActivityReadiness('slideDeck', customEmpty).ready, false);

  const customValid = {
    ...DEFAULT_APP_SETTINGS,
    activityRoutes: {
      ...DEFAULT_APP_SETTINGS.activityRoutes,
      slideDeck: { approach: 'custom' as const, modelId: 'custom-slides-endpoint' }
    }
  };
  const ok = checkActivityReadiness('slideDeck', customValid);
  assert.equal(ok.ready, true);
  assert.equal(ok.pipelineSummary, 'Custom · claimcenter-llama-70b');
});

test('parseSpeakerLabels and countConfiguredApiKeys work accurately', () => {
  assert.deepEqual(parseSpeakerLabels('Maya, Alex , '), ['Maya', 'Alex']);
  assert.equal(countConfiguredApiKeys(DEFAULT_APP_SETTINGS), 0);

  const withKeys = {
    ...DEFAULT_APP_SETTINGS,
    apiKeys: {
      ...DEFAULT_APP_SETTINGS.apiKeys,
      openai: 'sk-proj-valid1234',
      gemini: 'AIzaSyValid12345'
    }
  };
  assert.equal(countConfiguredApiKeys(withKeys), 2);
  assert.equal(getDefaultModelForApproach('slideDeck', 'local').provider, 'local');
});

test('checkLiveTranscriptionReadiness enforces paid plan live streaming support and API keys', () => {
  // Default on-device streaming is always ready
  const localLive = checkLiveTranscriptionReadiness(DEFAULT_APP_SETTINGS);
  assert.equal(localLive.ready, true);

  // Deepgram requires paid API key
  const dgMissing = checkLiveTranscriptionReadiness({
    ...DEFAULT_APP_SETTINGS,
    liveProviderId: 'deepgram-live'
  });
  assert.equal(dgMissing.ready, false);
  assert.equal(dgMissing.missingProvider, 'deepgram');

  const dgReady = checkLiveTranscriptionReadiness({
    ...DEFAULT_APP_SETTINGS,
    liveProviderId: 'deepgram-live',
    apiKeys: { ...DEFAULT_APP_SETTINGS.apiKeys, deepgram: 'dg_paid_key_123456' }
  });
  assert.equal(dgReady.ready, true);
  assert.match(dgReady.pipelineSummary, /Deepgram Nova-3 Live/);

  // Anthropic does NOT support native live ASR audio streaming even with a paid key
  const anthropicLive = checkLiveTranscriptionReadiness({
    ...DEFAULT_APP_SETTINGS,
    liveProviderId: 'anthropic-no-live',
    apiKeys: { ...DEFAULT_APP_SETTINGS.apiKeys, anthropic: 'sk-ant-api03-validkey99' }
  });
  assert.equal(anthropicLive.ready, false);
  assert.match(anthropicLive.reason || '', /does not provide a native live audio ASR endpoint/);

  // Offline mode pauses cloud live streaming
  const pausedLive = checkLiveTranscriptionReadiness({
    ...DEFAULT_APP_SETTINGS,
    offlineOnly: true,
    liveProviderId: 'openai-realtime',
    apiKeys: { ...DEFAULT_APP_SETTINGS.apiKeys, openai: 'sk-proj-validkey123' }
  });
  assert.equal(pausedLive.ready, false);
  assert.match(pausedLive.reason || '', /Local-Only Mode/);

  // Cloud Agent readiness
  assert.equal(
    checkCloudAgentReadiness('gemini', {
      ...DEFAULT_APP_SETTINGS,
      apiKeys: { ...DEFAULT_APP_SETTINGS.apiKeys, gemini: 'AIzaSyValidKey123' }
    }).ready,
    true
  );
});
