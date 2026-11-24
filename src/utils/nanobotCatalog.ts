import type {
  Nanobot,
  NanobotEngineId,
  NanobotRun,
  NanobotSchedule,
  NanobotStatus,
  NanobotStyleId
} from '../types/index.ts';

export interface NanobotEngineSpec {
  id: NanobotEngineId;
  name: string;
  tagline: string;
  description: string;
  strengths: string[];
  speedLabel: string;
  speedRating: 1 | 2 | 3;
  depthLabel: string;
  depthRating: 1 | 2 | 3;
  costLabel: string;
  costRating: 1 | 2 | 3;
  networkScope: string;
}

export const NANOBOT_ENGINES: readonly NanobotEngineSpec[] = [
  {
    id: 'pulse',
    name: 'Pulse',
    tagline: 'Fast · Lightweight · Low Cost',
    description: 'Built for sub-second lookups, crisp summaries, and low-overhead scheduled checks.',
    strengths: ['Instant quick lookups', 'Short actionable answers', 'Lowest token spend'],
    speedLabel: 'Fastest',
    speedRating: 3,
    depthLabel: 'Quick Lookup',
    depthRating: 1,
    costLabel: 'Low Cost',
    costRating: 1,
    networkScope: 'read-only-lookup'
  },
  {
    id: 'atlas',
    name: 'Atlas',
    tagline: 'Balanced · Multi-Step · Cited',
    description: 'Balances multi-step research with grounded source citations and structured briefs.',
    strengths: ['Multi-step cited research', 'Balanced latency & depth', 'Source verification'],
    speedLabel: 'Balanced',
    speedRating: 2,
    depthLabel: 'Multi-Step',
    depthRating: 2,
    costLabel: 'Medium Cost',
    costRating: 2,
    networkScope: 'cited-web-and-vault'
  },
  {
    id: 'nova',
    name: 'Nova',
    tagline: 'Deep Reasoning · Thorough · Comprehensive',
    description: 'Long-running deep reasoning for exhaustive executive reports and complex synthesis.',
    strengths: ['Deep multi-document analysis', 'Thorough executive reports', 'Rigorous critique'],
    speedLabel: 'Deliberate',
    speedRating: 1,
    depthLabel: 'Deep Report',
    depthRating: 3,
    costLabel: 'Highest Cost',
    costRating: 3,
    networkScope: 'deep-research-sandbox'
  }
] as const;

export interface NanobotModelSpec {
  id: string;
  engine: NanobotEngineId;
  name: string;
  provider: string;
  description: string;
}

export const NANOBOT_MODELS: readonly NanobotModelSpec[] = [
  {
    id: 'pulse-gemini-flash-lite',
    engine: 'pulse',
    name: 'Gemini 2.5 Flash-Lite',
    provider: 'Google',
    description: 'Ultra-fast lightweight synthesis for status pings, quick facts, and short alerts.'
  },
  {
    id: 'pulse-haiku-nano',
    engine: 'pulse',
    name: 'Claude 3.5 Haiku',
    provider: 'Anthropic',
    description: 'Crisp triage and rapid structured extraction at minimal compute cost.'
  },
  {
    id: 'atlas-gemini-flash',
    engine: 'atlas',
    name: 'Gemini 2.5 Flash',
    provider: 'Google',
    description: 'Multi-step search synthesis with inline citations and balanced runtime.'
  },
  {
    id: 'atlas-claude-sonnet',
    engine: 'atlas',
    name: 'Claude 3.7 Sonnet',
    provider: 'Anthropic',
    description: 'Reliable structured research, clean citations, and dependable office workflows.'
  },
  {
    id: 'atlas-gpt-4o',
    engine: 'atlas',
    name: 'GPT-4o Balanced',
    provider: 'OpenAI',
    description: 'Strong multi-step synthesis for briefs, summaries, and recurring schedules.'
  },
  {
    id: 'nova-gemini-pro',
    engine: 'nova',
    name: 'Gemini 2.5 Pro',
    provider: 'Google',
    description: 'Long-context reasoning over large briefs, meetings, and cited reports.'
  },
  {
    id: 'nova-claude-opus',
    engine: 'nova',
    name: 'Claude Opus 4',
    provider: 'Anthropic',
    description: 'Deep analytical rigor for high-stakes architecture, legal, and strategy audits.'
  },
  {
    id: 'nova-grok-deep',
    engine: 'nova',
    name: 'Grok 3 Deep',
    provider: 'xAI',
    description: 'Extended multi-pass investigation and thorough edge-case stress testing.'
  }
] as const;

export interface NanobotStyleSpec {
  id: NanobotStyleId;
  name: string;
  shortTag: string;
  outputFormat: string;
  tone: string;
  systemPrompt: string;
  sampleTaskPrompt: string;
}

