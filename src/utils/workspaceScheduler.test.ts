import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOUD_SCHEDULER_MODELS,
  SCHEDULER_INTERVAL_SPECS,
  computeNextRunIso,
  createBackgroundAgentTask,
  createDiaryEntry,
  executeBackgroundAgentTaskCycle,
  filterDiaryEntries,
  groupDiaryEntriesByDate
} from './workspaceScheduler.ts';
import { createInitialCoreDataStore } from './coreDataVectorDb.ts';

test('Office Diary creation, filtering, and date grouping work accurately', () => {
  const e1 = createDiaryEntry(
    {
      dateIso: '2026-11-18',
      title: 'FNOL Reserve Check',
      content: 'Reviewed automatic reserve rules with ClaimCenter team.',
      category: 'Decision',
      tags: ['ClaimCenter', 'FNOL']
    },
    new Date('2026-11-18T10:15:00.000Z')
  );

  const e2 = createDiaryEntry(
    {
      dateIso: '2026-11-19',
      title: 'Auth Token Blocker',
      content: 'Need service account secret rotated for staging.',
      category: 'Blocker',
      tags: ['Security']
    },
    new Date('2026-11-19T09:00:00.000Z')
  );

  const all = [e1, e2];
  const blockers = filterDiaryEntries(all, { category: 'Blocker' });
  assert.equal(blockers.length, 1);
  assert.equal(blockers[0].title, 'Auth Token Blocker');

  const queryMatch = filterDiaryEntries(all, { query: 'fnol reserve' });
  assert.equal(queryMatch.length, 1);
  assert.equal(queryMatch[0].id, e1.id);

  const grouped = groupDiaryEntriesByDate(all);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].dateIso, '2026-11-19');
  assert.equal(grouped[1].dateIso, '2026-11-18');
});

test('Background Agentic Task Scheduler creates tasks and executes RAG-powered continuous cycles', () => {
  assert.ok(CLOUD_SCHEDULER_MODELS.length >= 4);
  assert.ok(SCHEDULER_INTERVAL_SPECS.length >= 4);

  const task = createBackgroundAgentTask({
    title: 'FNOL Reserve Monitor',
    prompt: 'Monitor ClaimCenter FNOL automatic reserve rules and summarize risks',
    cloudModelId: 'claude-3-7-sonnet',
    intervalId: '15s',
    ragEnabled: true,
    ragStrategyId: 'agentic',
    attachmentNames: ['claimcenter_spec.pdf']
  });

  assert.equal(task.status, 'running');
  assert.equal(task.runCount, 0);
  assert.equal(task.cloudModelLabel, 'Claude 3.7 Sonnet');
  assert.equal(task.ragStrategyId, 'agentic');

  const store = createInitialCoreDataStore();
  const afterRun1 = executeBackgroundAgentTaskCycle({
    task,
    store,
    now: new Date('2026-11-19T12:00:00.000Z')
  });

  assert.equal(afterRun1.runCount, 1);
  assert.equal(afterRun1.runHistory.length, 1);
  assert.ok(afterRun1.latestChunks.length > 0);
  assert.match(afterRun1.latestOutput, /Cycle #1/);
  assert.match(afterRun1.latestOutput, /Claude 3\.7 Sonnet/);
  assert.equal(
    afterRun1.nextRunIso,
    computeNextRunIso(task.intervalMs, new Date('2026-11-19T12:00:00.000Z').getTime())
  );

  // Subsequent run increments count and history cleanly
  const afterRun2 = executeBackgroundAgentTaskCycle({
    task: { ...afterRun1, ragEnabled: false },
    store,
    now: new Date('2026-11-19T12:00:15.000Z')
  });

  assert.equal(afterRun2.runCount, 2);
  assert.equal(afterRun2.runHistory.length, 2);
  assert.equal(afterRun2.latestChunks.length, 0);
  assert.match(afterRun2.latestOutput, /Direct Cloud AI execution/);
});
