import { GenTeamAgent, GenTeamTask } from '../types/index.ts';

export const DEFAULT_AGENT_TASK_CAPACITY = 5;

export type DeadlinePresetId = 'today' | 'tomorrow' | 'three-days' | 'next-week';

export interface DeadlinePresetOption {
  id: DeadlinePresetId;
  label: string;
  daysOffset: number;
}

export const DEADLINE_PRESETS: readonly DeadlinePresetOption[] = [
  { id: 'today', label: 'Today', daysOffset: 0 },
  { id: 'tomorrow', label: 'Tomorrow', daysOffset: 1 },
  { id: 'three-days', label: '+3 Days', daysOffset: 3 },
  { id: 'next-week', label: 'Next Week', daysOffset: 7 }
];

export type WorkloadLoadState = 'clear' | 'normal' | 'elevated' | 'at-capacity';

export interface AgentTaskWorkloadSummary {
  agentId: string;
  capacity: number;
  pendingCount: number;
  completedCount: number;
  totalCount: number;
  todoCount: number;
  inProgressCount: number;
  inReviewCount: number;
  rawUtilizationPct: number;
  ringProgressPct: number;
  loadState: WorkloadLoadState;
  loadLabel: string;
}

export type TaskDeadlineUrgency = 'overdue' | 'today' | 'soon' | 'upcoming' | 'none';

export interface TaskDeadlineMeta {
  label: string;
  shortDate: string;
  urgency: TaskDeadlineUrgency;
}

export function buildDeadlineIsoFromPreset(
  presetId: DeadlinePresetId,
  referenceDate: Date = new Date()
): string {
  const preset = DEADLINE_PRESETS.find((p) => p.id === presetId) ?? DEADLINE_PRESETS[1];
  const target = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate() + preset.daysOffset,
    17,
    0,
    0,
    0
  );
  return target.toISOString();
}

export function buildDeadlineIsoByDaysOffset(
  daysOffset: number,
  hour = 17,
  referenceDate: Date = new Date()
): string {
  const target = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate() + daysOffset,
    hour,
    0,
    0,
    0
  );
  return target.toISOString();
}

export function computeAgentTaskWorkloadSummary(
  agent: Pick<GenTeamAgent, 'id' | 'taskCapacity'>,
  tasks: readonly GenTeamTask[]
): AgentTaskWorkloadSummary {
  const agentTasks = tasks.filter((t) => t.assigneeAgentId === agent.id);
  const pendingTasks = agentTasks.filter((t) => t.status !== 'done');
  const completedCount = agentTasks.length - pendingTasks.length;

  let todoCount = 0;
  let inProgressCount = 0;
  let inReviewCount = 0;

  for (const task of pendingTasks) {
    if (task.status === 'todo') todoCount += 1;
    else if (task.status === 'in-progress') inProgressCount += 1;
    else if (task.status === 'in-review') inReviewCount += 1;
  }

  const capacity = Math.max(1, agent.taskCapacity ?? DEFAULT_AGENT_TASK_CAPACITY);
  const pendingCount = pendingTasks.length;
  const rawUtilizationPct = Math.round((pendingCount / capacity) * 100);
  const ringProgressPct = Math.min(100, Math.max(0, rawUtilizationPct));

  let loadState: WorkloadLoadState = 'normal';
  let loadLabel = 'Balanced';

  if (pendingCount === 0) {
    loadState = 'clear';
    loadLabel = 'Clear Queue';
  } else if (pendingCount > capacity) {
    loadState = 'at-capacity';
    loadLabel = 'Overloaded';
  } else if (rawUtilizationPct >= 100) {
    loadState = 'at-capacity';
    loadLabel = 'At Capacity';
  } else if (rawUtilizationPct >= 70) {
    loadState = 'elevated';
    loadLabel = 'Busy';
  }

  return {
    agentId: agent.id,
    capacity,
    pendingCount,
    completedCount,
    totalCount: agentTasks.length,
    todoCount,
    inProgressCount,
    inReviewCount,
    rawUtilizationPct,
    ringProgressPct,
    loadState,
    loadLabel
  };
}

export function sortPendingTasksByDeadline(
  tasks: readonly GenTeamTask[],
  agentId: string
): GenTeamTask[] {
  const pending = tasks.filter(
    (t) => t.assigneeAgentId === agentId && t.status !== 'done'
  );

  return [...pending].sort((a, b) => {
    const aMs = a.deadlineIso ? Date.parse(a.deadlineIso) : Number.NaN;
    const bMs = b.deadlineIso ? Date.parse(b.deadlineIso) : Number.NaN;
    const aValid = !Number.isNaN(aMs);
    const bValid = !Number.isNaN(bMs);

    if (aValid && bValid) {
      if (aMs !== bMs) return aMs - bMs;
    } else if (aValid !== bValid) {
      return aValid ? -1 : 1;
    }

    if (a.priority !== b.priority) {
      return a.priority === 'High' ? -1 : 1;
    }

    return a.title.localeCompare(b.title);
  });
}

export function formatTaskDeadlineMeta(
  deadlineIso?: string,
  referenceDate: Date = new Date()
): TaskDeadlineMeta {
  if (!deadlineIso) {
    return {
      label: 'No deadline',
      shortDate: 'Unscheduled',
      urgency: 'none'
    };
  }

  const parsed = new Date(deadlineIso);
  if (Number.isNaN(parsed.getTime())) {
    return {
      label: 'No deadline',
      shortDate: 'Unscheduled',
      urgency: 'none'
    };
  }

  const startOfToday = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  const startOfTarget = new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate()
  );
  const diffDays = Math.round(
    (startOfTarget.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000)
  );

  const shortDate = parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });

  if (diffDays < 0) {
    return {
      label: `Overdue (${shortDate})`,
      shortDate,
      urgency: 'overdue'
    };
  }

  if (diffDays === 0) {
    return {
      label: `Due Today (${shortDate})`,
      shortDate,
      urgency: 'today'
    };
  }

  if (diffDays === 1) {
    return {
      label: `Tomorrow (${shortDate})`,
      shortDate,
      urgency: 'soon'
    };
  }

  if (diffDays <= 3) {
    return {
      label: `In ${diffDays} days (${shortDate})`,
      shortDate,
      urgency: 'soon'
    };
  }

  return {
    label: `Due ${shortDate}`,
    shortDate,
    urgency: 'upcoming'
  };
}