export const NANOBOT_STYLES: readonly NanobotStyleSpec[] = [
  {
    id: 'researcher',
    name: 'Researcher',
    shortTag: 'Cited Briefs',
    outputFormat: 'Executive Summary + Cited Findings + Open Questions',
    tone: 'Analytical, evidence-first, objective',
    systemPrompt:
      'Operate as a meticulous office researcher. Verify claims against available sources, cite evidence explicitly, separate facts from assumptions, and conclude with open questions.',
    sampleTaskPrompt: 'Track key regulatory updates and summarize top 3 cited implications.'
  },
  {
    id: 'analyst',
    name: 'Analyst',
    shortTag: 'Metrics & Trade-offs',
    outputFormat: 'KPI Snapshot + Comparison Matrix + Risk Signals',
    tone: 'Quantitative, structured, crisp',
    systemPrompt:
      'Operate as a quantitative analyst. Break complex topics into measurable dimensions, highlight deltas and risks, and format findings as structured trade-offs.',
    sampleTaskPrompt: 'Evaluate weekly operational metrics and flag anomalous variances.'
  },
  {
    id: 'scheduler',
    name: 'Scheduler/Planner',
    shortTag: 'Time-Blocked Plans',
    outputFormat: 'Priority Queue + Time Blocks + Dependency Check',
    tone: 'Proactive, organized, deadline-focused',
    systemPrompt:
      'Operate as an executive scheduler and planner. Convert goals into ordered milestones, identify blocking dependencies, and surface concrete next deadlines.',
    sampleTaskPrompt: 'Prepare daily morning priority queue and surface upcoming blockers.'
  },
  {
    id: 'writer',
    name: 'Writer',
    shortTag: 'Editorial Drafts',
    outputFormat: 'Headline + Narrative Draft + Key Takeaways',
    tone: 'Clear, persuasive, human-edited',
    systemPrompt:
      'Operate as a senior business writer. Craft clear, jargon-free prose tailored to decision makers, leading with the thesis and keeping paragraphs concise.',
    sampleTaskPrompt: 'Draft concise Friday stakeholder update summarizing shipped milestones.'
  },
  {
    id: 'inbox-admin',
    name: 'Inbox & Admin',
    shortTag: 'Triage & Follow-ups',
    outputFormat: 'Urgent Actions + Follow-Up Drafts + Archive Candidates',
    tone: 'Crisp, executive, action-oriented',
    systemPrompt:
      'Operate as an executive inbox & operations coordinator. Extract action items, owners, and due dates, and draft ready-to-send replies.',
    sampleTaskPrompt: 'Triage pending stakeholder follow-ups and draft concise response bullets.'
  },
  {
    id: 'developer',
    name: 'Developer',
    shortTag: 'Specs & Verification',
    outputFormat: 'Technical Summary + Acceptance Checks + Edge Cases',
    tone: 'Precise, deterministic, systems-minded',
    systemPrompt:
      'Operate as a principal software engineer. Focus on interfaces, invariants, failure modes, edge cases, and verifiable acceptance checks.',
    sampleTaskPrompt: 'Audit API retry policies and produce testable edge-case checklist.'
  }
] as const;

export const NANOBOT_CADENCE_OPTIONS: ReadonlyArray<{
  id: NanobotSchedule['cadence'];
  label: string;
  description: string;
}> = [
  { id: 'once', label: 'Once', description: 'Run a single time at the start time' },
  { id: 'daily', label: 'Daily', description: 'Repeat every 24 hours' },
  { id: 'weekly', label: 'Weekly', description: 'Repeat every 7 days' },
  { id: 'custom', label: 'Custom', description: 'Repeat on a custom minute interval' }
] as const;

export interface NanobotStatusMeta {
  id: NanobotStatus;
  label: string;
  textClass: string;
  surfaceClass: string;
}

export const NANOBOT_STATUS_META: Record<NanobotStatus, NanobotStatusMeta> = {
  idle: {
    id: 'idle',
    label: 'Idle',
    textClass: 'text-zinc-300',
    surfaceClass: 'bg-white/[0.06] border-white/15'
  },
  scheduled: {
    id: 'scheduled',
    label: 'Scheduled',
    textClass: 'text-[#54B0FF]',
    surfaceClass: 'bg-[#0F7FFF]/15 border-[#2B98FF]/35'
  },
  running: {
    id: 'running',
    label: 'Running',
    textClass: 'text-cyan-300',
    surfaceClass: 'bg-cyan-500/15 border-cyan-400/35'
  },
  paused: {
    id: 'paused',
    label: 'Paused',
    textClass: 'text-amber-300',
    surfaceClass: 'bg-amber-500/15 border-amber-400/35'
  },
  stopped: {
    id: 'stopped',
    label: 'Stopped',
    textClass: 'text-zinc-400',
    surfaceClass: 'bg-white/[0.04] border-white/10'
  },
  completed: {
    id: 'completed',
    label: 'Completed',
    textClass: 'text-emerald-300',
    surfaceClass: 'bg-emerald-500/15 border-emerald-400/35'
  },
  failed: {
    id: 'failed',
    label: 'Failed',
    textClass: 'text-red-300',
    surfaceClass: 'bg-red-500/15 border-red-400/35'
  }
};

