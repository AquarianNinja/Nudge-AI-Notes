import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Nanobot } from '../types/index.ts';
import {
  USER_ID_PATTERN,
  createCallsignItem,
  createUserIdentity,
  deleteCallsignItem,
  setActiveCallsign,
  updateCallsignItem
} from './identityCallsigns.ts';
import {
  NANOBOT_ENGINES,
  NANOBOT_STYLES,
  executeNanobotRunRecord,
  getModelsForEngine
} from './nanobotCatalog.ts';
import {
  SandboxPolicyError,
  appendBotSandboxMemory,
  assertBotSandboxAccess,
  buildSandboxId,
  provisionBotSandbox,
  readBotSandbox,
  resolveBotSandboxDir,
  wipeBotSandbox
} from './nanobotSandbox.ts';

test('UserIdentity generates immutable readable NB-XXXX-XXXX IDs and preserves existing ID', () => {
  const first = createUserIdentity({ linkedProvider: 'google', authUid: 'uid-123' });
  assert.match(first.userId, USER_ID_PATTERN);
  assert.equal(first.linkedProvider, 'google');

  const rehydrated = createUserIdentity({
    existingUserId: first.userId,
    createdAt: first.createdAt
  });
  assert.equal(rehydrated.userId, first.userId);
  assert.equal(rehydrated.createdAt, first.createdAt);
});

test('Callsigns permit duplicate display names, toggle active state atomically, edit, and delete', () => {
  const userId = 'NB-7F3K-92QX';
  const step1 = createCallsignItem({
    userId,
    displayName: 'Field Ops',
    avatar: '🧭',
    existingCallsigns: []
  });
  assert.equal(step1.created.isActive, true);

  // Duplicate display name is allowed!
  const step2 = createCallsignItem({
    userId,
    displayName: 'Field Ops',
    avatar: '⚡️',
    isActive: true,
    existingCallsigns: step1.callsigns
  });
  assert.equal(step2.callsigns.length, 2);
  assert.equal(step2.callsigns[0].displayName, 'Field Ops');
  assert.equal(step2.callsigns[1].displayName, 'Field Ops');
  assert.equal(step2.callsigns.filter((c) => c.isActive).length, 1);
  assert.equal(step2.callsigns[0].isActive, true);

  // Switch active back to first item
  const switched = setActiveCallsign(step2.callsigns, step1.created.id);
  assert.equal(switched.find((c) => c.id === step1.created.id)?.isActive, true);
  assert.equal(switched.find((c) => c.id === step2.created.id)?.isActive, false);

  // Edit callsign
  const edited = updateCallsignItem(switched, step2.created.id, {
    displayName: 'Night Watch',
    avatar: '🛰️'
  });
  assert.equal(edited.find((c) => c.id === step2.created.id)?.displayName, 'Night Watch');

  // Delete active callsign promotes remaining callsign
  const afterDelete = deleteCallsignItem(edited, step1.created.id);
  assert.equal(afterDelete.length, 1);
  assert.equal(afterDelete[0].isActive, true);
});

test('Nanobot engine catalog filters models strictly by engine and includes all 6 office styles', () => {
  assert.deepEqual(
    NANOBOT_ENGINES.map((e) => e.id),
    ['pulse', 'atlas', 'nova']
  );
  assert.equal(NANOBOT_STYLES.length, 6);

  const pulseModels = getModelsForEngine('pulse');
  const atlasModels = getModelsForEngine('atlas');
  const novaModels = getModelsForEngine('nova');

  assert.ok(pulseModels.length >= 2 && pulseModels.every((m) => m.engine === 'pulse'));
  assert.ok(atlasModels.length >= 2 && atlasModels.every((m) => m.engine === 'atlas'));
  assert.ok(novaModels.length >= 2 && novaModels.every((m) => m.engine === 'nova'));
});

test('Nanobot sandbox isolation blocks cross-bot & cross-user access and wipes directory on delete', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nanobot-sandbox-test-'));
  try {
    const botA: Nanobot = {
      id: 'bot-alpha',
      userId: 'NB-7F3K-92QX',
      name: 'Research Alpha',
      engine: 'atlas',
      styleId: 'researcher',
      modelId: 'atlas-gemini-flash',
      taskPrompt: 'Track claims guidelines',
      schedule: {
        cadence: 'daily',
        startTime: '09:00',
        notificationsEnabled: true
      },
      status: 'scheduled',
      sandboxId: buildSandboxId('bot-alpha'),
      consentTimestampIso: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const botB: Nanobot = {
      ...botA,
      id: 'bot-beta',
      name: 'Writer Beta',
      sandboxId: buildSandboxId('bot-beta')
    };

    const sbxA = await provisionBotSandbox(tmpRoot, botA);
    await provisionBotSandbox(tmpRoot, botB);
    assert.equal(sbxA.botId, 'bot-alpha');

    // Same bot read & memory append succeeds
    const afterMem = await appendBotSandboxMemory(
      tmpRoot,
      botA,
      botA.userId,
      botA.id,
      'Completed cited brief run #1'
    );
    assert.equal(afterMem.memoryEntries[0].summary, 'Completed cited brief run #1');

    // Cross-bot read/write/message throws 403 SandboxPolicyError
    await assert.rejects(
      () => readBotSandbox(tmpRoot, botA, botA.userId, botB.id),
      (err: unknown) => err instanceof SandboxPolicyError && err.statusCode === 403
    );

    await assert.rejects(
      () =>
        appendBotSandboxMemory(
          tmpRoot,
          botA,
          botA.userId,
          botB.id,
          'Attempted cross-bot memory injection'
        ),
      (err: unknown) => err instanceof SandboxPolicyError && err.statusCode === 403
    );

    // Cross-user access throws 403
    assert.throws(
      () =>
        assertBotSandboxAccess({
          actorUserId: 'NB-9999-AAAA',
          targetUserId: botA.userId,
          actorBotId: botA.id,
          targetBotId: botA.id,
          expectedSandboxId: botA.sandboxId
        }),
      (err: unknown) => err instanceof SandboxPolicyError && err.statusCode === 403
    );

    // Path traversal blocked
    assert.throws(
      () => resolveBotSandboxDir(tmpRoot, '../etc', botA.id),
      (err: unknown) => err instanceof SandboxPolicyError && err.statusCode === 400
    );

    // Execute run creates valid Run record
    const { updatedBot, run } = executeNanobotRunRecord(botA);
    assert.equal(run.botId, botA.id);
    assert.equal(run.userId, botA.userId);
    assert.equal(run.status, 'completed');
    assert.equal(updatedBot.status, 'scheduled');

    // Delete wipes botA sandbox while leaving botB sandbox intact
    await wipeBotSandbox(tmpRoot, botA.userId, botA.id);
    const botADir = resolveBotSandboxDir(tmpRoot, botA.userId, botA.id);
    const botBDir = resolveBotSandboxDir(tmpRoot, botB.userId, botB.id);
    await assert.rejects(() => fs.stat(botADir));
    const botBStat = await fs.stat(path.join(botBDir, 'sandbox.json'));
    assert.ok(botBStat.isFile());
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});
