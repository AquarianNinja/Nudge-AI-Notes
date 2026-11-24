import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_GENTEAM_AGENTS } from './genTeam.ts';
import { createBackgroundAgentTask } from './workspaceScheduler.ts';
import {
  buildAgentLanes,
  buildTimelineSlots,
  mapAgentToCloudModel,
  resolveTaskAgentId,
  resolveTaskTimelineSlotKey
} from './crewPlanner.ts';
import { RAG_STRATEGY_USER_CONFIG, getRagStrategyUserConfig } from './ragStrategiesConfig.ts';

test('crewPlanner maps tasks to agent lanes and computes live status & workload accurately', () => {
  const claudeTask = createBackgroundAgentTask({
    title: 'Claims SLA Check',
    prompt: 'Monitor ClaimCenter queue latency',
    cloudModelId: 'claude-3-7-sonnet',
    intervalId: '1m'
  });

  const explicitGeminiTask = createBackgroundAgentTask({
    title: 'Reassigned Audit',
    prompt: 'Verify policy endorsement changes',
    cloudModelId: 'claude-3-7-sonnet',
    intervalId: '5m',
    assignedAgentId: 'agent-gemini'
  });
  explicitGeminiTask.status = 'paused';

  const lanes = buildAgentLanes(INITIAL_GENTEAM_AGENTS, [claudeTask, explicitGeminiTask]);
  const claudeLane = lanes.find((l) => l.agent.id === 'agent-claude');
  const geminiLane = lanes.find((l) => l.agent.id === 'agent-gemini');
  const wisprLane = lanes.find((l) => l.agent.id === 'agent-wisprflow');

  assert.ok(claudeLane);
  assert.equal(claudeLane.status, 'working');
  assert.equal(claudeLane.workloadCount, 1);
  assert.equal(resolveTaskAgentId(explicitGeminiTask, INITIAL_GENTEAM_AGENTS), 'agent-gemini');

  assert.ok(geminiLane);
  assert.equal(geminiLane.status, 'scheduled-next');

  assert.ok(wisprLane);
  assert.equal(wisprLane.tasks.length, 0);
  assert.equal(wisprLane.workloadCount, 0);

  const idleAgent = { ...INITIAL_GENTEAM_AGENTS[2], activeTasksCount: 0 };
  const idleLanes = buildAgentLanes([idleAgent], []);
  assert.equal(idleLanes[0].status, 'idle');

  assert.equal(mapAgentToCloudModel(geminiLane.agent, 'claude-3-7-sonnet'), 'gemini-2-5-pro');
});

test('buildTimelineSlots and resolveTaskTimelineSlotKey support both day and week views', () => {
  const refDate = new Date('2026-11-20T12:15:00');
  const daySlots = buildTimelineSlots('day', refDate);
  const weekSlots = buildTimelineSlots('week', refDate);

  assert.equal(daySlots.length, 4);
  assert.equal(weekSlots.length, 7);

  const task = createBackgroundAgentTask(
    {
      title: 'Noon Sync',
      prompt: 'Check daily queue',
      cloudModelId: 'gpt-4o',
      intervalId: 'hourly',
      scheduledSlotIso: '2026-11-20T12:00:00'
    },
    refDate
  );

  assert.equal(resolveTaskTimelineSlotKey(task, daySlots, 'day'), '2026-11-20T12');
  assert.equal(resolveTaskTimelineSlotKey(task, weekSlots, 'week'), '2026-11-20');
});

test('RAG_STRATEGY_USER_CONFIG defines plain-language names and complete info guides for all 5 modes', () => {
  assert.equal(RAG_STRATEGY_USER_CONFIG.length, 5);
  for (const spec of RAG_STRATEGY_USER_CONFIG) {
    assert.ok(spec.friendlyName.length >= 6);
    assert.ok(spec.technicalName.length >= 6);
    assert.ok(spec.whatItDoes.length >= 20);
    assert.ok(spec.whenToUse.length >= 15);
    assert.ok(spec.tradeOff.length >= 10);
    assert.equal(getRagStrategyUserConfig(spec.id).friendlyName, spec.friendlyName);
  }
});
