import type {
  BackgroundAgentTask,
  BackgroundTaskRunLog,
  CloudSchedulerModelId,
  CoreDataChunkEmbedding,
  CoreDataVectorStoreState,
  OfficeDiaryCategory,
  OfficeDiaryEntry,
  RagStrategyId,
  SchedulerIntervalId,
  SparkpageCitation
} from '../types/index.ts';
import {
  executeRagRetrieval,
  generateDynamicCloudCitations,
  getRagStrategySpec
} from './ragEngine.ts';

export interface CloudSchedulerModelSpec {
  id: CloudSchedulerModelId;
  label: string;
  provider: string;
  capabilityNote: string;
}

export const CLOUD_SCHEDULER_MODELS: CloudSchedulerModelSpec[] = [
  {
    id: 'claude-3-7-sonnet',
    label: 'Claude 3.7 Sonnet',
    provider: 'Anthropic',
    capabilityNote: 'Deep architectural synthesis & careful policy verification'
  },
  {
    id: 'gemini-2-5-pro',
    label: 'Gemini 2.5 Pro',
    provider: 'Google Cloud AI',
    capabilityNote: 'Long-context CoreData multimodal cross-referencing'
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    provider: 'OpenAI',
    capabilityNote: 'Structured daily digests & iterative research execution'
  },
  {
    id: 'grok-3',
    label: 'Grok 3',
    provider: 'xAI',
    capabilityNote: 'Fast real-time signal sweeps & anomaly watch'
  }
];

export interface SchedulerIntervalSpec {
  id: SchedulerIntervalId;
  label: string;
  shortLabel: string;
  intervalMs: number;
}

export const SCHEDULER_INTERVAL_SPECS: SchedulerIntervalSpec[] = [
  { id: '15s', label: 'Every 15 sec', shortLabel: '15s', intervalMs: 15_000 },
  { id: '1m', label: 'Every 1 min', shortLabel: '1m', intervalMs: 60_000 },
  { id: '5m', label: 'Every 5 min', shortLabel: '5m', intervalMs: 300_000 },
  { id: 'hourly', label: 'Hourly', shortLabel: '1h', intervalMs: 3_600_000 }
];

export function getCloudSchedulerModelSpec(id: CloudSchedulerModelId): CloudSchedulerModelSpec {
  return CLOUD_SCHEDULER_MODELS.find((m) => m.id === id) || CLOUD_SCHEDULER_MODELS[0];
}

export function getSchedulerIntervalSpec(id: SchedulerIntervalId): SchedulerIntervalSpec {
  return SCHEDULER_INTERVAL_SPECS.find((s) => s.id === id) || SCHEDULER_INTERVAL_SPECS[1];
}

