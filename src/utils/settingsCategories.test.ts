import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_APP_SETTINGS,
  INITIAL_DICTIONARY_ENTRIES
} from '../data/mockData.ts';
import {
  LEGACY_LLM_MODELS,
  LEGACY_WHISPER_MODELS
} from './modelRegistry.ts';
import {
  SETTINGS_CATEGORIES,
  SETTINGS_CATEGORY_GROUPS,
  buildSettingsCategorySummaries,
  getSettingsCategoryMeta,
  resolveInitialSettingsCategory
} from './settingsCategories.ts';

describe('settingsCategories', () => {
  it('groups all settings categories uniquely across groups', () => {
    const groupedIds = SETTINGS_CATEGORY_GROUPS.flatMap(g => g.categoryIds);
    assert.equal(groupedIds.length, SETTINGS_CATEGORIES.length);
    assert.equal(new Set(groupedIds).size, SETTINGS_CATEGORIES.length);
  });

  it('defaults to null (categories overview) unless deep-linked to a valid category or legacy bucket', () => {
    assert.equal(resolveInitialSettingsCategory(null), null);
    assert.equal(resolveInitialSettingsCategory(undefined), null);
    assert.equal(resolveInitialSettingsCategory('models'), 'hub');
    assert.equal(resolveInitialSettingsCategory('speech'), 'hub');
    assert.equal(resolveInitialSettingsCategory('hub'), 'hub');
    assert.equal(resolveInitialSettingsCategory('callsigns'), 'callsigns');
    assert.equal(resolveInitialSettingsCategory('voice'), 'voice');
    assert.equal(resolveInitialSettingsCategory('features'), 'features');
    assert.equal(resolveInitialSettingsCategory('system'), 'system');
  });

  it('returns metadata for any category ID', () => {
    const hub = getSettingsCategoryMeta('hub');
    assert.equal(hub.title, 'Models, Audio & Dictation Hub');
    assert.equal(hub.group, 'intelligence');
    const features = getSettingsCategoryMeta('features');
    assert.equal(features.title, 'Features & Modules');
    assert.equal(features.group, 'system');
  });

  it('builds dynamic summaries reflecting motion preset, haptics state, local-only mode, and counts', () => {
    const summaries = buildSettingsCategorySummaries({
      settings: {
        ...DEFAULT_APP_SETTINGS,
        motionIntensity: 'fluid',
        offlineOnly: true,
        localOnly: true,
        haptics: {
          ...DEFAULT_APP_SETTINGS.haptics,
          enabled: false
        }
      },
      llmModels: LEGACY_LLM_MODELS,
      whisperModels: LEGACY_WHISPER_MODELS,
      driveFiles: [],
      dictionaryEntries: INITIAL_DICTIONARY_ENTRIES,
      liveProviderLabel: 'WhisperKit Local',
      isDeviceFrame: true,
      activeCallsignLabel: 'Field Ops',
      callsignCount: 2
    });

    assert.equal(summaries.callsigns.trailingLabel, '2');
    assert.match(summaries.callsigns.primarySummary, /Field Ops/);
    assert.equal(summaries.hub.trailingLabel, 'Local-Only');
    assert.equal(summaries.haptics.trailingLabel, 'Off');
    assert.match(summaries.haptics.primarySummary, /Muted/);
    assert.equal(summaries.drive.trailingLabel, '0');
    assert.match(summaries.drive.primarySummary, /No recordings/);
    assert.equal(summaries.dictionary.trailingLabel, String(INITIAL_DICTIONARY_ENTRIES.length));
    assert.equal(summaries.features.trailingLabel, '0/3');
    assert.match(summaries.features.primarySummary, /Deep Search only/);
    assert.match(summaries.system.primarySummary, /Fluid motion/);
    assert.match(summaries.system.primarySummary, /Local-Only Shield/);
    assert.match(summaries.system.primarySummary, /iPhone frame/);
  });
});
