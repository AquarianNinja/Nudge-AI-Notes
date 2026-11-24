import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  Hash,
  Kanban,
  ListChecks,
  MessageSquare,
  PieChart,
  Play,
  Rocket,
  Send,
  Sliders,
  Trash2,
  UserPlus,
  Users
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  GenTeamAgent,
  GenTeamChannel,
  GenTeamMessage,
  GenTeamTask,
  GenTeamTaskStatus,
  Nanobot,
  NanobotRun,
  NanobotStatus,
  NanobotWizardSeed,
  UserIdentity
} from '../types/index.ts';
import {
  CreateGenTeamAgentInput,
  GENTEAM_ACCENT_STYLES,
  GENTEAM_TASK_COLUMNS,
  createGenTeamAgent,
  generateAgentCollaborationReplies,
  getAgentInitials,
  getNextTaskStatus,
  resolveRespondingAgentIds
} from '../utils/genTeam.ts';
import {
  DEADLINE_PRESETS,
  DeadlinePresetId,
  buildDeadlineIsoFromPreset,
  formatTaskDeadlineMeta
} from '../utils/genTeamTaskSummary.ts';
import { getEngineSpec, getStyleSpec } from '../utils/nanobotCatalog.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import {
  MOTION_OFFSETS,
  MOTION_SPRINGS,
  MOTION_TRANSITIONS,
  buildListItemVariants
} from '../utils/motion.ts';
import { AddGenTeamAgentModal } from './AddGenTeamAgentModal.tsx';
import { AgentTaskSummaryDashboard } from './AgentTaskSummaryDashboard.tsx';
import { CreateNanobotPayload, CreateNanobotWizard } from './CreateNanobotWizard.tsx';
import { NanobotDetailView, NanobotStatusChip } from './NanobotDetailView.tsx';
import { SkeletonStreamLoader } from './MotionPrimitives.tsx';

type GenTeamPage = 'directory' | 'agent' | 'channel' | 'board' | 'create-nanobot' | 'nanobot-detail';
type AgentSubPage = 'summary' | 'chat' | 'tasks' | 'profile';
type BoardSubView = 'kanban' | 'summary';

const AGENT_SUB_PAGES: readonly AgentSubPage[] = ['summary', 'chat', 'tasks', 'profile'];

interface GenTeamViewProps {
  agents: GenTeamAgent[];
  channels: GenTeamChannel[];
  messages: GenTeamMessage[];
  tasks: GenTeamTask[];
  onAgentsChange: React.Dispatch<React.SetStateAction<GenTeamAgent[]>>;
  onChannelsChange: React.Dispatch<React.SetStateAction<GenTeamChannel[]>>;
  onMessagesChange: React.Dispatch<React.SetStateAction<GenTeamMessage[]>>;
  onTasksChange: React.Dispatch<React.SetStateAction<GenTeamTask[]>>;
  embedded?: boolean;
  onBackToTimeline?: () => void;
  identity?: UserIdentity;
  nanobots?: Nanobot[];
  nanobotRuns?: NanobotRun[];
  onReleaseNanobot?: (payload: CreateNanobotPayload) => Promise<Nanobot>;
  onRerunNanobot?: (bot: Nanobot) => Promise<void>;
  onUpdateNanobot?: (
    botId: string,
    patch: {
      name?: string;
      modelId?: string;
      taskPrompt?: string;
      schedule?: Nanobot['schedule'];
      status?: NanobotStatus;
    }
  ) => Promise<void>;
  onDeleteNanobot?: (bot: Nanobot) => Promise<void>;
  nanobotWizardSeed?: NanobotWizardSeed | null;
  onClearNanobotSeed?: () => void;
  focusedAgentId?: string | null;
  focusedAgentNonce?: number;
}

