import {
  GenTeamAccentColor,
  GenTeamAgent,
  GenTeamAgentVendor,
  GenTeamChannel,
  GenTeamExecutionMode,
  GenTeamMessage,
  GenTeamTask,
  GenTeamTaskStatus
} from '../types/index.ts';
import {
  DEFAULT_AGENT_TASK_CAPACITY,
  buildDeadlineIsoByDaysOffset
} from './genTeamTaskSummary.ts';

export const GENTEAM_BRAND_COLORS = {
  primaryBlack: '#000000',
  primaryWhite: '#FFFFFF',
  accentBlue: '#0F7FFF'
} as const;

export const GENTEAM_ACCENT_STYLES: Record<
  GenTeamAccentColor,
  {
    label: string;
    avatarClass: string;
    badgeTextClass: string;
    swatchHex: string;
  }
> = {
  amber: {
    label: 'Claude Terracotta',
    avatarClass: 'bg-[#D97757]/15 text-[#F29C7E] border-[#D97757]/40',
    badgeTextClass: 'text-[#F29C7E]',
    swatchHex: '#D97757'
  },
  blue: {
    label: 'GenTeam Blue',
    avatarClass: 'bg-[#0F7FFF]/15 text-[#66B2FF] border-[#0F7FFF]/40',
    badgeTextClass: 'text-[#66B2FF]',
    swatchHex: '#0F7FFF'
  },
  teal: {
    label: 'Wispr Teal',
    avatarClass: 'bg-teal-500/15 text-teal-300 border-teal-500/35',
    badgeTextClass: 'text-teal-300',
    swatchHex: '#14B8A6'
  },
  zinc: {
    label: 'Grok Titanium',
    avatarClass: 'bg-zinc-100/10 text-zinc-100 border-zinc-400/35',
    badgeTextClass: 'text-zinc-200',
    swatchHex: '#E4E4E7'
  },
  emerald: {
    label: 'Emerald Runtime',
    avatarClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
    badgeTextClass: 'text-emerald-300',
    swatchHex: '#10B981'
  },
  violet: {
    label: 'Indigo Synthesis',
    avatarClass: 'bg-violet-500/15 text-violet-300 border-violet-500/35',
    badgeTextClass: 'text-violet-300',
    swatchHex: '#8B5CF6'
  }
};

export interface GenTeamAgentTemplate {
  id: string;
  name: string;
  handle: string;
  vendor: GenTeamAgentVendor;
  modelName: string;
  roleTitle: string;
  specialty: string;
  accent: GenTeamAccentColor;
  executionMode: GenTeamExecutionMode;
  systemPrompt: string;
  skills: string[];
}

export const GENTEAM_AGENT_TEMPLATES: GenTeamAgentTemplate[] = [
  {
    id: 'tpl-chatgpt',
    name: 'ChatGPT-4o',
    handle: '@gpt4o',
    vendor: 'openai',
    modelName: 'GPT-4o Omni',
    roleTitle: 'Product Strategist',
    specialty: 'Executive briefs, user stories, and edge-case QA matrices',
    accent: 'emerald',
    executionMode: 'cloud-sandbox',
    systemPrompt: 'Translate technical findings into crisp stakeholder plans and acceptance criteria.',
    skills: ['Product Briefs', 'Spec Writing', 'QA Checklists']
  },
  {
    id: 'tpl-claude-cli',
    name: 'Claude Code CLI',
    handle: '@claudecode',
    vendor: 'claude',
    modelName: 'Claude 3.7 Sonnet · Local CLI',
    roleTitle: 'Local Repo Engineer',
    specialty: 'Direct workspace patches, terminal builds, and TypeScript refactors',
    accent: 'amber',
    executionMode: 'local-cli',
    systemPrompt: 'Operate against local repository files, verify builds, and keep patches minimal.',
    skills: ['Terminal CLI', 'Gosu / TS Refactor', 'Build Verification']
  },
  {
    id: 'tpl-deepseek',
    name: 'DeepSeek R1 Bot',
    handle: '@deepseek',
    vendor: 'custom',
    modelName: 'DeepSeek-R1 671B',
    roleTitle: 'Reasoning & Math Auditor',
    specialty: 'Step-by-step formal logic verification and reserve formula auditing',
    accent: 'violet',
    executionMode: 'cloud-sandbox',
    systemPrompt: 'Audit financial calculations, boundary conditions, and deductive soundness.',
    skills: ['Formal Logic', 'Formula Audit', 'Edge Cases']
  },
  {
    id: 'tpl-perplexity',
    name: 'Perplexity Scout',
    handle: '@perplexity',
    vendor: 'custom',
    modelName: 'Sonar Pro Reasoning',
    roleTitle: 'Citation Verification Bot',
    specialty: 'Cross-referencing live API release notes with primary source links',
    accent: 'blue',
    executionMode: 'cloud-sandbox',
    systemPrompt: 'Verify external URLs, deprecation notices, and exact API field schemas.',
    skills: ['Live Citations', 'API Changelog', 'Fact Verification']
  }
];

