import type {
  BackgroundAgentTask,
  CloudSchedulerModelId,
  GenTeamAgent
} from '../types/index.ts';
import { getTodayIsoDate } from './workspaceScheduler.ts';

export type CrewTimelineGranularity = 'day' | 'week';

export type AgentLaneStatus = 'working' | 'scheduled-next' | 'idle';

export interface TimelineSlotSpec {
  key: string;
  label: string;
  subLabel: string;
  slotIso: string;
}

export interface AgentLaneSummary {
  agent: GenTeamAgent;
  status: AgentLaneStatus;
  statusLabel: string;
  workloadCount: number;
  tasks: BackgroundAgentTask[];
}

export function resolveTaskAgentId(
  task: BackgroundAgentTask,
  agents: readonly GenTeamAgent[]
): string {
  if (task.assignedAgentId && agents.some((a) => a.id === task.assignedAgentId)) {
    return task.assignedAgentId;
  }

  if (task.cloudModelId === 'claude-3-7-sonnet') {
    const claude = agents.find((a) => a.vendor === 'claude' || a.id === 'agent-claude');
    if (claude) return claude.id;
  }
  if (task.cloudModelId === 'gemini-2-5-pro') {
    const gemini = agents.find((a) => a.vendor === 'gemini' || a.id === 'agent-gemini');
    if (gemini) return gemini.id;
  }
  if (task.cloudModelId === 'gpt-4o') {
    const openai = agents.find((a) => a.vendor === 'openai');
    if (openai) return openai.id;
  }
  if (task.cloudModelId === 'grok-3') {
    const grok = agents.find((a) => a.vendor === 'grok' || a.id === 'agent-grok');
    if (grok) return grok.id;
  }

  return agents[0]?.id || 'agent-claude';
}

export function mapAgentToCloudModel(
  agent: GenTeamAgent | undefined,
  fallback: CloudSchedulerModelId
): CloudSchedulerModelId {
  if (!agent) return fallback;
  if (agent.vendor === 'claude') return 'claude-3-7-sonnet';
  if (agent.vendor === 'gemini') return 'gemini-2-5-pro';
  if (agent.vendor === 'openai') return 'gpt-4o';
  if (agent.vendor === 'grok') return 'grok-3';
  return fallback;
}

export function buildTimelineSlots(
  granularity: CrewTimelineGranularity,
  now = new Date()
): TimelineSlotSpec[] {
  const todayIso = getTodayIsoDate(now);

  if (granularity === 'day') {
    const hours = [9, 12, 15, 18];
    return hours.map((hour) => {
      const hh = String(hour).padStart(2, '0');
      const displayHour = hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`;
      return {
        key: `${todayIso}T${hh}`,
        label: displayHour,
        subLabel: 'Today',
        slotIso: `${todayIso}T${hh}:00:00`
      };
    });
  }

  // Week slots starting from Monday of the current week
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = base.getDay(); // 0=Sun..6=Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(base);
  monday.setDate(base.getDate() + diffToMonday);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = getTodayIsoDate(d);
    return {
      key: iso,
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      subLabel: String(d.getDate()),
      slotIso: `${iso}T09:00:00`
    };
  });
}

export function resolveTaskTimelineSlotKey(
  task: BackgroundAgentTask,
  slots: readonly TimelineSlotSpec[],
  granularity: CrewTimelineGranularity
): string {
  if (slots.length === 0) return '';
  const sourceIso = task.scheduledSlotIso || task.nextRunIso || task.createdAtIso;
  const datePart = sourceIso.slice(0, 10);

  if (granularity === 'week') {
    const exactDay = slots.find((s) => s.key === datePart);
    if (exactDay) return exactDay.key;
    return slots[0].key;
  }

  // Day view: match closest hour bucket
  const parsed = new Date(sourceIso);
  const hour = Number.isNaN(parsed.getTime()) ? 9 : parsed.getHours();
  let bestSlot = slots[0];
  let minDiff = Infinity;
  for (const s of slots) {
    const slotHour = Number(s.key.slice(11, 13)) || 9;
    const diff = Math.abs(slotHour - hour);
    if (diff < minDiff) {
      minDiff = diff;
      bestSlot = s;
    }
  }
  return bestSlot.key;
}

export function buildAgentLanes(
  agents: readonly GenTeamAgent[],
  tasks: readonly BackgroundAgentTask[]
): AgentLaneSummary[] {
  return agents.map((agent) => {
    const laneTasks = tasks.filter((t) => resolveTaskAgentId(t, agents) === agent.id);
    const runningTasks = laneTasks.filter((t) => t.status === 'running');
    const pausedTasks = laneTasks.filter((t) => t.status === 'paused');

    let status: AgentLaneStatus = 'idle';
    let statusLabel = 'Idle';
    if (agent.status === 'thinking' || runningTasks.length > 0) {
      status = 'working';
      statusLabel = 'Working';
    } else if (pausedTasks.length > 0 || agent.activeTasksCount > 0) {
      status = 'scheduled-next';
      statusLabel = 'Scheduled next';
    }

    return {
      agent,
      status,
      statusLabel,
      workloadCount: runningTasks.length,
      tasks: laneTasks
    };
  });
}