export function getTodayIsoDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDiaryDateLabel(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  if (!y || !m || !d) return dateIso;
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

export function createDiaryEntry(
  input: {
    id?: string;
    dateIso?: string;
    title: string;
    content: string;
    category?: OfficeDiaryCategory;
    tags?: string[];
    attachmentNames?: string[];
  },
  now = new Date()
): OfficeDiaryEntry {
  const dateIso = (input.dateIso || getTodayIsoDate(now)).trim();
  const cleanTitle = input.title.trim() || 'Daily Office Note';
  const cleanContent = input.content.trim();
  const nowIso = now.toISOString();
  const cleanTags = Array.from(
    new Set(
      (input.tags || [])
        .map((t) => t.trim())
        .filter(Boolean)
    )
  );

  return {
    id: input.id || `diary-${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
    dateIso,
    dateLabel: formatDiaryDateLabel(dateIso),
    timeLabel: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    title: cleanTitle,
    content: cleanContent,
    category: input.category || 'Focus',
    tags: cleanTags,
    attachmentNames: input.attachmentNames?.filter(Boolean) || [],
    createdIso: nowIso,
    updatedIso: nowIso
  };
}

export function filterDiaryEntries(
  entries: OfficeDiaryEntry[],
  options: {
    query?: string;
    category?: OfficeDiaryCategory | 'All';
    dateIso?: string;
  }
): OfficeDiaryEntry[] {
  const q = (options.query || '').trim().toLowerCase();
  const category = options.category || 'All';
  const dateIso = (options.dateIso || '').trim();

  return entries
    .filter((entry) => {
      if (category !== 'All' && entry.category !== category) return false;
      if (dateIso && entry.dateIso !== dateIso) return false;
      if (!q) return true;
      const haystack = `${entry.title} ${entry.content} ${entry.tags.join(' ')} ${entry.dateLabel}`.toLowerCase();
      return haystack.includes(q);
    })
    .sort((a, b) => b.updatedIso.localeCompare(a.updatedIso));
}

export function groupDiaryEntriesByDate(
  entries: OfficeDiaryEntry[]
): Array<{ dateIso: string; dateLabel: string; entries: OfficeDiaryEntry[] }> {
  const map = new Map<string, { dateIso: string; dateLabel: string; entries: OfficeDiaryEntry[] }>();
  const sorted = [...entries].sort((a, b) => {
    const dateDiff = b.dateIso.localeCompare(a.dateIso);
    return dateDiff !== 0 ? dateDiff : b.updatedIso.localeCompare(a.updatedIso);
  });

  for (const entry of sorted) {
    const existing = map.get(entry.dateIso);
    if (existing) {
      existing.entries.push(entry);
    } else {
      map.set(entry.dateIso, {
        dateIso: entry.dateIso,
        dateLabel: entry.dateLabel || formatDiaryDateLabel(entry.dateIso),
        entries: [entry]
      });
    }
  }
  return Array.from(map.values());
}

export function computeNextRunIso(intervalMs: number, fromMs = Date.now()): string {
  return new Date(fromMs + Math.max(5_000, intervalMs)).toISOString();
}

export function createBackgroundAgentTask(
  input: {
    id?: string;
    title: string;
    prompt: string;
    cloudModelId: CloudSchedulerModelId;
    intervalId: SchedulerIntervalId;
    ragEnabled?: boolean;
    ragStrategyId?: RagStrategyId;
    attachmentNames?: string[];
    assignedAgentId?: string;
    scheduledSlotIso?: string;
  },
  now = new Date()
): BackgroundAgentTask {
  const modelSpec = getCloudSchedulerModelSpec(input.cloudModelId);
  const intervalSpec = getSchedulerIntervalSpec(input.intervalId);
  const cleanPrompt = input.prompt.trim();
  const cleanTitle =
    input.title.trim() ||
    (cleanPrompt.length > 46 ? `${cleanPrompt.slice(0, 46)}…` : cleanPrompt) ||
    'Autonomous Background Task';

  return {
    id: input.id || `task-${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
    title: cleanTitle,
    prompt: cleanPrompt,
    cloudModelId: modelSpec.id,
    cloudModelLabel: modelSpec.label,
    cloudProviderLabel: modelSpec.provider,
    intervalId: intervalSpec.id,
    intervalLabel: intervalSpec.label,
    intervalMs: intervalSpec.intervalMs,
    status: 'running',
    ragEnabled: input.ragEnabled ?? true,
    ragStrategyId: input.ragStrategyId || 'hybrid-rrf',
    attachmentNames: (input.attachmentNames || []).filter(Boolean),
    ...(input.assignedAgentId ? { assignedAgentId: input.assignedAgentId } : {}),
    ...(input.scheduledSlotIso ? { scheduledSlotIso: input.scheduledSlotIso } : {}),
    runCount: 0,
    createdAtIso: now.toISOString(),
    lastRunIso: null,
    nextRunIso: now.toISOString(), // Eligible for immediate first cycle
    latestOutput: `Queued on ${modelSpec.label}. Waiting for first continuous cycle...`,
    latestChunks: [],
    latestCitations: [],
    runHistory: []
  };
}

export function executeBackgroundAgentTaskCycle(params: {
  task: BackgroundAgentTask;
  store: CoreDataVectorStoreState;
  liveCitations?: SparkpageCitation[];
  attachmentChunks?: CoreDataChunkEmbedding[];
  now?: Date;
}): BackgroundAgentTask {
  const { task, store, liveCitations = [], attachmentChunks = [], now = new Date() } = params;
  const startedAt = Date.now();
  const nextRunNumber = task.runCount + 1;
  const modelSpec = getCloudSchedulerModelSpec(task.cloudModelId);

  let retrievedChunks: BackgroundAgentTask['latestChunks'] = [];
  let ragSummaryLine = 'Direct Cloud AI execution (RAG bypassed)';
  let citations: SparkpageCitation[] = [];

  if (task.ragEnabled) {
    const ragSpec = getRagStrategySpec(task.ragStrategyId);
    const retrieval = executeRagRetrieval(store, task.prompt, {
      strategyId: task.ragStrategyId,
      topK: 3,
      attachmentChunks,
      offlineOnly: false
    });
    retrievedChunks = retrieval.retrieved;

    if (retrieval.shouldTriggerCloudFallback || liveCitations.length > 0) {
      citations = generateDynamicCloudCitations(task.prompt, liveCitations);
    }

    ragSummaryLine =
      retrievedChunks.length > 0
        ? `${ragSpec.label} grounded ${retrievedChunks.length} CoreData chunk(s) from ${Array.from(
            new Set(retrievedChunks.map((c) => c.documentTitle))
          ).join(', ')}.`
        : `${ragSpec.label} scanned CoreData Vault and incorporated ${citations.length} live cloud reference(s).`;
  } else {
    citations = generateDynamicCloudCitations(task.prompt, liveCitations);
  }

  const topEvidenceLines = retrievedChunks
    .slice(0, 2)
    .map(
      (chunk, idx) =>
        `[${idx + 1}] ${chunk.documentTitle} (${chunk.sectionLabel}, score ${chunk.fusedScore.toFixed(
          2
        )}): ${chunk.text.slice(0, 150)}${chunk.text.length > 150 ? '…' : ''}`
    );

  const citationLines =
    topEvidenceLines.length > 0
      ? topEvidenceLines
      : citations
          .slice(0, 2)
          .map((c) => `[Web ${c.id}] ${c.title} (${c.domain}): ${c.snippet.slice(0, 130)}`);

  const timestampLabel = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const attachmentNote =
    task.attachmentNames.length > 0
      ? `Attachments monitored: ${task.attachmentNames.join(', ')}.\n`
      : '';

  const latestOutput = [
    `Cycle #${nextRunNumber} · ${modelSpec.label} (${modelSpec.provider}) @ ${timestampLabel}`,
    `Objective: ${task.prompt}`,
    attachmentNote + ragSummaryLine,
    citationLines.length > 0 ? `Key Findings:\n${citationLines.join('\n')}` : '',
    `Next automated run scheduled ${task.intervalLabel.toLowerCase()}.`
  ]
    .filter(Boolean)
    .join('\n\n');

  const durationMs = Math.max(18, Date.now() - startedAt + 24);
  const logEntry: BackgroundTaskRunLog = {
    runNumber: nextRunNumber,
    executedAtIso: now.toISOString(),
    executedAtLabel: timestampLabel,
    summary: ragSummaryLine,
    ragStrategyId: task.ragEnabled ? task.ragStrategyId : undefined,
    chunksUsedCount: retrievedChunks.length,
    cloudCitationsCount: citations.length,
    durationMs
  };

  return {
    ...task,
    runCount: nextRunNumber,
    lastRunIso: now.toISOString(),
    nextRunIso: computeNextRunIso(task.intervalMs, now.getTime()),
    latestOutput,
    latestChunks: retrievedChunks,
    latestCitations: citations,
    runHistory: [logEntry, ...task.runHistory].slice(0, 15)
  };
}