export const INITIAL_GENTEAM_AGENTS: GenTeamAgent[] = [
  {
    id: 'agent-claude',
    name: 'Claude',
    handle: '@claude',
    vendor: 'claude',
    modelName: 'Claude 3.7 Sonnet',
    roleTitle: 'Systems Architect',
    specialty: 'Structured Gosu rules, Cloud API specs, and clean code review',
    accent: 'amber',
    executionMode: 'cloud-sandbox',
    status: 'online',
    systemPrompt:
      'Review ClaimCenter architecture trade-offs, validate schema contracts, and write concise technical specs.',
    skills: ['Architecture', 'Gosu Rules', 'Code Review'],
    activeTasksCount: 2,
    taskCapacity: DEFAULT_AGENT_TASK_CAPACITY,
    isBuiltIn: true
  },
  {
    id: 'agent-gemini',
    name: 'Gemini',
    handle: '@gemini',
    vendor: 'gemini',
    modelName: 'Gemini 2.5 Pro',
    roleTitle: 'Deep Researcher',
    specialty: 'Long-context cross-document synthesis and multi-source citations',
    accent: 'blue',
    executionMode: 'cloud-sandbox',
    status: 'online',
    systemPrompt:
      'Synthesize large documentation sets, policy wordings, and meeting transcripts into structured evidence.',
    skills: ['Deep Synthesis', '1M Context', 'Citation Mapping'],
    activeTasksCount: 1,
    taskCapacity: DEFAULT_AGENT_TASK_CAPACITY,
    isBuiltIn: true
  },
  {
    id: 'agent-wisprflow',
    name: 'WisprFlow AI',
    handle: '@wisprflow',
    vendor: 'wisprflow',
    modelName: 'WisprFlow v2 Neural ASR',
    roleTitle: 'Voice & Dictation Copilot',
    specialty: 'Zero-filler speech cleanup, live speaker turns, and domain terminology boost',
    accent: 'teal',
    executionMode: 'voice-stream',
    status: 'online',
    systemPrompt:
      'Clean raw voice memos and meeting streams into punctuated action items using team dictionary terms.',
    skills: ['Voice Cleanup', 'Diarization', 'Keyterm Boost'],
    activeTasksCount: 1,
    taskCapacity: DEFAULT_AGENT_TASK_CAPACITY,
    isBuiltIn: true
  },
  {
    id: 'agent-grok',
    name: 'Grok Bot',
    handle: '@grok',
    vendor: 'grok',
    modelName: 'Grok 3 Fast',
    roleTitle: 'Realtime Intel Bot',
    specialty: 'Rapid release tracking, anomaly spotting, and candid technical triage',
    accent: 'zinc',
    executionMode: 'cloud-sandbox',
    status: 'online',
    systemPrompt:
      'Surface live platform advisories, spot blind spots fast, and challenge fragile assumptions.',
    skills: ['Fast Triage', 'Live Advisories', 'Red Teaming'],
    activeTasksCount: 1,
    taskCapacity: DEFAULT_AGENT_TASK_CAPACITY,
    isBuiltIn: true
  }
];