function renderMessageWithMentions(
  content: string,
  agents: GenTeamAgent[]
): React.ReactNode {
  const handles = new Set(agents.map(a => a.handle.toLowerCase()));
  handles.add('@team');
  handles.add('@all');

  const parts = content.split(/(@[a-z0-9_-]+)/gi);
  return parts.map((part, idx) => {
    if (part.startsWith('@') && handles.has(part.toLowerCase())) {
      return (
        <span key={idx} className="font-mono font-medium text-[#58A6FF]">
          {part}
        </span>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function formatExecutionLabel(mode: GenTeamAgent['executionMode']): string {
  if (mode === 'local-cli') return 'Local CLI';
  if (mode === 'voice-stream') return 'Voice Stream';
  return 'Cloud Sandbox';
}

function formatTaskStatusLabel(status: GenTeamTaskStatus): string {
  if (status === 'todo') return 'To Do';
  if (status === 'in-progress') return 'In Progress';
  if (status === 'in-review') return 'In Review';
  return 'Done';
}

export const GenTeamView: React.FC<GenTeamViewProps> = ({
  agents,
  channels,
  messages,
  tasks,
  onAgentsChange,
  onChannelsChange,
  onMessagesChange,
  onTasksChange,
  embedded = false,
  onBackToTimeline,
  identity,
  nanobots = [],
  nanobotRuns = [],
  onReleaseNanobot,
  onRerunNanobot,
  onUpdateNanobot,
  onDeleteNanobot,
  nanobotWizardSeed,
  onClearNanobotSeed,
  focusedAgentId,
  focusedAgentNonce
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const listItemVariants = buildListItemVariants(prefersReduced);

  const initialFocusedAgent =
    !nanobotWizardSeed && focusedAgentId
      ? agents.find((a) => a.id === focusedAgentId) || null
      : null;

  const [[activePage, pageDirection], setPageState] = useState<[GenTeamPage, 1 | -1]>(() => [
    nanobotWizardSeed ? 'create-nanobot' : initialFocusedAgent ? 'agent' : 'directory',
    1
  ]);
  const [selectedNanobotId, setSelectedNanobotId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(
    initialFocusedAgent?.id || agents[0]?.id || 'agent-claude'
  );
  const [[agentSubPage, agentSubDir], setAgentSubPageState] = useState<[AgentSubPage, 1 | -1]>([
    initialFocusedAgent ? 'summary' : 'chat',
    1
  ]);
  const [activeChannelId, setActiveChannelId] = useState<string>(
    channels.find(c => c.kind === 'channel')?.id || channels[0]?.id || 'ch-claimcenter-core'
  );

  const [composerText, setComposerText] = useState('');
  const [thinkingAgentNames, setThinkingAgentNames] = useState<string[]>([]);
  const [isAddAgentOpen, setIsAddAgentOpen] = useState(false);

  // Team Board composer & summary state
  const [boardSubView, setBoardSubView] = useState<BoardSubView>('kanban');
  const [boardSummaryAgentId, setBoardSummaryAgentId] = useState<string>(
    agents[0]?.id || 'agent-claude'
  );
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState<string>(
    agents[0]?.id || 'agent-claude'
  );
  const [newTaskPriority, setNewTaskPriority] = useState<'Normal' | 'High'>('High');
  const [newTaskDeadlinePreset, setNewTaskDeadlinePreset] = useState<DeadlinePresetId>('tomorrow');

  // Per-Agent Tasks & Profile draft state
  const [agentTaskTitle, setAgentTaskTitle] = useState('');
  const [agentTaskPriority, setAgentTaskPriority] = useState<'Normal' | 'High'>('High');
  const [agentTaskDeadlinePreset, setAgentTaskDeadlinePreset] =
    useState<DeadlinePresetId>('tomorrow');
  const [profilePromptDraft, setProfilePromptDraft] = useState('');
  const [savedProfileFeedback, setSavedProfileFeedback] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (nanobotWizardSeed) {
      setPageState(['create-nanobot', 1]);
    }
  }, [nanobotWizardSeed?.nonce]);

  useEffect(() => {
    if (focusedAgentNonce === undefined) return;
    if (focusedAgentId) {
      const target = agents.find((a) => a.id === focusedAgentId);
      if (target) {
        ensureAgentDmChannel(target);
        setSelectedAgentId(target.id);
        setAgentSubPageState(['summary', 1]);
        setComposerText('');
        setPageState(['agent', 1]);
      }
    } else if (!nanobotWizardSeed) {
      setPageState(['directory', -1]);
    }
  }, [focusedAgentId, focusedAgentNonce]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(t => clearTimeout(t));
    };
  }, []);

  const pageVariants = useMemo(
    () => ({
      initial: (dir: 1 | -1) => (prefersReduced ? { opacity: 0 } : { opacity: 0, x: dir * 20 }),
      animate: { opacity: 1, x: 0, transition: MOTION_TRANSITIONS.microEnter },
      exit: (dir: 1 | -1) =>
        prefersReduced
          ? { opacity: 0, transition: MOTION_TRANSITIONS.elementExit }
          : { opacity: 0, x: dir * -20, transition: MOTION_TRANSITIONS.elementExit }
    }),
    [prefersReduced]
  );

  const groupChannels = useMemo(
    () => channels.filter(c => c.kind === 'channel'),
    [channels]
  );

  const selectedAgent = useMemo(
    () => agents.find(a => a.id === selectedAgentId) || agents[0],
    [agents, selectedAgentId]
  );

  const selectedAgentDmChannel = useMemo(() => {
    if (!selectedAgent) return undefined;
    return channels.find(c => c.kind === 'dm' && c.dmAgentId === selectedAgent.id);
  }, [channels, selectedAgent]);

  const activeGroupChannel = useMemo(
    () => groupChannels.find(c => c.id === activeChannelId) || groupChannels[0] || channels[0],
    [groupChannels, channels, activeChannelId]
  );

  const currentChatChannel =
    activePage === 'agent' ? selectedAgentDmChannel : activeGroupChannel;

  const currentChatMessages = useMemo(() => {
    if (!currentChatChannel) return [];
    return messages.filter(m => m.channelId === currentChatChannel.id);
  }, [messages, currentChatChannel]);

  const selectedAgentTasks = useMemo(() => {
    if (!selectedAgent) return [];
    return tasks.filter(t => t.assigneeAgentId === selectedAgent.id);
  }, [tasks, selectedAgent]);

  const boardSummaryAgent = useMemo(
    () => agents.find(a => a.id === boardSummaryAgentId) || agents[0],
    [agents, boardSummaryAgentId]
  );

  useEffect(() => {
    if (selectedAgent) {
      setProfilePromptDraft(selectedAgent.systemPrompt);
      setSavedProfileFeedback(false);
    }
  }, [selectedAgent?.id]);

  useEffect(() => {
    if (!agents.some(a => a.id === newTaskAssigneeId) && agents[0]) {
      setNewTaskAssigneeId(agents[0].id);
    }
    if (!agents.some(a => a.id === boardSummaryAgentId) && agents[0]) {
      setBoardSummaryAgentId(agents[0].id);
    }
  }, [agents, newTaskAssigneeId, boardSummaryAgentId]);

  useEffect(() => {
    if (
      (activePage === 'channel' || (activePage === 'agent' && agentSubPage === 'chat')) &&
      scrollRef.current
    ) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentChatMessages.length, thinkingAgentNames.length, activePage, agentSubPage]);

  const ensureAgentDmChannel = (agent: GenTeamAgent): GenTeamChannel => {
    const existing = channels.find(c => c.kind === 'dm' && c.dmAgentId === agent.id);
    if (existing) return existing;
    const created: GenTeamChannel = {
      id: `dm-${agent.id}`,
      name: agent.name,
      kind: 'dm',
      dmAgentId: agent.id,
      description: `Direct 1:1 thread with ${agent.name} · ${agent.roleTitle}`,
      memberAgentIds: [agent.id]
    };
    onChannelsChange(prev =>
      prev.some(c => c.id === created.id) ? prev : [...prev, created]
    );
    return created;
  };

  const openAgentSpace = (agent: GenTeamAgent, subPage: AgentSubPage = 'chat') => {
    triggerHaptic('selection');
    ensureAgentDmChannel(agent);
    setSelectedAgentId(agent.id);
    setAgentSubPageState([subPage, 1]);
    setComposerText('');
    setPageState(['agent', 1]);
  };

  const openGroupChannel = (channel: GenTeamChannel) => {
    triggerHaptic('selection');
    setActiveChannelId(channel.id);
    setComposerText('');
    setPageState(['channel', 1]);
  };

  const selectedNanobot = useMemo(
    () => nanobots.find((b) => b.id === selectedNanobotId) || null,
    [nanobots, selectedNanobotId]
  );

  const openCreateNanobot = () => {
    triggerHaptic('selection');
    setPageState(['create-nanobot', 1]);
  };

  const openNanobotDetail = (bot: Nanobot) => {
    triggerHaptic('selection');
    setSelectedNanobotId(bot.id);
    setPageState(['nanobot-detail', 1]);
  };

  const openTeamBoard = () => {
    triggerHaptic('selection');
    setPageState(['board', 1]);
  };

  const backToDirectory = () => {
    triggerHaptic('selection');
    setComposerText('');
    setPageState(['directory', -1]);
  };

  const switchAgentSubPage = (next: AgentSubPage) => {
    triggerHaptic('selection');
    setAgentSubPageState(([prev]) => {
      if (prev === next) return [prev, 1];
      const prevIdx = AGENT_SUB_PAGES.indexOf(prev);
      const nextIdx = AGENT_SUB_PAGES.indexOf(next);
      return [next, nextIdx >= prevIdx ? 1 : -1];
    });
  };

  const handleInsertMention = (handle: string) => {
    triggerHaptic('selection');
    setComposerText(prev => {
      const trimmed = prev.trimEnd();
      return trimmed ? `${trimmed} ${handle} ` : `${handle} `;
    });
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = composerText.trim();
    if (!clean || thinkingAgentNames.length > 0) return;

    let targetChannel = currentChatChannel;
    if (!targetChannel && activePage === 'agent' && selectedAgent) {
      targetChannel = ensureAgentDmChannel(selectedAgent);
    }
    if (!targetChannel) return;

    triggerHaptic('medium');
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const humanMsg: GenTeamMessage = {
      id: `msg-human-${Date.now()}`,
      channelId: targetChannel.id,
      senderType: 'human',
      senderName: 'You',
      handle: '@lead',
      content: clean,
      timestamp: now
    };

    onMessagesChange(prev => [...prev, humanMsg]);
    setComposerText('');

    const targetIds = resolveRespondingAgentIds(clean, targetChannel, agents);
    const responderAgents = targetIds
      .map(id => agents.find(a => a.id === id))
      .filter((a): a is GenTeamAgent => Boolean(a));

    if (responderAgents.length === 0) return;

    setThinkingAgentNames(responderAgents.map(a => a.name));
    onAgentsChange(prev =>
      prev.map(a => (targetIds.includes(a.id) ? { ...a, status: 'thinking' } : a))
    );

    const replies = generateAgentCollaborationReplies({
      prompt: clean,
      channel: targetChannel,
      agents,
      targetAgentIds: targetIds,
      timestamp: now
    });

    replies.forEach((reply, idx) => {
      const timer = setTimeout(() => {
        onMessagesChange(prev => [...prev, reply]);
        if (reply.agentId) {
          onAgentsChange(prev =>
            prev.map(a => (a.id === reply.agentId ? { ...a, status: 'online' } : a))
          );
        }
        if (idx === replies.length - 1) {
          setThinkingAgentNames([]);
          triggerHaptic('success');
        } else {
          triggerHaptic('light');
        }
      }, 360 + idx * 380);
      timersRef.current.push(timer);
    });
  };

  const handleAddAgent = (input: CreateGenTeamAgentInput) => {
    const { agent, dmChannel } = createGenTeamAgent(input, agents);
    onAgentsChange(prev => [...prev, agent]);
    onChannelsChange(prev => [
      ...prev.map(ch =>
        ch.kind === 'channel'
          ? { ...ch, memberAgentIds: [...ch.memberAgentIds, agent.id] }
          : ch
      ),
      dmChannel
    ]);
    onMessagesChange(prev => [
      ...prev,
      {
        id: `msg-welcome-${agent.id}`,
        channelId: dmChannel.id,
        senderType: 'agent',
        agentId: agent.id,
        senderName: agent.name,
        handle: agent.handle,
        content: `Connected to NanoTeam as ${agent.roleTitle} (${agent.modelName} · ${formatExecutionLabel(
          agent.executionMode
        )}). Mention ${agent.handle} in any channel or message me here directly.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setSelectedAgentId(agent.id);
    setAgentSubPageState(['chat', 1]);
    setPageState(['agent', 1]);
  };

  const handleToggleAgentStatus = (agentId: string) => {
    triggerHaptic('selection');
    onAgentsChange(prev =>
      prev.map(a =>
        a.id === agentId
          ? { ...a, status: a.status === 'idle' ? 'online' : 'idle' }
          : a
      )
    );
  };

  const handleSaveAgentDirectives = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgent) return;
    const trimmed = profilePromptDraft.trim();
    onAgentsChange(prev =>
      prev.map(a =>
        a.id === selectedAgent.id ? { ...a, systemPrompt: trimmed || a.systemPrompt } : a
      )
    );
    setSavedProfileFeedback(true);
    triggerHaptic('success');
    const timer = setTimeout(() => setSavedProfileFeedback(false), 1800);
    timersRef.current.push(timer);
  };

  const handleRemoveAgent = (agentId: string) => {
    triggerHaptic('warning');
    onAgentsChange(prev => prev.filter(a => a.id !== agentId));
    onChannelsChange(prev =>
      prev
        .filter(c => c.dmAgentId !== agentId)
        .map(c => ({
          ...c,
          memberAgentIds: c.memberAgentIds.filter(id => id !== agentId)
        }))
    );
    if (selectedAgentId === agentId) {
      setPageState(['directory', -1]);
    }
  };

  const handlePromoteMessageToTask = (msg: GenTeamMessage, stayInAgentSpace = false) => {
    const assigneeId =
      stayInAgentSpace && selectedAgent
        ? selectedAgent.id
        : msg.agentId || agents[0]?.id || 'agent-claude';
    const snippet = msg.content.length > 56 ? `${msg.content.slice(0, 56)}…` : msg.content;
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const created: GenTeamTask = {
      id: `task-gt-${Date.now()}`,
      title: msg.taskRefTitle || snippet,
      description: `Created from ${msg.senderName} (${msg.handle}) in ${currentChatChannel?.name || '#channel'}.`,
      status: 'todo',
      assigneeAgentId: assigneeId,
      channelId: msg.channelId,
      priority: 'Normal',
      updatedAt: now,
      deadlineIso: buildDeadlineIsoFromPreset('tomorrow')
    };
    onTasksChange(prev => [created, ...prev]);
    triggerHaptic('success');
    if (stayInAgentSpace) {
      switchAgentSubPage('tasks');
    } else {
      openTeamBoard();
    }
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTaskTitle.trim();
    if (!title) {
      triggerHaptic('warning');
      return;
    }
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const created: GenTeamTask = {
      id: `task-gt-${Date.now()}`,
      title,
      description: `Assigned via NanoTeam Board in ${activeGroupChannel?.name || '#claimcenter-core'}.`,
      status: 'todo',
      assigneeAgentId: newTaskAssigneeId || agents[0]?.id || 'agent-claude',
      channelId: activeGroupChannel?.id || 'ch-claimcenter-core',
      priority: newTaskPriority,
      updatedAt: now,
      deadlineIso: buildDeadlineIsoFromPreset(newTaskDeadlinePreset)
    };
    onTasksChange(prev => [created, ...prev]);
    setNewTaskTitle('');
    triggerHaptic('success');
  };

  const handleCreateAgentTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgent) return;
    const title = agentTaskTitle.trim();
    if (!title) {
      triggerHaptic('warning');
      return;
    }
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dm = ensureAgentDmChannel(selectedAgent);
    const created: GenTeamTask = {
      id: `task-gt-${Date.now()}`,
      title,
      description: `Assigned directly in ${selectedAgent.name}'s space.`,
      status: 'todo',
      assigneeAgentId: selectedAgent.id,
      channelId: dm.id,
      priority: agentTaskPriority,
      updatedAt: now,
      deadlineIso: buildDeadlineIsoFromPreset(agentTaskDeadlinePreset)
    };
    onTasksChange(prev => [created, ...prev]);
    setAgentTaskTitle('');
    triggerHaptic('success');
  };

  const handleAdvanceTask = (taskId: string) => {
    triggerHaptic('selection');
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    onTasksChange(prev =>
      prev.map(t =>
        t.id === taskId ? { ...t, status: getNextTaskStatus(t.status), updatedAt: now } : t
      )
    );
  };

  const handleRunAgentOnTask = (task: GenTeamTask, postToAgentDm = false) => {
    const agent = agents.find(a => a.id === task.assigneeAgentId) || agents[0];
    if (!agent) return;
    triggerHaptic('medium');
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const nextStatus: GenTeamTaskStatus =
      task.status === 'todo' ? 'in-progress' : task.status === 'in-progress' ? 'in-review' : 'done';

    onTasksChange(prev =>
      prev.map(t => (t.id === task.id ? { ...t, status: nextStatus, updatedAt: now } : t))
    );

    const targetChannel = postToAgentDm
      ? ensureAgentDmChannel(agent)
      : groupChannels[0] || activeGroupChannel;
    if (!targetChannel) return;

    const reply = generateAgentCollaborationReplies({
      prompt: `Execute Kanban task: ${task.title}`,
      channel: targetChannel,
      agents,
      targetAgentIds: [agent.id],
      timestamp: now
    })[0];

    if (reply) {
      onMessagesChange(prev => [
        ...prev,
        {
          ...reply,
          channelId: targetChannel.id,
          taskRefTitle: task.title
        }
      ]);
    }
    triggerHaptic('success');
  };

  const activeCount = agents.filter(a => a.status !== 'idle').length;
  const todoCount = tasks.filter(t => t.status === 'todo').length;
  const activeTaskCount = tasks.filter(
    t => t.status === 'in-progress' || t.status === 'in-review'
  ).length;
  const doneCount = tasks.filter(t => t.status === 'done').length;

  return (
    <div
      className={
        embedded
          ? 'flex flex-col flex-1 min-h-[480px] w-full overflow-hidden'
          : 'flex flex-col h-full max-w-5xl mx-auto w-full px-3 sm:px-5 pt-2.5 pb-24 overflow-hidden'
      }
    >
      <AnimatePresence mode="wait" initial={false} custom={pageDirection}>
        {/* ==================== LANDING PAGE: MINIMAL GENTEAM DIRECTORY ==================== */}
        {activePage === 'directory' && (
          <motion.div
            key="genteam-page-directory"
            custom={pageDirection}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden"
          >
            {/* Single Clean Header Bar */}
            <div className="min-h-[48px] px-3 py-1.5 rounded-2xl liquid-glass flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                {onBackToTimeline ? (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      onBackToTimeline();
                    }}
                    aria-label="Back to Crew Timeline"
                    className="min-h-[44px] px-2 flex items-center gap-1.5 rounded-xl text-xs font-medium text-[#54B0FF] hover:bg-white/[0.08] transition-colors whitespace-nowrap shrink-0"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Timeline</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2 px-1 min-w-0">
                    <Users className="w-4 h-4 text-[#58A6FF] shrink-0" />
                    <h2 className="text-xs font-semibold text-zinc-50 whitespace-nowrap">
                      NanoTeam
                    </h2>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-xs min-w-0 shrink-0">
                {onBackToTimeline && (
                  <span className="font-semibold text-zinc-100 whitespace-nowrap">NanoTeam</span>
                )}
                <span className="font-mono text-[11px] text-zinc-400 tabular-nums whitespace-nowrap shrink-0">
                  {onBackToTimeline ? `· ${activeCount}/${agents.length}` : `${activeCount}/${agents.length} active`}
                </span>
              </div>

              <motion.button
                type="button"
                data-haptic="selection"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                transition={MOTION_SPRINGS.interactive}
                onClick={() => setIsAddAgentOpen(true)}
                aria-label="Add NanoTeam agent"
                className="min-h-[38px] flex items-center gap-1 px-2.5 py-1.5 rounded-xl liquid-glass-subtle hover:bg-white/10 text-[11px] font-medium text-zinc-200 whitespace-nowrap shrink-0"
              >
                <UserPlus className="w-3.5 h-3.5 shrink-0 text-[#54B0FF]" />
                <span>Add Agent</span>
              </motion.button>
            </div>

            {/* Clean Scrollable Directory */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-0.5 pb-4">
              {/* Release Nanobot Primary Glass CTA */}
              {onReleaseNanobot && (
                <motion.button
                  type="button"
                  data-haptic="medium"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={openCreateNanobot}
                  aria-label="Release Nanobot"
                  className="w-full min-h-[54px] px-4 py-3 rounded-2xl liquid-accent-glass flex items-center justify-between gap-3 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
                      <Rocket className="w-4 h-4 text-white" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-white leading-snug">
                        Release Nanobot
                      </div>
                      <div className="text-[11px] text-white/80 truncate">
                        Pulse, Atlas, or Nova · Isolated per-bot sandbox
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white shrink-0" />
                </motion.button>
              )}

              {/* Released Nanobots Section */}
              {nanobots.length > 0 && (
                <section aria-label="Released Nanobots" className="space-y-1.5">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-medium text-zinc-400">
                      Nanobots · {nanobots.length}
                    </span>
                    <span className="text-[10.5px] font-mono text-zinc-500">
                      Sandboxed
                    </span>
                  </div>

                  <div className="rounded-2xl liquid-glass divide-y divide-white/10 overflow-hidden">
                    {nanobots.map((bot) => {
                      const eng = getEngineSpec(bot.engine);
                      const sty = getStyleSpec(bot.styleId);
                      const runCount = nanobotRuns.filter((r) => r.botId === bot.id).length;

                      return (
                        <motion.button
                          key={bot.id}
                          type="button"
                          data-haptic="selection"
                          whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                          transition={MOTION_SPRINGS.interactive}
                          onClick={() => openNanobotDetail(bot)}
                          aria-label={`Inspect Nanobot ${bot.name}`}
                          className="w-full min-h-[64px] px-3.5 py-2.5 flex items-center justify-between gap-2.5 text-left hover:bg-white/[0.06] transition-colors group"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="w-9 h-9 rounded-xl bg-[#0F7FFF]/18 border border-[#54B0FF]/35 flex items-center justify-center text-[#54B0FF] shrink-0">
                              <Bot className="w-4 h-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-[13px] font-semibold text-zinc-100 truncate">
                                {bot.name}
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 truncate mt-0.5 tabular-nums">
                                <span>{eng.name}</span>
                                <span aria-hidden="true">·</span>
                                <span>{sty.name}</span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono">{runCount} {runCount === 1 ? 'run' : 'runs'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <NanobotStatusChip status={bot.status} />
                            <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Team Task Board Entry Row */}
              <motion.button
                type="button"
                data-haptic="selection"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                transition={MOTION_SPRINGS.interactive}
                onClick={openTeamBoard}
                className="w-full min-h-[60px] px-3.5 py-3 rounded-2xl liquid-glass hover:bg-white/[0.06] flex items-center justify-between gap-3 text-left transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="w-9 h-9 rounded-xl bg-[#0F7FFF]/18 border border-[#0F7FFF]/40 flex items-center justify-center shrink-0">
                    <Kanban className="w-4 h-4 text-[#58A6FF]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-zinc-100 leading-snug">
                      Team Task Board
                    </div>
                    <div className="text-[11px] text-zinc-400 truncate tabular-nums mt-0.5">
                      {todoCount} to do · {activeTaskCount} active · {doneCount} done
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[11px] font-mono tabular-nums text-zinc-300">
                    {tasks.length}
                  </span>
                  <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
                </div>
              </motion.button>

              {/* AI Agents Directory — Each agent drills into its own connected space */}
              <section aria-label="AI Agents directory" className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-medium text-zinc-400">
                    AI Agents · {agents.length}
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    Summary · Chat · Tasks · Profile
                  </span>
                </div>

                <div className="rounded-2xl liquid-glass divide-y divide-white/10 overflow-hidden">
                  {agents.map((agent) => {
                    const accentStyle = GENTEAM_ACCENT_STYLES[agent.accent];
                    const agentTasksCount = tasks.filter(
                      t => t.assigneeAgentId === agent.id && t.status !== 'done'
                    ).length;
                    const statusLabel =
                      agent.status === 'thinking'
                        ? 'Working'
                        : agent.status === 'idle'
                        ? 'Idle'
                        : 'Online';

                    return (
                      <motion.button
                        key={agent.id}
                        type="button"
                        data-haptic="selection"
                        whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                        transition={MOTION_SPRINGS.interactive}
                        onClick={() => openAgentSpace(agent, 'summary')}
                        aria-label={`Open ${agent.name} workspace`}
                        className="w-full min-h-[64px] px-3.5 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-white/[0.06] transition-colors group"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span
                            className={`w-9 h-9 rounded-xl border flex items-center justify-center text-xs font-semibold shrink-0 ${accentStyle.avatarClass}`}
                          >
                            {getAgentInitials(agent.name)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-[13px] min-w-0">
                              <span className="font-semibold text-zinc-100 truncate">
                                {agent.name}
                              </span>
                              <span className="font-mono text-[11px] text-[#58A6FF] shrink-0">
                                {agent.handle}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 truncate mt-0.5 tabular-nums">
                              <span className="truncate">{agent.roleTitle}</span>
                              <span aria-hidden="true">·</span>
                              <span
                                className={
                                  agent.status === 'idle'
                                    ? 'text-zinc-500 shrink-0'
                                    : 'text-emerald-300 shrink-0'
                                }
                              >
                                {statusLabel}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="shrink-0">
                                {agentTasksCount} {agentTasksCount === 1 ? 'task' : 'tasks'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-200 shrink-0 transition-colors" />
                      </motion.button>
                    );
                  })}
                </div>
              </section>

              {/* Shared Group Channels Directory */}
              <section aria-label="Shared channels directory" className="space-y-1.5">
                <div className="px-1">
                  <span className="text-[11px] font-medium text-zinc-400">
                    Channels · {groupChannels.length}
                  </span>
                </div>

                <div className="rounded-2xl liquid-glass divide-y divide-white/10 overflow-hidden">
                  {groupChannels.map((ch) => {
                    const msgCount = messages.filter(m => m.channelId === ch.id).length;
                    return (
                      <motion.button
                        key={ch.id}
                        type="button"
                        data-haptic="selection"
                        whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                        transition={MOTION_SPRINGS.interactive}
                        onClick={() => openGroupChannel(ch)}
                        aria-label={`Open channel ${ch.name}`}
                        className="w-full min-h-[60px] px-3.5 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-white/[0.06] transition-colors group"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="w-9 h-9 rounded-xl liquid-glass-subtle flex items-center justify-center shrink-0">
                            <Hash className="w-4 h-4 text-[#58A6FF]" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-semibold text-zinc-100 truncate">
                              {ch.name.replace(/^#/, '')}
                            </div>
                            <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                              {ch.description}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[11px] font-mono tabular-nums text-zinc-400">
                            {msgCount}
                          </span>
                          <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </section>
            </div>
          </motion.div>
        )}

        {/* ==================== AGENT SPACE: PER-AGENT CONNECTED PAGES ==================== */}
        {activePage === 'agent' && selectedAgent && (
          <motion.div
            key={`genteam-page-agent-${selectedAgent.id}`}
            custom={pageDirection}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden"
          >
            {/* Segregated Back Header + Agent Identity */}
            <div className="min-h-[48px] px-3 py-1.5 rounded-2xl liquid-glass flex items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={backToDirectory}
                aria-label="Back to NanoTeam directory"
                className="min-h-[44px] px-2 flex items-center gap-1.5 rounded-xl text-xs font-medium text-[#54B0FF] hover:bg-white/[0.08] transition-colors whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>NanoTeam</span>
              </button>

              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-6 h-6 rounded-lg border flex items-center justify-center text-[10px] font-semibold shrink-0 ${
                    GENTEAM_ACCENT_STYLES[selectedAgent.accent].avatarClass
                  }`}
                >
                  {getAgentInitials(selectedAgent.name)}
                </span>
                <div className="min-w-0 text-center sm:text-left">
                  <div className="text-xs font-semibold text-zinc-100 truncate">
                    {selectedAgent.name}
                  </div>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={selectedAgent.status !== 'idle'}
                aria-label={`Toggle ${selectedAgent.name} availability`}
                onClick={() => handleToggleAgentStatus(selectedAgent.id)}
                className={`min-h-[34px] px-2.5 py-1 rounded-xl text-[11px] font-medium border transition-colors whitespace-nowrap shrink-0 ${
                  selectedAgent.status !== 'idle'
                    ? 'bg-emerald-500/18 text-emerald-300 border-emerald-400/35'
                    : 'liquid-glass-subtle text-zinc-400 border-white/10'
                }`}
              >
                {selectedAgent.status === 'thinking'
                  ? 'Working'
                  : selectedAgent.status === 'idle'
                  ? 'Idle'
                  : 'Online'}
              </button>
            </div>

            {/* Agent Connected Page Switcher: Summary | Chat | Tasks | Profile */}
            <div className="p-1 rounded-xl liquid-glass shrink-0">
              <div
                role="tablist"
                aria-label={`${selectedAgent.name} connected pages`}
                className="flex items-center gap-1"
              >
                {(
                  [
                    { id: 'summary', label: 'Summary', Icon: PieChart },
                    { id: 'chat', label: 'Chat', Icon: MessageSquare },
                    { id: 'tasks', label: `Tasks (${selectedAgentTasks.length})`, Icon: ListChecks },
                    { id: 'profile', label: 'Profile', Icon: Sliders }
                  ] as const
                ).map(({ id, label, Icon }) => {
                  const active = agentSubPage === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => switchAgentSubPage(id)}
                      className={`relative flex-1 min-w-0 min-h-[38px] flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap ${
                        active ? 'text-white font-semibold' : 'text-zinc-300 hover:text-white'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="genteam-agent-subpage-pill"
                          transition={MOTION_SPRINGS.pill}
                          aria-hidden="true"
                          className="absolute inset-0 rounded-lg liquid-accent-glass"
                        />
                      )}
                      <Icon className="relative z-10 w-3 h-3 shrink-0" />
                      <span className="relative z-10">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Agent Sub-Page Content */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <AnimatePresence mode="wait" initial={false} custom={agentSubDir}>
                {/* 0. AGENT SUMMARY TASK DASHBOARD */}
                {agentSubPage === 'summary' && (
                  <motion.div
                    key={`agent-summary-${selectedAgent.id}`}
                    custom={agentSubDir}
                    variants={pageVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="flex-1 min-h-0 overflow-y-auto pr-0.5 pb-4"
                  >
                    <AgentTaskSummaryDashboard
                      agent={selectedAgent}
                      tasks={tasks}
                      onRunTask={(task) => handleRunAgentOnTask(task, true)}
                      onAdvanceTask={handleAdvanceTask}
                      onAssignNewTask={() => switchAgentSubPage('tasks')}
                    />
                  </motion.div>
                )}

                {/* 1. AGENT 1:1 CHAT */}
                {agentSubPage === 'chat' && (
                  <motion.div
                    key={`agent-chat-${selectedAgent.id}`}
                    custom={agentSubDir}
                    variants={pageVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="flex-1 min-h-0 flex flex-col overflow-hidden"
                  >
                    <div
                      ref={scrollRef}
                      className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-0.5 pb-3"
                    >
                      {currentChatMessages.length === 0 ? (
                        <div className="p-6 rounded-2xl liquid-glass text-center space-y-1.5">
                          <div className="text-xs font-medium text-zinc-100">
                            Direct 1:1 thread with {selectedAgent.name}
                          </div>
                          <p className="text-[11px] text-zinc-400">
                            {selectedAgent.roleTitle} · {selectedAgent.modelName}
                          </p>
                        </div>
                      ) : (
                        currentChatMessages.map((msg, idx) => {
                          const isHuman = msg.senderType === 'human';
                          const accentStyle = GENTEAM_ACCENT_STYLES[selectedAgent.accent];
                          return (
                            <motion.div
                              key={msg.id}
                              custom={idx}
                              variants={listItemVariants}
                              initial="initial"
                              animate="animate"
                              className={`flex items-start gap-2.5 p-3.5 rounded-2xl ${
                                isHuman ? 'liquid-glass' : 'liquid-glass-subtle'
                              }`}
                            >
                              <div
                                className={`w-7 h-7 rounded-lg border flex items-center justify-center text-[10px] font-semibold shrink-0 mt-0.5 ${
                                  isHuman
                                    ? 'bg-zinc-100 text-zinc-950 border-zinc-100'
                                    : accentStyle.avatarClass
                                }`}
                              >
                                {isHuman ? 'YOU' : getAgentInitials(msg.senderName)}
                              </div>

                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                    <span className="font-semibold text-zinc-100">
                                      {msg.senderName}
                                    </span>
                                    <span className="font-mono text-[#58A6FF]">{msg.handle}</span>
                                    <span aria-hidden="true" className="text-zinc-600">·</span>
                                    <span className="font-mono tabular-nums text-zinc-500">
                                      {msg.timestamp}
                                    </span>
                                  </div>

                                  {!isHuman && (
                                    <button
                                      type="button"
                                      onClick={() => handlePromoteMessageToTask(msg, true)}
                                      className="text-[10.5px] font-medium text-[#58A6FF] hover:text-white transition-colors whitespace-nowrap"
                                    >
                                      + Add Task
                                    </button>
                                  )}
                                </div>

                                <p className="text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap">
                                  {renderMessageWithMentions(msg.content, agents)}
                                </p>
                              </div>
                            </motion.div>
                          );
                        })
                      )}

                      {thinkingAgentNames.length > 0 && (
                        <SkeletonStreamLoader
                          label={`${thinkingAgentNames.join(', ')} responding...`}
                          lines={2}
                        />
                      )}
                    </div>

                    <form
                      onSubmit={handleSendMessage}
                      className="flex items-center gap-2 p-1.5 rounded-2xl liquid-glass-elevated focus-within:border-[#0F7FFF]/70 transition-colors shrink-0 mt-1"
                    >
                      <input
                        type="text"
                        aria-label={`Message ${selectedAgent.name}`}
                        value={composerText}
                        onChange={(e) => setComposerText(e.target.value)}
                        placeholder={`Message ${selectedAgent.name} (${selectedAgent.handle})...`}
                        className="flex-1 min-w-0 bg-transparent px-3 py-2 text-xs text-zinc-100 placeholder-zinc-400 focus:outline-hidden"
                      />
                      <button
                        type="submit"
                        disabled={!composerText.trim() || thinkingAgentNames.length > 0}
                        aria-label={`Send message to ${selectedAgent.name}`}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl liquid-accent-glass disabled:opacity-35 transition-opacity shrink-0"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </form>
                  </motion.div>
                )}

                {/* 2. AGENT TASKS */}
                {agentSubPage === 'tasks' && (
                  <motion.div
                    key={`agent-tasks-${selectedAgent.id}`}
                    custom={agentSubDir}
                    variants={pageVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-0.5 pb-4"
                  >
                    <form
                      onSubmit={handleCreateAgentTask}
                      className="p-3 rounded-2xl liquid-glass space-y-2"
                    >
                      <input
                        type="text"
                        aria-label={`Assign new task to ${selectedAgent.name}`}
                        value={agentTaskTitle}
                        onChange={(e) => setAgentTaskTitle(e.target.value)}
                        placeholder={`Assign a task to ${selectedAgent.name}...`}
                        className="w-full min-h-[40px] liquid-glass-subtle rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:border-[#0F7FFF]"
                      />
                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                        <span className="text-[11px] text-zinc-400 shrink-0 mr-0.5">Due:</span>
                        {DEADLINE_PRESETS.map((preset) => {
                          const active = agentTaskDeadlinePreset === preset.id;
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              aria-pressed={active}
                              onClick={() => {
                                triggerHaptic('selection');
                                setAgentTaskDeadlinePreset(preset.id);
                              }}
                              className={`min-h-[34px] px-2.5 py-1 rounded-xl text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                                active
                                  ? 'liquid-accent-glass text-white font-semibold'
                                  : 'liquid-glass-subtle text-zinc-300 hover:text-white'
                              }`}
                            >
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <select
                          aria-label="Task priority"
                          value={agentTaskPriority}
                          onChange={(e) => setAgentTaskPriority(e.target.value as 'Normal' | 'High')}
                          className="min-h-[38px] liquid-glass-subtle rounded-xl px-2.5 py-1.5 text-xs text-zinc-100"
                        >
                          <option value="High" className="bg-zinc-900">
                            High priority
                          </option>
                          <option value="Normal" className="bg-zinc-900">
                            Normal priority
                          </option>
                        </select>

                        <button
                          type="submit"
                          disabled={!agentTaskTitle.trim()}
                          className="min-h-[38px] px-3.5 py-1.5 rounded-xl liquid-accent-glass text-xs font-semibold disabled:opacity-40 whitespace-nowrap"
                        >
                          Assign to {selectedAgent.name}
                        </button>
                      </div>
                    </form>

                    {selectedAgentTasks.length === 0 ? (
                      <div className="p-6 rounded-2xl liquid-glass text-center space-y-1.5">
                        <Bot className="w-6 h-6 text-[#58A6FF] mx-auto" />
                        <p className="text-xs font-medium text-zinc-200">
                          No tasks assigned to {selectedAgent.name}
                        </p>
                        <p className="text-[11px] text-zinc-400">
                          Assign a task above or promote a reply from 1:1 Chat.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedAgentTasks.map((task) => {
                          const deadlineMeta = formatTaskDeadlineMeta(task.deadlineIso);
                          const deadlineColorClass =
                            task.status === 'done'
                              ? 'text-emerald-300'
                              : deadlineMeta.urgency === 'overdue'
                              ? 'text-red-300'
                              : deadlineMeta.urgency === 'today'
                              ? 'text-amber-300'
                              : 'text-[#54B0FF]';

                          return (
                            <div
                              key={task.id}
                              className="p-3.5 rounded-2xl liquid-glass space-y-2"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] font-mono tabular-nums">
                                <span
                                  className={
                                    task.priority === 'High' ? 'text-amber-300' : 'text-zinc-400'
                                  }
                                >
                                  {formatTaskStatusLabel(task.status)} · {task.priority}
                                </span>
                                <span className={deadlineColorClass}>
                                  {task.status === 'done' ? `Completed · ${task.updatedAt}` : deadlineMeta.label}
                                </span>
                              </div>

                              <div className="text-xs font-semibold text-zinc-100 leading-snug">
                                {task.title}
                              </div>

                              <p className="text-[11px] text-zinc-300 leading-relaxed">
                                {task.description}
                              </p>

                              <div className="flex items-center justify-end gap-2 pt-1.5 border-t border-white/10">
                                <button
                                  type="button"
                                  onClick={() => handleRunAgentOnTask(task, true)}
                                  className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#0F7FFF]/20 hover:bg-[#0F7FFF]/35 text-[#58A6FF] text-[11px] font-medium whitespace-nowrap"
                                >
                                  <Play className="w-3 h-3" />
                                  <span>Run</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAdvanceTask(task.id)}
                                  className="min-h-[36px] px-3 py-1 rounded-xl liquid-glass-subtle hover:bg-white/10 text-[11px] font-medium text-zinc-200 whitespace-nowrap"
                                >
                                  Next Stage
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={openTeamBoard}
                      className="w-full min-h-[42px] px-3.5 py-2 rounded-2xl liquid-glass-subtle hover:bg-white/[0.08] flex items-center justify-between text-xs font-medium text-zinc-300 hover:text-white transition-colors"
                    >
                      <span>Open full Team Task Board</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </motion.div>
                )}

                {/* 3. AGENT PROFILE & DIRECTIVES */}
                {agentSubPage === 'profile' && (
                  <motion.div
                    key={`agent-profile-${selectedAgent.id}`}
                    custom={agentSubDir}
                    variants={pageVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-0.5 pb-4"
                  >
                    <div className="p-3.5 rounded-2xl liquid-glass space-y-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl border flex items-center justify-center text-xs font-semibold shrink-0 ${
                            GENTEAM_ACCENT_STYLES[selectedAgent.accent].avatarClass
                          }`}
                        >
                          {getAgentInitials(selectedAgent.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-sm">
                            <span className="font-semibold text-zinc-100 truncate">
                              {selectedAgent.name}
                            </span>
                            <span className="font-mono text-xs text-[#58A6FF]">
                              {selectedAgent.handle}
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                            {selectedAgent.roleTitle} · {selectedAgent.modelName}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-white/10 text-xs">
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-zinc-400">Runtime Environment</span>
                          <span className="font-mono text-zinc-200">
                            {formatExecutionLabel(selectedAgent.executionMode)}
                          </span>
                        </div>
                        <div className="flex items-start justify-between gap-3 text-[11px]">
                          <span className="text-zinc-400 shrink-0">Skills</span>
                          <span className="text-right text-zinc-200">
                            {selectedAgent.skills.join(' · ')}
                          </span>
                        </div>
                      </div>

                      <p className="text-[11px] text-zinc-300 leading-relaxed pt-2 border-t border-white/10">
                        {selectedAgent.specialty}
                      </p>
                    </div>

                    <form
                      onSubmit={handleSaveAgentDirectives}
                      className="p-3.5 rounded-2xl liquid-glass space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor="agent-directives-input"
                          className="text-xs font-semibold text-zinc-100"
                        >
                          Role Directives
                        </label>
                        {savedProfileFeedback && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300 font-medium">
                            <Check className="w-3.5 h-3.5" />
                            Saved
                          </span>
                        )}
                      </div>

                      <textarea
                        id="agent-directives-input"
                        rows={3}
                        value={profilePromptDraft}
                        onChange={(e) => setProfilePromptDraft(e.target.value)}
                        className="w-full liquid-glass-subtle rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:border-[#0F7FFF] resize-none"
                      />

                      <div className="flex items-center justify-between gap-2">
                        {!selectedAgent.isBuiltIn ? (
                          <button
                            type="button"
                            onClick={() => handleRemoveAgent(selectedAgent.id)}
                            className="min-h-[40px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl liquid-glass-subtle text-xs text-red-300 hover:bg-red-500/15 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove Agent</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-zinc-500">Built-in crew agent</span>
                        )}

                        <button
                          type="submit"
                          className="min-h-[40px] px-4 py-1.5 rounded-xl liquid-accent-glass text-xs font-semibold whitespace-nowrap"
                        >
                          Save Directives
                        </button>
                      </div>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {/* ==================== GROUP CHANNEL SUB-PAGE ==================== */}
        {activePage === 'channel' && activeGroupChannel && (
          <motion.div
            key={`genteam-page-channel-${activeGroupChannel.id}`}
            custom={pageDirection}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden"
          >
            {/* Segregated Back Header */}
            <div className="min-h-[48px] px-3 py-1.5 rounded-2xl liquid-glass flex items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={backToDirectory}
                aria-label="Back to NanoTeam directory"
                className="min-h-[44px] px-2 flex items-center gap-1.5 rounded-xl text-xs font-medium text-[#54B0FF] hover:bg-white/[0.08] transition-colors whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>NanoTeam</span>
              </button>

              <div className="flex items-center gap-1.5 text-xs min-w-0">
                <Hash className="w-3.5 h-3.5 text-[#58A6FF] shrink-0" />
                <span className="font-semibold text-zinc-100 truncate">
                  {activeGroupChannel.name.replace(/^#/, '')}
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {agents
                  .filter(a => activeGroupChannel.memberAgentIds.includes(a.id))
                  .slice(0, 4)
                  .map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      title={`Open ${a.name} space`}
                      aria-label={`Open ${a.name} space`}
                      onClick={() => openAgentSpace(a, 'chat')}
                      className={`w-7 h-7 rounded-lg border text-[10px] font-semibold flex items-center justify-center transition-transform hover:-translate-y-0.5 ${
                        GENTEAM_ACCENT_STYLES[a.accent].avatarClass
                      }`}
                    >
                      {getAgentInitials(a.name)}
                    </button>
                  ))}
              </div>
            </div>

            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div
                ref={scrollRef}
                className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-0.5 pb-3"
              >
                {currentChatMessages.length === 0 ? (
                  <div className="p-6 rounded-2xl liquid-glass text-center space-y-1.5">
                    <div className="text-xs font-medium text-zinc-100">
                      Start collaborating in {activeGroupChannel.name}
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      {activeGroupChannel.description}
                    </p>
                  </div>
                ) : (
                  currentChatMessages.map((msg, idx) => {
                    const agent = msg.agentId
                      ? agents.find(a => a.id === msg.agentId)
                      : undefined;
                    const isHuman = msg.senderType === 'human';
                    const accentStyle = agent
                      ? GENTEAM_ACCENT_STYLES[agent.accent]
                      : GENTEAM_ACCENT_STYLES.blue;
                    const handoffTarget = msg.handoffToAgentId
                      ? agents.find(a => a.id === msg.handoffToAgentId)
                      : undefined;

                    return (
                      <motion.div
                        key={msg.id}
                        custom={idx}
                        variants={listItemVariants}
                        initial="initial"
                        animate="animate"
                        className={`flex items-start gap-2.5 p-3.5 rounded-2xl ${
                          isHuman ? 'liquid-glass' : 'liquid-glass-subtle'
                        }`}
                      >
                        <button
                          type="button"
                          disabled={!agent}
                          onClick={() => {
                            if (agent) openAgentSpace(agent, 'chat');
                          }}
                          aria-label={agent ? `Open ${agent.name} space` : undefined}
                          className={`w-7 h-7 rounded-lg border flex items-center justify-center text-[10px] font-semibold shrink-0 mt-0.5 ${
                            isHuman
                              ? 'bg-zinc-100 text-zinc-950 border-zinc-100'
                              : `${accentStyle.avatarClass} cursor-pointer`
                          }`}
                        >
                          {isHuman ? 'YOU' : getAgentInitials(msg.senderName)}
                        </button>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                              {agent ? (
                                <button
                                  type="button"
                                  onClick={() => openAgentSpace(agent, 'chat')}
                                  className="font-semibold text-zinc-100 hover:text-[#58A6FF] transition-colors"
                                >
                                  {msg.senderName}
                                </button>
                              ) : (
                                <span className="font-semibold text-zinc-100">
                                  {msg.senderName}
                                </span>
                              )}
                              <span className="font-mono text-[#58A6FF]">{msg.handle}</span>
                              {agent && (
                                <>
                                  <span aria-hidden="true" className="text-zinc-600">·</span>
                                  <span className="text-zinc-400">{agent.modelName}</span>
                                </>
                              )}
                              <span aria-hidden="true" className="text-zinc-600">·</span>
                              <span className="font-mono tabular-nums text-zinc-500">
                                {msg.timestamp}
                              </span>
                            </div>

                            {!isHuman && (
                              <button
                                type="button"
                                onClick={() => handlePromoteMessageToTask(msg, false)}
                                className="text-[10.5px] font-medium text-zinc-400 hover:text-[#58A6FF] transition-colors whitespace-nowrap"
                              >
                                + Add to Board
                              </button>
                            )}
                          </div>

                          <p className="text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap">
                            {renderMessageWithMentions(msg.content, agents)}
                          </p>

                          {(handoffTarget || msg.taskRefTitle) && (
                            <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px] font-mono text-zinc-400">
                              {handoffTarget && (
                                <button
                                  type="button"
                                  onClick={() => openAgentSpace(handoffTarget, 'chat')}
                                  className="inline-flex items-center gap-1 text-[#58A6FF] hover:underline"
                                >
                                  <ArrowRight className="w-3 h-3" />
                                  <span>Handoff to {handoffTarget.name}</span>
                                </button>
                              )}
                              {msg.taskRefTitle && (
                                <span className="inline-flex items-center gap-1 text-emerald-400">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Task: {msg.taskRefTitle}</span>
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })
                )}

                {thinkingAgentNames.length > 0 && (
                  <SkeletonStreamLoader
                    label={`${thinkingAgentNames.join(', ')} collaborating...`}
                    lines={2}
                  />
                )}
              </div>

              {/* @Mention Selector Strip + Composer */}
              <div className="pt-2 space-y-1.5 shrink-0">
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                  <AtSign className="w-3 h-3 text-zinc-400 shrink-0 mr-0.5" />
                  {agents.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => handleInsertMention(a.handle)}
                      className="min-h-[30px] px-2.5 py-0.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-[11px] font-mono text-zinc-200 hover:text-[#58A6FF] whitespace-nowrap shrink-0 transition-colors"
                    >
                      {a.handle}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleInsertMention('@team')}
                    className="min-h-[30px] px-2.5 py-0.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-[11px] font-mono text-[#58A6FF] whitespace-nowrap shrink-0 transition-colors"
                  >
                    @team
                  </button>
                </div>

                <form
                  onSubmit={handleSendMessage}
                  className="flex items-center gap-2 p-1.5 rounded-2xl liquid-glass-elevated focus-within:border-[#0F7FFF]/70 transition-colors"
                >
                  <input
                    type="text"
                    aria-label={`Message ${activeGroupChannel.name}`}
                    value={composerText}
                    onChange={(e) => setComposerText(e.target.value)}
                    placeholder={`Message ${activeGroupChannel.name} · @mention any agent...`}
                    className="flex-1 min-w-0 bg-transparent px-3 py-2 text-xs text-zinc-100 placeholder-zinc-400 focus:outline-hidden"
                  />
                  <button
                    type="submit"
                    disabled={!composerText.trim() || thinkingAgentNames.length > 0}
                    aria-label="Send NanoTeam message"
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl liquid-accent-glass disabled:opacity-35 transition-opacity shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>
          </motion.div>
        )}

        {/* ==================== SHARED TEAM TASK BOARD SUB-PAGE ==================== */}
        {activePage === 'board' && (
          <motion.div
            key="genteam-page-board"
            custom={pageDirection}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden"
          >
            {/* Segregated Back Header */}
            <div className="min-h-[48px] px-3 py-1.5 rounded-2xl liquid-glass flex items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={backToDirectory}
                aria-label="Back to NanoTeam directory"
                className="min-h-[44px] px-2 flex items-center gap-1.5 rounded-xl text-xs font-medium text-[#54B0FF] hover:bg-white/[0.08] transition-colors whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>NanoTeam</span>
              </button>

              <div className="flex items-center gap-1.5 text-xs min-w-0">
                <Kanban className="w-3.5 h-3.5 text-[#58A6FF] shrink-0" />
                <span className="font-semibold text-zinc-100 truncate">Team Task Board</span>
                <span className="font-mono text-[11px] text-zinc-400 tabular-nums shrink-0">
                  · {tasks.length}
                </span>
              </div>
            </div>

            {/* Board View Switcher: Kanban | Agent Summary */}
            <div className="p-1 rounded-xl liquid-glass shrink-0">
              <div
                role="tablist"
                aria-label="Team Task Board views"
                className="grid grid-cols-2 gap-1"
              >
                {(
                  [
                    { id: 'kanban', label: 'Kanban Board', Icon: Kanban },
                    { id: 'summary', label: 'Agent Summary', Icon: PieChart }
                  ] as const
                ).map(({ id, label, Icon }) => {
                  const active = boardSubView === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        triggerHaptic('selection');
                        setBoardSubView(id);
                      }}
                      className={`relative min-h-[38px] flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap ${
                        active ? 'text-white font-semibold' : 'text-zinc-300 hover:text-white'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="genteam-board-subview-pill"
                          transition={MOTION_SPRINGS.pill}
                          aria-hidden="true"
                          className="absolute inset-0 rounded-lg liquid-accent-glass"
                        />
                      )}
                      <Icon className="relative z-10 w-3.5 h-3.5 shrink-0" />
                      <span className="relative z-10">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-0.5 pb-4">
              {boardSubView === 'summary' && boardSummaryAgent ? (
                <div className="space-y-3">
                  {/* Agent Selector Strip */}
                  <div
                    role="tablist"
                    aria-label="Select agent task summary"
                    className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5"
                  >
                    {agents.map((agent) => {
                      const isSelected = agent.id === boardSummaryAgent.id;
                      const pendingForAgent = tasks.filter(
                        t => t.assigneeAgentId === agent.id && t.status !== 'done'
                      ).length;
                      const accentStyle = GENTEAM_ACCENT_STYLES[agent.accent];

                      return (
                        <button
                          key={agent.id}
                          type="button"
                          role="tab"
                          aria-selected={isSelected}
                          onClick={() => {
                            triggerHaptic('selection');
                            setBoardSummaryAgentId(agent.id);
                          }}
                          className={`min-h-[38px] flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                            isSelected
                              ? 'liquid-accent-glass text-white font-semibold'
                              : 'liquid-glass text-zinc-300 hover:text-white'
                          }`}
                        >
                          <span
                            className={`w-5 h-5 rounded-md border flex items-center justify-center text-[9px] font-semibold shrink-0 ${accentStyle.avatarClass}`}
                          >
                            {getAgentInitials(agent.name)}
                          </span>
                          <span>{agent.name}</span>
                          <span className="font-mono text-[10px] tabular-nums opacity-80">
                            · {pendingForAgent}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <AgentTaskSummaryDashboard
                    agent={boardSummaryAgent}
                    tasks={tasks}
                    onRunTask={(task) => handleRunAgentOnTask(task, false)}
                    onAdvanceTask={handleAdvanceTask}
                    onAssignNewTask={() => {
                      setNewTaskAssigneeId(boardSummaryAgent.id);
                      setBoardSubView('kanban');
                    }}
                  />
                </div>
              ) : (
                <>
                  <form
                    onSubmit={handleCreateTask}
                    className="p-3 rounded-2xl liquid-glass space-y-2 shrink-0"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        aria-label="New AI agent task title"
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        placeholder="Assign a new task to any AI teammate..."
                        className="flex-1 min-w-[180px] min-h-[40px] liquid-glass-subtle rounded-xl px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:border-[#0F7FFF]"
                      />

                      <select
                        aria-label="Assign task to agent"
                        value={newTaskAssigneeId}
                        onChange={(e) => setNewTaskAssigneeId(e.target.value)}
                        className="min-h-[40px] liquid-glass-subtle rounded-xl px-2.5 py-1.5 text-xs text-zinc-100"
                      >
                        {agents.map(a => (
                          <option key={a.id} value={a.id} className="bg-zinc-900">
                            {a.name} ({a.handle})
                          </option>
                        ))}
                      </select>

                      <select
                        aria-label="Task priority"
                        value={newTaskPriority}
                        onChange={(e) => setNewTaskPriority(e.target.value as 'Normal' | 'High')}
                        className="min-h-[40px] liquid-glass-subtle rounded-xl px-2.5 py-1.5 text-xs text-zinc-100"
                      >
                        <option value="High" className="bg-zinc-900">
                          High
                        </option>
                        <option value="Normal" className="bg-zinc-900">
                          Normal
                        </option>
                      </select>

                      <button
                        type="submit"
                        className="min-h-[40px] px-3.5 py-1.5 rounded-xl liquid-accent-glass text-xs font-semibold whitespace-nowrap"
                      >
                        Assign Task
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                      <span className="text-[11px] text-zinc-400 shrink-0 mr-0.5">Due:</span>
                      {DEADLINE_PRESETS.map((preset) => {
                        const active = newTaskDeadlinePreset === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => {
                              triggerHaptic('selection');
                              setNewTaskDeadlinePreset(preset.id);
                            }}
                            className={`min-h-[34px] px-2.5 py-1 rounded-xl text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                              active
                                ? 'liquid-accent-glass text-white font-semibold'
                                : 'liquid-glass-subtle text-zinc-300 hover:text-white'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </form>

                  <div className="grid grid-cols-1 @xl:grid-cols-2 @3xl:grid-cols-4 gap-2.5">
                    {GENTEAM_TASK_COLUMNS.map((col) => {
                      const colTasks = tasks.filter(t => t.status === col.status);
                      return (
                        <div
                          key={col.status}
                          className="rounded-2xl liquid-glass p-2.5 flex flex-col gap-2"
                        >
                          <div className="flex items-center justify-between px-1 pb-1.5 border-b border-white/10">
                            <span className="text-[11px] font-semibold text-zinc-100">
                              {col.label}
                            </span>
                            <span className="text-[10px] font-mono tabular-nums text-zinc-400">
                              {colTasks.length}
                            </span>
                          </div>

                          {colTasks.length === 0 ? (
                            <div className="py-5 text-center text-[11px] text-zinc-500">
                              No tasks
                            </div>
                          ) : (
                            colTasks.map((task, tIdx) => {
                              const assignee = agents.find(a => a.id === task.assigneeAgentId);
                              const accentStyle = assignee
                                ? GENTEAM_ACCENT_STYLES[assignee.accent]
                                : GENTEAM_ACCENT_STYLES.blue;
                              const deadlineMeta = formatTaskDeadlineMeta(task.deadlineIso);
                              const deadlineColorClass =
                                task.status === 'done'
                                  ? 'text-emerald-300'
                                  : deadlineMeta.urgency === 'overdue'
                                  ? 'text-red-300'
                                  : deadlineMeta.urgency === 'today'
                                  ? 'text-amber-300'
                                  : 'text-[#54B0FF]';

                              return (
                                <motion.div
                                  key={task.id}
                                  custom={tIdx}
                                  variants={listItemVariants}
                                  initial="initial"
                                  animate="animate"
                                  className="p-2.5 rounded-xl liquid-glass-subtle space-y-2"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono tabular-nums">
                                    <span
                                      className={
                                        task.priority === 'High' ? 'text-amber-300' : 'text-zinc-400'
                                      }
                                    >
                                      {task.priority} priority
                                    </span>
                                    <span className={deadlineColorClass}>
                                      {task.status === 'done' ? `Done · ${task.updatedAt}` : deadlineMeta.label}
                                    </span>
                                  </div>

                                  <div className="text-xs font-medium text-zinc-100 leading-snug">
                                    {task.title}
                                  </div>

                                  <p className="text-[11px] text-zinc-300 leading-relaxed">
                                    {task.description}
                                  </p>

                                  <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-white/10">
                                    <button
                                      type="button"
                                      disabled={!assignee}
                                      onClick={() => {
                                        if (assignee) openAgentSpace(assignee, 'summary');
                                      }}
                                      className="flex items-center gap-1.5 min-w-0 hover:opacity-85 transition-opacity"
                                    >
                                      <span
                                        className={`w-5 h-5 rounded-md border flex items-center justify-center text-[9px] font-semibold shrink-0 ${accentStyle.avatarClass}`}
                                      >
                                        {getAgentInitials(assignee?.name || 'AI')}
                                      </span>
                                      <span className="text-[11px] text-zinc-200 hover:text-[#58A6FF] truncate">
                                        {assignee?.name || 'Agent'}
                                      </span>
                                    </button>

                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => handleRunAgentOnTask(task, false)}
                                        title="Run assigned agent on this task"
                                        className="min-h-[30px] flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#0F7FFF]/20 hover:bg-[#0F7FFF]/35 text-[#58A6FF] text-[10px] font-medium"
                                      >
                                        <Play className="w-2.5 h-2.5" />
                                        <span>Run</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleAdvanceTask(task.id)}
                                        title="Move to next Kanban column"
                                        className="min-h-[30px] px-2 py-0.5 rounded-lg liquid-glass-subtle hover:bg-white/10 text-[10px] text-zinc-200"
                                      >
                                        Next
                                      </button>
                                    </div>
                                  </div>
                                </motion.div>
                              );
                            })
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}

        {/* ==================== CREATE NANOBOT 6-STEP WIZARD ==================== */}
        {activePage === 'create-nanobot' && onReleaseNanobot && (
          <motion.div
            key="nanoteam-page-create-nanobot"
            custom={pageDirection}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1 min-h-0 flex flex-col overflow-hidden"
          >
            <CreateNanobotWizard
              userId={identity?.userId || 'NB-LOCAL'}
              initialSeed={nanobotWizardSeed}
              onCancel={() => {
                onClearNanobotSeed?.();
                backToDirectory();
              }}
              onRelease={async (payload) => {
                const created = await onReleaseNanobot(payload);
                onClearNanobotSeed?.();
                setSelectedNanobotId(created.id);
                setPageState(['nanobot-detail', 1]);
              }}
            />
          </motion.div>
        )}

        {/* ==================== NANOBOT LIFECYCLE & SANDBOX DETAIL ==================== */}
        {activePage === 'nanobot-detail' && selectedNanobot && (
          <motion.div
            key={`nanoteam-page-bot-${selectedNanobot.id}`}
            custom={pageDirection}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1 min-h-0 flex flex-col overflow-hidden"
          >
            <NanobotDetailView
              bot={selectedNanobot}
              runs={nanobotRuns}
              onBack={backToDirectory}
              onRerun={async (bot) => {
                if (onRerunNanobot) await onRerunNanobot(bot);
              }}
              onUpdateBot={async (botId, patch) => {
                if (onUpdateNanobot) await onUpdateNanobot(botId, patch);
              }}
              onDeleteBot={async (bot) => {
                if (onDeleteNanobot) await onDeleteNanobot(bot);
                setSelectedNanobotId(null);
                setPageState(['directory', -1]);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AddGenTeamAgentModal
        isOpen={isAddAgentOpen}
        onClose={() => setIsAddAgentOpen(false)}
        existingAgents={agents}
        onAddAgent={handleAddAgent}
      />
    </div>
  );
};
