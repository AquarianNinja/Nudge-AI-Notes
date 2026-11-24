import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BLUEPRINT_LIMITS,
  buildSanitizedCoreDataPayload,
  buildSanitizedDiaryPayload,
  buildSanitizedPreferencesPayload,
  buildSanitizedTaskPayload,
  sanitizeFirestoreId
} from './firestoreSync.ts';
import { DEFAULT_APP_SETTINGS } from '../data/mockData.ts';
import type {
  BackgroundAgentTask,
  CoreDataManagedDocument,
  OfficeDiaryEntry
} from '../types/index.ts';

test('sanitizeFirestoreId enforces rules regex ^[a-zA-Z0-9_-]+$ and length limit', () => {
  assert.equal(sanitizeFirestoreId('entry/123!@#', 'diary'), 'entry-123-');
  assert.match(sanitizeFirestoreId('ok_id-42'), BLUEPRINT_LIMITS.ID_PATTERN);
  assert.ok(sanitizeFirestoreId('x'.repeat(250)).length <= BLUEPRINT_LIMITS.ID_MAX);
});

test('buildSanitizedDiaryPayload clamps strings, arrays, and validates dateIso', () => {
  const entry: OfficeDiaryEntry = {
    id: 'bad$id',
    dateIso: 'not-a-date',
    dateLabel: 'Today',
    timeLabel: '10:00 AM',
    title: 'T'.repeat(300),
    content: 'C'.repeat(15000),
    category: 'Focus',
    tags: Array.from({ length: 20 }, (_, i) => `tag-${i}`),
    attachmentNames: Array.from({ length: 20 }, (_, i) => `file-${i}.pdf`),
    createdIso: '2026-11-19T10:00:00.000Z',
    updatedIso: '2026-11-19T10:00:00.000Z'
  };

  const payload = buildSanitizedDiaryPayload('user_123', entry);
  assert.match(payload.id, BLUEPRINT_LIMITS.ID_PATTERN);
  assert.equal(payload.ownerId, 'user_123');
  assert.match(payload.dateIso, BLUEPRINT_LIMITS.DATE_ISO_PATTERN);
  assert.ok(payload.title.length <= BLUEPRINT_LIMITS.DIARY_TITLE_MAX);
  assert.ok(payload.content.length <= BLUEPRINT_LIMITS.DIARY_CONTENT_MAX);
  assert.ok(payload.tags.length <= BLUEPRINT_LIMITS.DIARY_TAGS_MAX);
  assert.ok(payload.attachmentNames.length <= BLUEPRINT_LIMITS.DIARY_ATTACHMENTS_MAX);
});

test('buildSanitizedTaskPayload clamps numeric and text fields within firestore.rules bounds', () => {
  const task: BackgroundAgentTask = {
    id: 'task-1',
    title: 'Audit Policy',
    prompt: 'P'.repeat(6000),
    cloudModelId: 'claude-3-7-sonnet',
    cloudModelLabel: 'Claude 3.7 Sonnet',
    cloudProviderLabel: 'Anthropic',
    intervalId: '15s',
    intervalLabel: 'Every 15s',
    intervalMs: 100, // below min 1000
    status: 'running',
    ragEnabled: true,
    ragStrategyId: 'hybrid-rrf',
    attachmentNames: ['spec.pdf'],
    runCount: -5,
    createdAtIso: '2026-11-19T10:00:00.000Z',
    lastRunIso: null,
    nextRunIso: '2026-11-19T10:00:15.000Z',
    latestOutput: 'O'.repeat(20000),
    latestChunks: [],
    latestCitations: [],
    runHistory: []
  };

  const payload = buildSanitizedTaskPayload('user_abc', task);
  assert.equal(payload.ownerId, 'user_abc');
  assert.equal(payload.intervalMs, 1000);
  assert.equal(payload.runCount, 0);
  assert.equal(payload.lastRunIso, '');
  assert.ok(payload.prompt.length <= BLUEPRINT_LIMITS.TASK_PROMPT_MAX);
  assert.ok(payload.latestOutput.length <= BLUEPRINT_LIMITS.TASK_OUTPUT_MAX);
});

test('buildSanitizedCoreDataPayload and preferences payload match blueprint allowlists', () => {
  const doc: CoreDataManagedDocument = {
    managedObjectId: 'x-coredata://CDDocument/doc-1',
    cloudKitRecordName: 'CK-doc-1',
    entityName: 'CDDocument',
    id: 'doc-1',
    title: 'GuidewireFNOL.pdf',
    format: 'PDF',
    assetKind: 'document',
    sizeKB: 42,
    chunkCount: 6,
    embeddingDim: 128,
    dateAdded: 'Today',
    updatedIso: '2026-11-19T10:00:00.000Z',
    summary: 'Summary',
    contentExcerpt: 'Excerpt',
    tags: ['ClaimCenter'],
    syncState: 'synced'
  };

  const cdPayload = buildSanitizedCoreDataPayload('user_abc', doc);
  assert.equal(cdPayload.entityName, 'CDDocument');
  assert.equal(cdPayload.syncState, 'synced');

  assert.equal(DEFAULT_APP_SETTINGS.enableCrewPlanner, false);
  assert.equal(DEFAULT_APP_SETTINGS.enableOfficeDiary, false);
  assert.equal(DEFAULT_APP_SETTINGS.enableScoutFeature, false);

  const prefPayload = buildSanitizedPreferencesPayload('user_abc', {
    ...DEFAULT_APP_SETTINGS,
    localOnly: true,
    activeSttModelId: 'whisper-base-local',
    activeTextModelId: 'llama-3.2-3b-local',
    activeDictationModeId: 'translate-ab',
    translationEnabled: true,
    translationSourceLang: 'English (US)',
    translationTargetLang: 'Japanese',
    historyRetention: '30d',
    overlayStyle: 'panel',
    enableCrewPlanner: true,
    enableOfficeDiary: false,
    enableScoutFeature: true
  });
  assert.equal(prefPayload.id, 'app');
  assert.equal(prefPayload.ownerId, 'user_abc');
  assert.equal(prefPayload.localOnly, true);
  assert.equal(prefPayload.offlineOnly, true);
  assert.equal(prefPayload.activeSttModelId, 'whisper-base-local');
  assert.equal(prefPayload.activeTextModelId, 'llama-3.2-3b-local');
  assert.equal(prefPayload.activeDictationModeId, 'translate-ab');
  assert.equal(prefPayload.translationEnabled, true);
  assert.equal(prefPayload.translationSourceLang, 'English (US)');
  assert.equal(prefPayload.translationTargetLang, 'Japanese');
  assert.equal(prefPayload.historyRetention, '30d');
  assert.equal(prefPayload.overlayStyle, 'panel');
  assert.equal(prefPayload.enableCrewPlanner, true);
  assert.equal(prefPayload.enableOfficeDiary, false);
  assert.equal(prefPayload.enableScoutFeature, true);
  assert.equal('apiKeys' in prefPayload, false); // Secrets never synced to Firestore
});