export const INITIAL_GENTEAM_CHANNELS: GenTeamChannel[] = [
  {
    id: 'ch-claimcenter-core',
    name: '#claimcenter-core',
    kind: 'channel',
    description: 'FNOL Cloud API specs, Gosu pre-update rules & voice triage',
    memberAgentIds: ['agent-claude', 'agent-gemini', 'agent-wisprflow', 'agent-grok']
  },
  {
    id: 'ch-release-warroom',
    name: '#release-war-room',
    kind: 'channel',
    description: 'Cross-agent QA, real-time monitoring & client deliverables',
    memberAgentIds: ['agent-claude', 'agent-gemini', 'agent-grok']
  },
  {
    id: 'dm-agent-claude',
    name: 'Claude',
    kind: 'dm',
    dmAgentId: 'agent-claude',
    description: 'Direct 1:1 thread with Claude · Systems Architect',
    memberAgentIds: ['agent-claude']
  },
  {
    id: 'dm-agent-gemini',
    name: 'Gemini',
    kind: 'dm',
    dmAgentId: 'agent-gemini',
    description: 'Direct 1:1 thread with Gemini · Deep Researcher',
    memberAgentIds: ['agent-gemini']
  },
  {
    id: 'dm-agent-wisprflow',
    name: 'WisprFlow AI',
    kind: 'dm',
    dmAgentId: 'agent-wisprflow',
    description: 'Direct 1:1 thread with WisprFlow AI · Voice & Dictation Copilot',
    memberAgentIds: ['agent-wisprflow']
  },
  {
    id: 'dm-agent-grok',
    name: 'Grok Bot',
    kind: 'dm',
    dmAgentId: 'agent-grok',
    description: 'Direct 1:1 thread with Grok Bot · Realtime Intel Bot',
    memberAgentIds: ['agent-grok']
  }
];

export const INITIAL_GENTEAM_MESSAGES: GenTeamMessage[] = [
  {
    id: 'msg-gt-1',
    channelId: 'ch-claimcenter-core',
    senderType: 'human',
    senderName: 'You',
    handle: '@lead',
    content:
      '@wisprflow clean up the FNOL triage voice note and hand off policy sync latency limits to @claude and @gemini.',
    timestamp: '09:42 AM',
    mentions: ['@wisprflow', '@claude', '@gemini']
  },
  {
    id: 'msg-gt-2',
    channelId: 'ch-claimcenter-core',
    senderType: 'agent',
    agentId: 'agent-wisprflow',
    senderName: 'WisprFlow AI',
    handle: '@wisprflow',
    content:
      'Transcript normalized with ClaimCenter keyterms: FNOL intake must batch Exposure creation cleanly while keeping PolicyCenter coverage snapshot retrieval under 400ms p95. Handing schema validation to @claude.',
    timestamp: '09:42 AM',
    mentions: ['@claude'],
    handoffToAgentId: 'agent-claude'
  },
  {
    id: 'msg-gt-3',
    channelId: 'ch-claimcenter-core',
    senderType: 'agent',
    agentId: 'agent-claude',
    senderName: 'Claude',
    handle: '@claude',
    content:
      'Confirmed. Keep external intake on Cloud API `/claim/v1/claims` composite payloads and enforce synchronous `TransactionSet` reserve authority checks inside Gosu pre-update rules. @gemini can cross-check PolicyCenter App Events SLA.',
    timestamp: '09:43 AM',
    mentions: ['@gemini'],
    handoffToAgentId: 'agent-gemini'
  },
  {
    id: 'msg-gt-4',
    channelId: 'ch-claimcenter-core',
    senderType: 'agent',
    agentId: 'agent-gemini',
    senderName: 'Gemini',
    handle: '@gemini',
    content:
      'Verified across 24 PolicyCenter & Cloud API docs: `IPolicySearchAdapter` local caching keeps 95th percentile lookup at 340ms with zero duplicate exposure retries. Added benchmark summary to Task Board.',
    timestamp: '09:43 AM',
    taskRefTitle: 'Benchmark PolicyCenter snapshot SLA'
  },
  {
    id: 'msg-gt-5',
    channelId: 'ch-release-warroom',
    senderType: 'agent',
    agentId: 'agent-grok',
    senderName: 'Grok Bot',
    handle: '@grok',
    content:
      'Flagged one edge case before release: webhook replay queues should cap idempotency keys at 24h so partial FNOL drafts never double-trigger SIU scoring.',
    timestamp: '10:05 AM'
  },
  {
    id: 'msg-gt-6',
    channelId: 'dm-agent-claude',
    senderType: 'agent',
    agentId: 'agent-claude',
    senderName: 'Claude',
    handle: '@claude',
    content:
      'Ready for direct architecture review. Paste any Gosu rule, TypeScript diff, or JSON:API payload and I will audit it cleanly.',
    timestamp: '09:30 AM'
  }
];

