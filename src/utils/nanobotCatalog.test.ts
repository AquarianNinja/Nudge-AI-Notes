import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NANOBOT_ENGINES,
  NANOBOT_STYLES,
  computeNextNanobotRunIso,
  executeNanobotRunRecord,
  getModelsForEngine
} from './nanobotCatalog.ts';
import type { Nanobot } from '../types/index.ts';

test('getModelsForEngine filters models strictly by selected engine', () => {
  for (const engine of NANOBOT_ENGINES) {
    const models = getModelsForEngine(engine.id);
    assert.ok(models.length >= 2, `Engine ${engine.id} should have >= 2 models`);
    for (const model of models) {
      assert.equal(model.engine, engine.id);
    }
  }
});

test('all 6 office work styles expose system prompt, format, and tone', () => {
  assert.equal(NANOBOT_STYLES.length, 6);
  const expectedIds = ['researcher', 'analyst', 'scheduler', 'writer', 'inbox-admin', 'developer'];
  assert.deepEqual(
    NANOBOT_STYLES.map((s) => s.id),
    expectedIds
  );
  for (const style of NANOBOT_STYLES) {
    assert.ok(style.systemPrompt.length > 20);
    assert.ok(style.outputFormat.length > 5);
    assert.ok(style.tone.length > 5);
  }
});

test('executeNanobotRunRecord transitions once-bots to completed and recurring-bots to scheduled', () => {
  const baseNow = new Date('2026-11-20T12:00:00.000Z');
  const onceBot: Nanobot = {
    id: 'bot-once',
    userId: 'NB-7F3K-92QX',
    name: 'Briefing Pulse',
    engine: 'pulse',
    styleId: 'researcher',
    modelId: 'pulse-gemini-flash-lite',
    taskPrompt: 'Summarize Q4 risk headlines',
    schedule: { cadence: 'once', startTime: '09:00', notificationsEnabled: true },
    status: 'scheduled',
    sandboxId: 'sbx-bot-once',
    consentTimestampIso: baseNow.toISOString(),
    createdAt: baseNow.toISOString(),
    updatedAt: baseNow.toISOString()
  };

  const onceResult = executeNanobotRunRecord(onceBot, baseNow);
  assert.equal(onceResult.run.status, 'completed');
  assert.equal(onceResult.updatedBot.status, 'completed');
  assert.equal(onceResult.updatedBot.schedule.nextRunIso, undefined);
  assert.ok(onceResult.run.output.includes('Pulse'));

  const dailyBot: Nanobot = {
    ...onceBot,
    id: 'bot-daily',
    engine: 'atlas',
    modelId: 'atlas-gemini-flash',
    schedule: { cadence: 'daily', startTime: '09:00', notificationsEnabled: false }
  };

  const dailyResult = executeNanobotRunRecord(dailyBot, baseNow);
  assert.equal(dailyResult.updatedBot.status, 'scheduled');
  assert.ok(dailyResult.updatedBot.schedule.nextRunIso);
  assert.ok(dailyResult.run.output.includes('Atlas'));

  const customNext = computeNextNanobotRunIso(
    { cadence: 'custom', startTime: '09:00', customIntervalMinutes: 10, notificationsEnabled: false },
    baseNow
  );
  assert.equal(customNext, '2026-11-20T12:10:00.000Z');
});