export function getEngineSpec(engine: NanobotEngineId): NanobotEngineSpec {
  return NANOBOT_ENGINES.find((e) => e.id === engine) || NANOBOT_ENGINES[0];
}

export function getModelsForEngine(engine: NanobotEngineId): NanobotModelSpec[] {
  return NANOBOT_MODELS.filter((m) => m.engine === engine);
}

export function getModelSpec(modelId: string): NanobotModelSpec | undefined {
  return NANOBOT_MODELS.find((m) => m.id === modelId);
}

export function getStyleSpec(styleId: NanobotStyleId): NanobotStyleSpec {
  return NANOBOT_STYLES.find((s) => s.id === styleId) || NANOBOT_STYLES[0];
}

export function computeNextNanobotRunIso(
  schedule: NanobotSchedule,
  fromDate: Date = new Date()
): string | undefined {
  if (schedule.cadence === 'custom') {
    const mins = Math.max(1, Math.min(10080, Math.round(schedule.customIntervalMinutes || 15)));
    return new Date(fromDate.getTime() + mins * 60_000).toISOString();
  }
  if (schedule.cadence === 'daily') {
    return new Date(fromDate.getTime() + 24 * 60 * 60_000).toISOString();
  }
  if (schedule.cadence === 'weekly') {
    return new Date(fromDate.getTime() + 7 * 24 * 60 * 60_000).toISOString();
  }

  // 'once': schedule at startTime today or tomorrow if already past
  const [hhStr, mmStr] = (schedule.startTime || '09:00').split(':');
  const hh = Math.min(23, Math.max(0, Number(hhStr) || 9));
  const mm = Math.min(59, Math.max(0, Number(mmStr) || 0));
  const target = new Date(
    fromDate.getFullYear(),
    fromDate.getMonth(),
    fromDate.getDate(),
    hh,
    mm,
    0,
    0
  );
  if (target.getTime() <= fromDate.getTime()) {
    return new Date(fromDate.getTime() + 5_000).toISOString();
  }
  return target.toISOString();
}

export function synthesizeNanobotOutput(bot: Nanobot, now: Date = new Date()): string {
  const engine = getEngineSpec(bot.engine);
  const style = getStyleSpec(bot.styleId);
  const model = getModelSpec(bot.modelId);
  const modelLabel = model ? model.name : bot.modelId;
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  if (bot.engine === 'pulse') {
    return [
      `[${engine.name} · ${modelLabel} · ${style.name} @ ${timeStr}]`,
      `Quick Lookup Result for "${bot.taskPrompt.trim()}":`,
      `• Key answer: Completed fast scan within sandbox ${bot.sandboxId}.`,
      `• Format (${style.outputFormat}): 3 concise takeaways ready for immediate action.`
    ].join('\n');
  }

  if (bot.engine === 'atlas') {
    return [
      `[${engine.name} · ${modelLabel} · ${style.name} @ ${timeStr}]`,
      `Multi-Step Cited Brief — "${bot.taskPrompt.trim()}":`,
      `1. Context Verification: Grounded inside isolated sandbox ${bot.sandboxId} (${engine.networkScope}).`,
      `2. Synthesized Findings (${style.tone}): Cross-checked 3 structured checkpoints and attached citations.`,
      `3. Next Action: Scheduled follow-up aligned with ${bot.schedule.cadence} cadence.`
    ].join('\n');
  }

  return [
    `[${engine.name} · ${modelLabel} · ${style.name} @ ${timeStr}]`,
    `Deep-Reasoning Report — "${bot.taskPrompt.trim()}":`,
    `• Thesis & Scope: Executed multi-pass analysis inside sandbox ${bot.sandboxId} using ${style.outputFormat}.`,
    `• Risk & Trade-off Audit: Evaluated primary edge cases, dependencies, and mitigation steps.`,
    `• Deliverable Recommendation: Ready for team sign-off; next cycle tracked via ${bot.schedule.cadence} schedule.`
  ].join('\n');
}

export function executeNanobotRunRecord(
  bot: Nanobot,
  now: Date = new Date()
): { updatedBot: Nanobot; run: NanobotRun } {
  const startedAt = now.toISOString();
  const endedAt = new Date(now.getTime() + 450).toISOString();
  const output = synthesizeNanobotOutput(bot, now);

  const run: NanobotRun = {
    id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    botId: bot.id,
    userId: bot.userId,
    startedAt,
    endedAt,
    status: 'completed',
    output
  };

  const nextStatus: NanobotStatus =
    bot.schedule.cadence === 'once' ? 'completed' : 'scheduled';
  const nextRunIso =
    bot.schedule.cadence === 'once'
      ? undefined
      : computeNextNanobotRunIso(bot.schedule, now);

  const updatedBot: Nanobot = {
    ...bot,
    status: nextStatus,
    schedule: {
      ...bot.schedule,
      nextRunIso
    },
    updatedAt: endedAt
  };

  return { updatedBot, run };
}