export const INITIAL_GENTEAM_TASKS: GenTeamTask[] = [
  {
    id: 'task-gt-1',
    title: 'Benchmark PolicyCenter snapshot SLA',
    description: 'Validate IPolicySearchAdapter < 400ms p95 lookup latency during burst FNOL load.',
    status: 'done',
    assigneeAgentId: 'agent-gemini',
    channelId: 'ch-claimcenter-core',
    priority: 'High',
    updatedAt: '09:44 AM',
    deadlineIso: buildDeadlineIsoByDaysOffset(-1)
  },
  {
    id: 'task-gt-2',
    title: 'Gosu reserve authority pre-update rule',
    description: 'Enforce indemnity ceiling validation before TransactionSet commit.',
    status: 'in-review',
    assigneeAgentId: 'agent-claude',
    channelId: 'ch-claimcenter-core',
    priority: 'High',
    updatedAt: '09:50 AM',
    deadlineIso: buildDeadlineIsoByDaysOffset(0, 16)
  },
  {
    id: 'task-gt-5',
    title: 'Validate Claim API composite payload schema',
    description: 'Ensure exposure + reserve batches reject partial drafts cleanly.',
    status: 'in-progress',
    assigneeAgentId: 'agent-claude',
    channelId: 'ch-claimcenter-core',
    priority: 'High',
    updatedAt: '10:12 AM',
    deadlineIso: buildDeadlineIsoByDaysOffset(1)
  },
  {
    id: 'task-gt-6',
    title: 'Document Cloud API error taxonomy',
    description: 'Publish canonical retry status codes for downstream integrators.',
    status: 'todo',
    assigneeAgentId: 'agent-claude',
    channelId: 'ch-release-warroom',
    priority: 'Normal',
    updatedAt: '10:20 AM',
    deadlineIso: buildDeadlineIsoByDaysOffset(3)
  },
  {
    id: 'task-gt-7',
    title: 'Cross-reference PolicyCenter endorsement delta',
    description: 'Compare commercial auto wording updates across Q4 policy snapshots.',
    status: 'in-progress',
    assigneeAgentId: 'agent-gemini',
    channelId: 'ch-claimcenter-core',
    priority: 'High',
    updatedAt: '10:15 AM',
    deadlineIso: buildDeadlineIsoByDaysOffset(0, 18)
  },
  {
    id: 'task-gt-3',
    title: 'Normalize speaker turns for Claim Review #2',
    description: 'Strip filler tokens and apply custom ClaimCenter dictionary weights.',
    status: 'in-progress',
    assigneeAgentId: 'agent-wisprflow',
    channelId: 'ch-claimcenter-core',
    priority: 'Normal',
    updatedAt: '10:01 AM',
    deadlineIso: buildDeadlineIsoByDaysOffset(1)
  },
  {
    id: 'task-gt-8',
    title: 'Tune adjuster keyterm boost weights',
    description: 'Calibrate ASR lexicon for FNOL subrogation and SIU terminology.',
    status: 'todo',
    assigneeAgentId: 'agent-wisprflow',
    channelId: 'ch-claimcenter-core',
    priority: 'High',
    updatedAt: '10:25 AM',
    deadlineIso: buildDeadlineIsoByDaysOffset(3)
  },
  {
    id: 'task-gt-4',
    title: 'Audit webhook idempotency & SIU triggers',
    description: 'Stress-test duplicate replay handling against SIU score >= 70 referral rule.',
    status: 'todo',
    assigneeAgentId: 'agent-grok',
    channelId: 'ch-release-warroom',
    priority: 'High',
    updatedAt: '10:06 AM',
    deadlineIso: buildDeadlineIsoByDaysOffset(0, 15)
  },
  {
    id: 'task-gt-9',
    title: 'Monitor rate-limit burst alerts',
    description: 'Verify cache circuit-breaker fallback during ClaimCenter cloud sync.',
    status: 'in-progress',
    assigneeAgentId: 'agent-grok',
    channelId: 'ch-release-warroom',
    priority: 'Normal',
    updatedAt: '10:30 AM',
    deadlineIso: buildDeadlineIsoByDaysOffset(7)
  }
];

