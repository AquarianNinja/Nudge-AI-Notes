import test from 'node:test';
import assert from 'node:assert/strict';
import { GenTeamAgent, GenTeamTask } from '../types/index.ts';
import {
  DEFAULT_AGENT_TASK_CAPACITY,
  buildDeadlineIsoFromPreset,
  computeAgentTaskWorkloadSummary,
  formatTaskDeadlineMeta,
  sortPendingTasksByDeadline
} from './genTeamTaskSummary.ts';

const MOCK_AGENT: GenTeamAgent = {
  id: 'agent-claude',
  name: 'Claude',
  handle: '@claude',
  vendor: 'claude',
  modelName: 'Claude 3.7 Sonnet',
  roleTitle: 'Systems Architect',
  specialty: 'Architecture & Gosu',
  accent: 'amber',
  executionMode: 'cloud-sandbox',
  status: 'online',
  systemPrompt: 'Audit specs cleanly.',
  skills: ['Architecture'],
  activeTasksCount: 2,
  taskCapacity: 4
};

test('computeAgentTaskWorkloadSummary computes capacity-relative pending metrics and excludes done tasks', () => {
  const tasks: GenTeamTask[] = [
    {
      id: 't1',
      title: 'Validate Reserve Limit',
      description: 'Pre-update rule',
      status: 'todo',
      assigneeAgentId: 'agent-claude',
      channelId: 'ch-1',
      priority: 'High',
      updatedAt: '09:00 AM',
      deadlineIso: '2026-11-20T17:00:00.000Z'
    },
    {
      id: 't2',
      title: 'Review API Contract',
      description: 'Composite intake',
      status: 'in-progress',
      assigneeAgentId: 'agent-claude',
      channelId: 'ch-1',
      priority: 'Normal',
      updatedAt: '09:30 AM',
      deadlineIso: '2026-11-21T17:00:00.000Z'
    },
    {
      id: 't3',
      title: 'Verify Regression Suite',
      description: 'Run unit tests',
      status: 'in-review',
      assigneeAgentId: 'agent-claude',
      channelId: 'ch-1',
      priority: 'Normal',
      updatedAt: '10:00 AM'
    },
    {
      id: 't4',
      title: 'Completed Migration',
      description: 'Finished earlier',
      status: 'done',
      assigneeAgentId: 'agent-claude',
      channelId: 'ch-1',
      priority: 'High',
      updatedAt: '08:00 AM'
    },
    {
      id: 't5',
      title: 'Other Agent Task',
      description: 'Belongs to Gemini',
      status: 'todo',
      assigneeAgentId: 'agent-gemini',
      channelId: 'ch-1',
      priority: 'High',
      updatedAt: '10:15 AM'
    }
  ];

  const summary = computeAgentTaskWorkloadSummary(MOCK_AGENT, tasks);
  assert.equal(summary.capacity, 4);
  assert.equal(summary.pendingCount, 3);
  assert.equal(summary.completedCount, 1);
  assert.equal(summary.todoCount, 1);
  assert.equal(summary.inProgressCount, 1);
  assert.equal(summary.inReviewCount, 1);
  assert.equal(summary.rawUtilizationPct, 75);
  assert.equal(summary.ringProgressPct, 75);
  assert.equal(summary.loadState, 'elevated');
  assert.equal(summary.loadLabel, 'Busy');

  const defaultCapSummary = computeAgentTaskWorkloadSummary(
    { ...MOCK_AGENT, taskCapacity: undefined },
    tasks
  );
  assert.equal(defaultCapSummary.capacity, DEFAULT_AGENT_TASK_CAPACITY);
  assert.equal(defaultCapSummary.rawUtilizationPct, 60);
  assert.equal(defaultCapSummary.loadState, 'normal');
});

test('sortPendingTasksByDeadline orders earliest deadlines first, puts unscheduled last, and filters out done tasks', () => {
  const tasks: GenTeamTask[] = [
    {
      id: 'later',
      title: 'Next Week Audit',
      description: '',
      status: 'todo',
      assigneeAgentId: 'agent-claude',
      channelId: 'ch-1',
      priority: 'High',
      updatedAt: '09:00 AM',
      deadlineIso: '2026-11-27T17:00:00.000Z'
    },
    {
      id: 'none',
      title: 'Unscheduled Task',
      description: '',
      status: 'todo',
      assigneeAgentId: 'agent-claude',
      channelId: 'ch-1',
      priority: 'High',
      updatedAt: '09:00 AM'
    },
    {
      id: 'done',
      title: 'Done Task',
      description: '',
      status: 'done',
      assigneeAgentId: 'agent-claude',
      channelId: 'ch-1',
      priority: 'High',
      updatedAt: '09:00 AM',
      deadlineIso: '2026-11-19T17:00:00.000Z'
    },
    {
      id: 'soonest',
      title: 'Today Hotfix',
      description: '',
      status: 'in-progress',
      assigneeAgentId: 'agent-claude',
      channelId: 'ch-1',
      priority: 'Normal',
      updatedAt: '09:00 AM',
      deadlineIso: '2026-11-20T17:00:00.000Z'
    }
  ];

  const sorted = sortPendingTasksByDeadline(tasks, 'agent-claude');
  assert.deepEqual(
    sorted.map((t) => t.id),
    ['soonest', 'later', 'none']
  );
});

test('buildDeadlineIsoFromPreset and formatTaskDeadlineMeta resolve Today, Tomorrow, and Overdue cleanly', () => {
  const ref = new Date(2026, 10, 20, 9, 0, 0); // Nov 20, 2026
  const todayIso = buildDeadlineIsoFromPreset('today', ref);
  const tomorrowIso = buildDeadlineIsoFromPreset('tomorrow', ref);
  const overdueIso = new Date(2026, 10, 18, 17, 0, 0).toISOString();

  const todayMeta = formatTaskDeadlineMeta(todayIso, ref);
  assert.equal(todayMeta.urgency, 'today');
  assert.match(todayMeta.label, /Due Today/);

  const tomorrowMeta = formatTaskDeadlineMeta(tomorrowIso, ref);
  assert.equal(tomorrowMeta.urgency, 'soon');
  assert.match(tomorrowMeta.label, /Tomorrow/);

  const overdueMeta = formatTaskDeadlineMeta(overdueIso, ref);
  assert.equal(overdueMeta.urgency, 'overdue');
  assert.match(overdueMeta.label, /Overdue/);
});
