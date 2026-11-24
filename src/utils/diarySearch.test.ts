import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialCoreDataStore, upsertCoreDataDocument } from './coreDataVectorDb.ts';
import { createDiaryEntry } from './workspaceScheduler.ts';
import { searchOfficeDiaryEntries, splitHighlightSegments } from './diarySearch.ts';

test('searchOfficeDiaryEntries ranks exact keyword matches first and includes semantic hits via CoreData vector store', () => {
  const baseStore = createInitialCoreDataStore();

  const exactEntry = createDiaryEntry({
    id: 'diary-exact-1',
    dateIso: '2026-11-20',
    title: 'ClaimCenter API Timeout Fix',
    content: 'Updated Cloud API gateway retry timeout for FNOL intake.',
    category: 'Decision',
    tags: ['ClaimCenter', 'FNOL']
  });

  const semanticOnlyEntry = createDiaryEntry({
    id: 'diary-sem-2',
    dateIso: '2026-11-19',
    title: 'Afternoon Sync Follow-up',
    content: 'Reviewed intake routing rules with underwriting.',
    category: 'Note',
    tags: ['Intake']
  });

  // Store vector embedding for semanticOnlyEntry using existing CoreData index without touching exactEntry
  const { nextStore } = upsertCoreDataDocument(baseStore, {
    id: semanticOnlyEntry.id,
    title: semanticOnlyEntry.title,
    format: 'Note',
    assetKind: 'document',
    sizeKB: 1,
    text: 'Guidewire ClaimCenter FNOL intake routing escalation latency review.',
    tags: ['ClaimCenter', 'FNOL']
  });

  const result = searchOfficeDiaryEntries([semanticOnlyEntry, exactEntry], nextStore, {
    query: 'ClaimCenter FNOL',
    category: 'All'
  });

  assert.equal(result.entries.length, 2);
  // Exact match must appear before purely semantic match
  assert.equal(result.entries[0].id, exactEntry.id);
  assert.equal(result.entries[1].id, semanticOnlyEntry.id);
  assert.equal(result.hitMetaById[semanticOnlyEntry.id].matchKind, 'semantic');
});

test('searchOfficeDiaryEntries falls back cleanly to keyword search when an entry has no embedding', () => {
  const emptyStore = createInitialCoreDataStore();
  emptyStore.chunks = [];

  const noVecEntry = createDiaryEntry({
    id: 'diary-no-vec',
    dateIso: '2026-11-20',
    title: 'Vendor Security Audit Checklist',
    content: 'Verified SOC2 controls and API token rotation schedule.',
    category: 'Focus',
    tags: ['Security', 'Audit']
  });

  const otherEntry = createDiaryEntry({
    id: 'diary-other',
    dateIso: '2026-11-20',
    title: 'Lunch Catering Order',
    content: 'Confirmed sandwich platters for Thursday team sync.',
    category: 'Note',
    tags: ['Office']
  });

  const res = searchOfficeDiaryEntries([noVecEntry, otherEntry], emptyStore, {
    query: 'SOC2 rotation',
    category: 'All'
  });

  assert.equal(res.entries.length, 1);
  assert.equal(res.entries[0].id, noVecEntry.id);
  assert.equal(res.hitMetaById[noVecEntry.id].usedFallbackKeywordOnly, true);
});

test('searchOfficeDiaryEntries restores full list when cleared and returns empty when nothing matches', () => {
  const store = createInitialCoreDataStore();
  const e1 = createDiaryEntry({
    id: 'diary-a',
    dateIso: '2026-11-20',
    title: 'Morning Standup',
    content: 'Cleared all P1 blockers.',
    category: 'Focus'
  });
  const e2 = createDiaryEntry({
    id: 'diary-b',
    dateIso: '2026-11-21',
    title: 'Architecture Review',
    content: 'Signed off CoreData schema.',
    category: 'Decision'
  });

  const noHits = searchOfficeDiaryEntries([e1, e2], store, {
    query: 'nonexistent-xylophone-token',
    category: 'All'
  });
  assert.equal(noHits.entries.length, 0);

  const restored = searchOfficeDiaryEntries([e1, e2], store, {
    query: '',
    category: 'All'
  });
  assert.equal(restored.entries.length, 2);
});

test('splitHighlightSegments marks matching keywords case-insensitively', () => {
  const segments = splitHighlightSegments('Updated ClaimCenter FNOL gateway timeout.', [
    'claimcenter',
    'timeout'
  ]);
  const highlighted = segments.filter((s) => s.highlighted).map((s) => s.text);
  assert.deepEqual(highlighted, ['ClaimCenter', 'timeout']);
});
