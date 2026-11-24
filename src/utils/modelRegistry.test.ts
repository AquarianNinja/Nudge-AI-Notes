import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_APP_SETTINGS } from '../data/mockData.ts';
import {
  UNIFIED_MODELS,
  applyUnifiedSettingsPatch,
  filterUnifiedModels,
  getUnifiedModelById,
  migrateLegacyAppSettings,
  resolveModelAvailability
} from './modelRegistry.ts';

test('resolveModelAvailability locks cloud models in Local-Only Mode and surfaces missing BYOK keys', () => {
  const gemini = getUnifiedModelById('gemini-4-hydrogen')!;
  const groq = getUnifiedModelById('groq-whisper-large-v3-turbo')!;
  const tinyLocal = getUnifiedModelById('whisper-tiny-local')!;
  const smallLocal = getUnifiedModelById('whisper-small-local')!;
  const speaches = getUnifiedModelById('speaches-localhost')!;

  // Cloud models allowed online (with key for BYOK, or zero-config for Gemini gateway)
  assert.equal(
    resolveModelAvailability(gemini, DEFAULT_APP_SETTINGS, new Set()).status,
    'ready'
  );
  const groqMissing = resolveModelAvailability(groq, DEFAULT_APP_SETTINGS, new Set());
  assert.equal(groqMissing.status, 'missing-key');
  assert.equal(groqMissing.selectable, false);
  assert.match(groqMissing.reason || '', /Groq API key/i);

  const groqReady = resolveModelAvailability(
    groq,
    { ...DEFAULT_APP_SETTINGS, apiKeys: { ...DEFAULT_APP_SETTINGS.apiKeys, groq: 'gsk_validkey12345' } },
    new Set()
  );
  assert.equal(groqReady.status, 'ready');
  assert.equal(groqReady.selectable, true);

  // Under Local-Only Mode, cloud models are explicitly blocked
  const localSettings = { ...DEFAULT_APP_SETTINGS, localOnly: true, offlineOnly: true };
  const blockedGemini = resolveModelAvailability(gemini, localSettings, new Set());
  assert.equal(blockedGemini.status, 'locked-local-only');
  assert.equal(blockedGemini.selectable, false);
  assert.match(blockedGemini.reason || '', /Local-Only/i);

  // Cached local models and loopback localhost models remain selectable offline
  assert.equal(
    resolveModelAvailability(tinyLocal, localSettings, new Set()).status,
    'cached'
  );
  assert.equal(
    resolveModelAvailability(smallLocal, localSettings, new Set(['whisper-small-local'])).status,
    'cached'
  );
  assert.equal(
    resolveModelAvailability(smallLocal, localSettings, new Set()).selectable,
    false
  );
  const speachesAvail = resolveModelAvailability(speaches, localSettings, new Set());
  assert.equal(speachesAvail.status, 'ready');
  assert.equal(speachesAvail.selectable, true);
  assert.match(speachesAvail.reason || '', /Loopback LAN/i);
});

test('filterUnifiedModels filters by category, runtime, realtime, translate, and search query', () => {
  const localTranslate = filterUnifiedModels({ runtime: 'local', translateOnly: true });
  assert.ok(localTranslate.length >= 2);
  assert.equal(localTranslate.every((m) => m.runtime === 'local' && m.capabilities.translate), true);

  const sttRealtime = filterUnifiedModels({ category: 'stt', realtimeOnly: true });
  assert.ok(sttRealtime.some((m) => m.id === 'whisper-tiny-local'));
  assert.equal(sttRealtime.every((m) => m.category === 'stt' && m.capabilities.realtime), true);

  const groqOnly = filterUnifiedModels({ search: 'groq' });
  assert.ok(groqOnly.some((m) => m.id === 'groq-whisper-large-v3-turbo'));
});

test('applyUnifiedSettingsPatch synchronizes localOnly/offlineOnly and falls back active cloud models', () => {
  const cloudStart = {
    ...DEFAULT_APP_SETTINGS,
    localOnly: false,
    offlineOnly: false,
    activeSttModelId: 'gemini-3.5-transcribe',
    activeTextModelId: 'gemini-4-hydrogen',
    ttsEngine: 'secure-cloud' as const
  };

  const switchedToLocalOnly = applyUnifiedSettingsPatch(cloudStart, { localOnly: true });
  assert.equal(switchedToLocalOnly.localOnly, true);
  assert.equal(switchedToLocalOnly.offlineOnly, true);
  assert.equal(switchedToLocalOnly.activeSttModelId, 'whisper-tiny-local');
  assert.equal(switchedToLocalOnly.activeTextModelId, 'llama-3.2-3b-local');
  assert.equal(switchedToLocalOnly.ttsEngine, 'on-device');
  assert.equal(switchedToLocalOnly.liveProviderId, 'whisperkit-local');
});

test('migrateLegacyAppSettings upgrades older Whisper/LLM IDs cleanly', () => {
  const migrated = migrateLegacyAppSettings({
    activeWhisperId: 'apple-neural-speech',
    activeLlmId: 'llama-3-8b-q4',
    offlineOnly: true
  });

  assert.equal(migrated.localOnly, true);
  assert.equal(migrated.offlineOnly, true);
  assert.equal(migrated.activeSttModelId, 'parakeet-v2-local');
  assert.equal(migrated.activeTextModelId, 'llama-3-8b-local');
  assert.ok(UNIFIED_MODELS.some((m) => m.id === migrated.activeSttModelId));
});