export function getAgentInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'AI';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function normalizeAgentHandle(rawHandleOrName: string): string {
  const cleaned = rawHandleOrName
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_-]/g, '');
  return `@${cleaned || 'agent'}`;
}

export function parseMentionedAgentIds(
  text: string,
  agents: GenTeamAgent[]
): string[] {
  const lower = text.toLowerCase();
  if (/@(all|team)\b/.test(lower)) {
    return agents.filter(a => a.status !== 'idle').map(a => a.id);
  }

  const matched: string[] = [];
  for (const agent of agents) {
    const cleanHandle = agent.handle.toLowerCase();
    const regex = new RegExp(`(^|\\s)${cleanHandle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(lower)) {
      matched.push(agent.id);
    }
  }
  return matched;
}

export function resolveRespondingAgentIds(
  prompt: string,
  channel: GenTeamChannel,
  agents: GenTeamAgent[]
): string[] {
  if (channel.kind === 'dm' && channel.dmAgentId) {
    const exists = agents.some(a => a.id === channel.dmAgentId);
    if (exists) return [channel.dmAgentId];
  }

  const explicit = parseMentionedAgentIds(prompt, agents);
  if (explicit.length > 0) return explicit;

  const lower = prompt.toLowerCase();
  const candidates = agents.filter(
    a => channel.memberAgentIds.includes(a.id) && a.status !== 'idle'
  );
  const pool = candidates.length > 0 ? candidates : agents;

  const picked: string[] = [];
  const pushIfMatch = (vendor: GenTeamAgentVendor) => {
    const found = pool.find(a => a.vendor === vendor);
    if (found && !picked.includes(found.id)) picked.push(found.id);
  };

  if (/(voice|audio|transcript|dictat|mic|speech)/.test(lower)) pushIfMatch('wisprflow');
  if (/(code|gosu|api|schema|bug|spec|architect|refactor)/.test(lower)) pushIfMatch('claude');
  if (/(research|doc|cit|synthes|compar|summar|context)/.test(lower)) pushIfMatch('gemini');
  if (/(realtime|trend|live|x|alert|check|grok|audit)/.test(lower)) pushIfMatch('grok');

  if (picked.length > 0) return picked.slice(0, 2);
  return pool.slice(0, Math.min(2, pool.length)).map(a => a.id);
}

export interface CreateGenTeamAgentInput {
  name: string;
  handle?: string;
  vendor: GenTeamAgentVendor;
  modelName: string;
  roleTitle: string;
  specialty?: string;
  accent: GenTeamAccentColor;
  executionMode: GenTeamExecutionMode;
  systemPrompt?: string;
  skills?: string[];
}

export function createGenTeamAgent(
  input: CreateGenTeamAgentInput,
  existingAgents: GenTeamAgent[]
): { agent: GenTeamAgent; dmChannel: GenTeamChannel } {
  const cleanName = input.name.trim() || 'Custom Agent';
  const baseHandle = normalizeAgentHandle(input.handle?.trim() || cleanName);
  const usedHandles = new Set(existingAgents.map(a => a.handle.toLowerCase()));
  let finalHandle = baseHandle;
  let suffix = 2;
  while (usedHandles.has(finalHandle.toLowerCase())) {
    finalHandle = `${baseHandle}${suffix}`;
    suffix += 1;
  }

  const slug = finalHandle.replace(/^@/, '');
  const id = `agent-${slug}-${Date.now().toString(36)}`;
  const cleanRole = input.roleTitle.trim() || 'AI Specialist';
  const cleanModel = input.modelName.trim() || 'Frontier Model';

  const agent: GenTeamAgent = {
    id,
    name: cleanName,
    handle: finalHandle,
    vendor: input.vendor,
    modelName: cleanModel,
    roleTitle: cleanRole,
    specialty:
      input.specialty?.trim() ||
      `${cleanRole} powered by ${cleanModel} inside GenTeam workspace`,
    accent: input.accent,
    executionMode: input.executionMode,
    status: 'online',
    systemPrompt:
      input.systemPrompt?.trim() ||
      `Collaborate with teammates as ${cleanRole}, respond concisely to @mentions, and hand off tasks cleanly.`,
    skills:
      input.skills && input.skills.length > 0
        ? input.skills
        : [cleanRole, input.executionMode === 'local-cli' ? 'Local CLI' : 'Sandbox Tools'],
    activeTasksCount: 0,
    taskCapacity: DEFAULT_AGENT_TASK_CAPACITY,
    isBuiltIn: false
  };

  const dmChannel: GenTeamChannel = {
    id: `dm-${id}`,
    name: cleanName,
    kind: 'dm',
    dmAgentId: id,
    description: `Direct 1:1 thread with ${cleanName} · ${cleanRole}`,
    memberAgentIds: [id]
  };

  return { agent, dmChannel };
}

export function generateAgentCollaborationReplies(params: {
  prompt: string;
  channel: GenTeamChannel;
  agents: GenTeamAgent[];
  targetAgentIds: string[];
  timestamp: string;
}): GenTeamMessage[] {
  const { prompt, channel, agents, targetAgentIds, timestamp } = params;
  const trimmed = prompt.trim();

  return targetAgentIds.map((agentId, index) => {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) {
      return {
        id: `msg-gt-${Date.now()}-${index}`,
        channelId: channel.id,
        senderType: 'agent',
        senderName: 'Agent',
        handle: '@agent',
        content: `Processed request: "${trimmed}".`,
        timestamp
      };
    }

    const nextAgent =
      index + 1 < targetAgentIds.length
        ? agents.find(a => a.id === targetAgentIds[index + 1])
        : undefined;
    const handoffLine = nextAgent
      ? ` Passing follow-up verification to ${nextAgent.handle}.`
      : '';

    let body = '';
    if (agent.vendor === 'claude') {
      body = `Audited architecture & constraints for "${trimmed}". Recommend isolated contract validation, deterministic error boundaries, and typed handoffs before merging.${handoffLine}`;
    } else if (agent.vendor === 'gemini') {
      body = `Synthesized full workspace context & multi-source notes for "${trimmed}". Mapped cross-module dependencies and source citations with zero conflicting policy constraints.${handoffLine}`;
    } else if (agent.vendor === 'wisprflow') {
      body = `Cleaned dictation & extracted key domain entities for "${trimmed}" (filler words stripped, technical nouns boosted via team dictionary).${handoffLine}`;
    } else if (agent.vendor === 'grok') {
      body = `Ran fast triage on "${trimmed}": flagged rate-limit edge cases and stale cache paths to harden before rollout.${handoffLine}`;
    } else if (agent.vendor === 'openai') {
      body = `Structured "${trimmed}" into clear acceptance criteria, owner assignments, and rollout milestones for the team.${handoffLine}`;
    } else {
      body = `[${agent.modelName} · ${agent.roleTitle}] Analyzed "${trimmed}" and prepared concrete next actions aligned with ${channel.name}.${handoffLine}`;
    }

    return {
      id: `msg-gt-${Date.now()}-${index}`,
      channelId: channel.id,
      senderType: 'agent',
      agentId: agent.id,
      senderName: agent.name,
      handle: agent.handle,
      content: body,
      timestamp,
      mentions: nextAgent ? [nextAgent.handle] : undefined,
      handoffToAgentId: nextAgent?.id
    };
  });
}

export const GENTEAM_TASK_COLUMNS: Array<{
  status: GenTeamTaskStatus;
  label: string;
}> = [
  { status: 'todo', label: 'To Do' },
  { status: 'in-progress', label: 'In Progress' },
  { status: 'in-review', label: 'In Review' },
  { status: 'done', label: 'Done' }
];

export function getNextTaskStatus(current: GenTeamTaskStatus): GenTeamTaskStatus {
  if (current === 'todo') return 'in-progress';
  if (current === 'in-progress') return 'in-review';
  if (current === 'in-review') return 'done';
  return 'todo';
}
