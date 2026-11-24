import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Cpu,
  Database,
  FileText,
  GripVertical,
  Info,
  Layers,
  List,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  Users,
  X
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  BackgroundAgentTask,
  CloudSchedulerModelId,
  CoreDataVectorStoreState,
  GenTeamAgent,
  GenTeamChannel,
  GenTeamMessage,
  GenTeamTask,
  Nanobot,
  NanobotRun,
  NanobotStatus,
  NanobotWizardSeed,
  RagStrategyId,
  SchedulerIntervalId,
  UserIdentity,
  WorkspaceAttachment
} from '../types/index.ts';
import {
  CLOUD_SCHEDULER_MODELS,
  SCHEDULER_INTERVAL_SPECS
} from '../utils/workspaceScheduler.ts';
import {
  RAG_STRATEGY_USER_CONFIG,
  getRagStrategyUserConfig
} from '../utils/ragStrategiesConfig.ts';
import {
  CrewTimelineGranularity,
  buildAgentLanes,
  buildTimelineSlots,
  mapAgentToCloudModel,
  resolveTaskAgentId,
  resolveTaskTimelineSlotKey
} from '../utils/crewPlanner.ts';
import {
  GENTEAM_ACCENT_STYLES,
  getAgentInitials
} from '../utils/genTeam.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import { MOTION_OFFSETS, MOTION_SPRINGS, MOTION_TRANSITIONS } from '../utils/motion.ts';
import { MotionSheet } from './MotionPrimitives.tsx';
import { GenTeamView } from './GenTeamView.tsx';
import type { CreateNanobotPayload } from './CreateNanobotWizard.tsx';

export type CrewPlannerSubView = 'timeline' | 'create' | 'list' | 'nanoteam' | 'genteam';

interface CrewPlannerSectionProps {
  schedulerTasks: BackgroundAgentTask[];
  isSchedulerLoading: boolean;
  activeStore: CoreDataVectorStoreState;
  ragEnabled: boolean;
  onToggleRagEnabled: () => void;
  ragStrategyId: RagStrategyId;
  onChangeRagStrategyId: (id: RagStrategyId) => void;
  // Composer state & handlers
  taskTitle: string;
  onChangeTaskTitle: (val: string) => void;
  taskPrompt: string;
  onChangeTaskPrompt: (val: string) => void;
  cloudModelId: CloudSchedulerModelId;
  onChangeCloudModelId: (id: CloudSchedulerModelId) => void;
  intervalId: SchedulerIntervalId;
  onChangeIntervalId: (id: SchedulerIntervalId) => void;
  assignedAgentId: string;
  onChangeAssignedAgentId: (id: string) => void;
  scheduledSlotIso: string | null;
  onChangeScheduledSlotIso: (iso: string | null) => void;
  schedulerAttachments: WorkspaceAttachment[];
  onRemoveAttachment: (attId: string) => void;
  onUploadFiles: (files: FileList) => void;
  isIngestingFiles: boolean;
  isCreatingTask: boolean;
  onCreateTask: (e: React.FormEvent) => Promise<boolean> | boolean | void;
  // Task execution & reassignment handlers
  onRunTaskNow: (taskId: string) => void;
  onToggleTaskStatus: (task: BackgroundAgentTask) => void;
  onDeleteTask: (taskId: string) => void;
  onReassignTask: (taskId: string, targetAgentId: string, targetSlotIso?: string) => void;
  // NanoTeam state & setters
  agents: GenTeamAgent[];
  channels: GenTeamChannel[];
  messages: GenTeamMessage[];
  genTeamTasks: GenTeamTask[];
  onAgentsChange: React.Dispatch<React.SetStateAction<GenTeamAgent[]>>;
  onChannelsChange: React.Dispatch<React.SetStateAction<GenTeamChannel[]>>;
  onMessagesChange: React.Dispatch<React.SetStateAction<GenTeamMessage[]>>;
  onGenTeamTasksChange: React.Dispatch<React.SetStateAction<GenTeamTask[]>>;
  // Identity & Nanobot lifecycle
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
  // External navigation override
  requestedView?: CrewPlannerSubView | null;
  requestedViewNonce?: number;
}

export const CrewPlannerSection: React.FC<CrewPlannerSectionProps> = ({
  schedulerTasks,
  isSchedulerLoading,
  activeStore,
  ragEnabled,
  onToggleRagEnabled,
  ragStrategyId,
  onChangeRagStrategyId,
  taskTitle,
  onChangeTaskTitle,
  taskPrompt,
  onChangeTaskPrompt,
  cloudModelId,
  onChangeCloudModelId,
  intervalId,
  onChangeIntervalId,
  assignedAgentId,
  onChangeAssignedAgentId,
  scheduledSlotIso,
  onChangeScheduledSlotIso,
  schedulerAttachments,
  onRemoveAttachment,
  onUploadFiles,
  isIngestingFiles,
  isCreatingTask,
  onCreateTask,
  onRunTaskNow,
  onToggleTaskStatus,
  onDeleteTask,
  onReassignTask,
  agents,
  channels,
  messages,
  genTeamTasks,
  onAgentsChange,
  onChannelsChange,
  onMessagesChange,
  onGenTeamTasksChange,
  identity,
  nanobots,
  nanobotRuns,
  onReleaseNanobot,
  onRerunNanobot,
  onUpdateNanobot,
  onDeleteNanobot,
  nanobotWizardSeed,
  onClearNanobotSeed,
  requestedView,
  requestedViewNonce
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const [[activeCrewView, pageDirection], setCrewViewState] = useState<[CrewPlannerSubView, 1 | -1]>([
    'timeline',
    1
  ]);
  const [createReturnView, setCreateReturnView] = useState<'timeline' | 'list'>('timeline');
  const [timelineGranularity, setTimelineGranularity] = useState<CrewTimelineGranularity>('day');
  const [isRagMenuOpen, setIsRagMenuOpen] = useState(false);
  const [infoStrategyId, setInfoStrategyId] = useState<RagStrategyId | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ agentId: string; slotKey: string } | null>(null);
  const [expandedTaskRagId, setExpandedTaskRagId] = useState<Record<string, boolean>>({});
  const [expandedTaskHistoryId, setExpandedTaskHistoryId] = useState<Record<string, boolean>>({});
  const [runningTaskIds, setRunningTaskIds] = useState<Record<string, boolean>>({});
  const [focusedNanoTeamAgent, setFocusedNanoTeamAgent] = useState<{
    agentId: string;
    nonce: number;
  } | null>(null);
  const [nanoTeamDirectoryNonce, setNanoTeamDirectoryNonce] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const navigateForward = (nextView: CrewPlannerSubView) => {
    triggerHaptic('selection');
    setIsRagMenuOpen(false);
    setCrewViewState([nextView, 1]);
  };

  const handleOpenAgentInNanoTeam = (agentId: string) => {
    triggerHaptic('selection');
    setIsRagMenuOpen(false);
    setFocusedNanoTeamAgent({ agentId, nonce: Date.now() });
    setCrewViewState(['nanoteam', 1]);
  };

  const navigateBack = (targetView: CrewPlannerSubView = 'timeline') => {
    triggerHaptic('selection');
    setIsRagMenuOpen(false);
    setCrewViewState([targetView, -1]);
  };

  useEffect(() => {
    if (requestedView) {
      setIsRagMenuOpen(false);
      setCrewViewState(([prev]) => [requestedView, requestedView === 'timeline' && prev !== 'timeline' ? -1 : 1]);
    }
  }, [requestedView, requestedViewNonce]);

  const activeRagConfig = getRagStrategyUserConfig(ragStrategyId);
  const infoRagConfig = infoStrategyId ? getRagStrategyUserConfig(infoStrategyId) : null;
  const runningTasksCount = schedulerTasks.filter((t) => t.status === 'running').length;

  const timelineSlots = useMemo(
    () => buildTimelineSlots(timelineGranularity),
    [timelineGranularity]
  );

  const agentLanes = useMemo(
    () => buildAgentLanes(agents, schedulerTasks),
    [agents, schedulerTasks]
  );

  const selectedComposerAgent = useMemo(
    () => agents.find((a) => a.id === assignedAgentId) || agents[0],
    [agents, assignedAgentId]
  );

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

  const handleOpenCreateForSlot = (agent: GenTeamAgent, slotIso: string) => {
    onChangeAssignedAgentId(agent.id);
    onChangeCloudModelId(mapAgentToCloudModel(agent, cloudModelId));
    onChangeScheduledSlotIso(slotIso);
    setCreateReturnView('timeline');
    navigateForward('create');
  };

  const handleOpenCreateFromView = (origin: 'timeline' | 'list') => {
    setCreateReturnView(origin);
    navigateForward('create');
  };

  const handleSubmitTaskForm = async (e: React.FormEvent) => {
    const result = await onCreateTask(e);
    if (result !== false) {
      navigateBack(createReturnView);
    }
  };

  const handleRunBlockNow = async (taskId: string) => {
    setRunningTaskIds((prev) => ({ ...prev, [taskId]: true }));
    try {
      await Promise.resolve(onRunTaskNow(taskId));
    } finally {
      setRunningTaskIds((prev) => ({ ...prev, [taskId]: false }));
    }
  };

  const renderRagControlBar = () => (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-[11px] px-0.5">
        <span className="font-medium text-zinc-200">Document Lookup Mode</span>
        <span className="font-mono text-[10px] text-zinc-400 tabular-nums">
          {ragEnabled
            ? `${activeStore.documents.length} docs · ${activeStore.chunks.length} vectors`
            : 'Bypassed'}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={ragEnabled ? 'Disable document lookup' : 'Enable document lookup'}
          aria-pressed={ragEnabled}
          title={ragEnabled ? `Lookup Active: ${activeRagConfig.friendlyName}` : 'Enable document lookup'}
          onClick={() => {
            triggerHaptic('selection');
            onToggleRagEnabled();
          }}
          className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border transition-colors shrink-0 ${
            ragEnabled
              ? 'bg-[#0F7FFF]/20 border-[#54B0FF]/50 text-[#54B0FF]'
              : 'liquid-glass-subtle border-white/10 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Layers className="w-4 h-4" />
        </button>

        <button
          type="button"
          disabled={!ragEnabled}
          aria-expanded={isRagMenuOpen}
          aria-label="Choose document lookup mode"
          onClick={() => {
            triggerHaptic('selection');
            setIsRagMenuOpen((prev) => !prev);
          }}
          className="flex-1 min-w-0 min-h-[44px] flex items-center justify-between gap-2 px-3 py-2 rounded-xl liquid-glass-subtle text-left text-xs text-zinc-100 hover:bg-white/10 focus:outline-hidden focus:border-[#54B0FF] disabled:opacity-45 transition-colors"
        >
          <span className="truncate font-medium">
            {ragEnabled ? activeRagConfig.friendlyName : 'Direct Cloud AI (Lookup off)'}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform ${
              isRagMenuOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('selection');
            setInfoStrategyId(ragStrategyId);
          }}
          aria-label={`Info about ${activeRagConfig.friendlyName}`}
          title={`About ${activeRagConfig.friendlyName}`}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl liquid-glass-subtle text-[#54B0FF] hover:text-white hover:bg-white/15 transition-colors shrink-0"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>

      {/* Expandable Plain-Language Option List — Every option has a dedicated accessible (i) button */}
      <AnimatePresence initial={false}>
        {isRagMenuOpen && ragEnabled && (
          <motion.div
            initial={{ opacity: 0, y: prefersReduced ? 0 : -4 }}
            animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITIONS.elementEnter }}
            exit={{ opacity: 0, y: prefersReduced ? 0 : -4, transition: MOTION_TRANSITIONS.elementExit }}
            role="listbox"
            aria-label="Document lookup options"
            className="p-1.5 rounded-2xl liquid-glass-elevated border border-white/15 space-y-1"
          >
            {RAG_STRATEGY_USER_CONFIG.map((opt) => {
              const selected = opt.id === ragStrategyId;
              return (
                <div
                  key={opt.id}
                  className={`flex items-center gap-1 rounded-xl transition-colors ${
                    selected
                      ? 'bg-[#0F7FFF]/20 border border-[#54B0FF]/45'
                      : 'border border-transparent hover:bg-white/[0.06]'
                  }`}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      triggerHaptic('selection');
                      onChangeRagStrategyId(opt.id);
                      setIsRagMenuOpen(false);
                    }}
                    className="flex-1 min-w-0 min-h-[44px] flex items-center justify-between gap-2 px-3 py-2 text-left"
                  >
                    <span className="text-xs font-medium text-zinc-100 truncate">
                      {opt.friendlyName}
                    </span>
                    {selected && <Check className="w-3.5 h-3.5 text-[#54B0FF] shrink-0" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      setInfoStrategyId(opt.id);
                    }}
                    aria-label={`Info about ${opt.friendlyName}`}
                    title={`About ${opt.friendlyName}`}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#54B0FF] hover:text-white hover:bg-white/10 transition-colors shrink-0"
                  >
                    <Info className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="@container flex-1 min-h-0 flex flex-col overflow-hidden">
      <AnimatePresence mode="wait" initial={false} custom={pageDirection}>
        {/* ==================== LANDING PAGE: MINIMAL CREW TIMELINE ==================== */}
        {activeCrewView === 'timeline' && (
          <motion.div
            key="crew-page-timeline"
            custom={pageDirection}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-0.5 pb-4"
          >
            {/* Compact Minimal Header + Connected Screen Drill-Down Triggers */}
            <div className="p-3 rounded-2xl liquid-glass space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-100">
                    <CalendarDays className="w-4 h-4 text-[#54B0FF] shrink-0" />
                    <span className="truncate">Crew Planner</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 tabular-nums mt-0.5">
                    <span className={runningTasksCount > 0 ? 'text-emerald-400 font-medium' : ''}>
                      {runningTasksCount} active
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{agents.length} agents</span>
                  </div>
                </div>

                <div
                  role="group"
                  aria-label="Timeline granularity"
                  className="flex items-center gap-0.5 p-0.5 rounded-full liquid-glass-subtle text-[11px] shrink-0"
                >
                  {(['day', 'week'] as const).map((mode) => {
                    const active = timelineGranularity === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          triggerHaptic('selection');
                          setTimelineGranularity(mode);
                        }}
                        className={`min-h-[34px] px-3 py-1 rounded-full font-medium capitalize transition-colors whitespace-nowrap shrink-0 ${
                          active
                            ? 'liquid-lens-active text-zinc-950 font-semibold'
                            : 'text-zinc-300 hover:text-white'
                        }`}
                      >
                        {mode}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Drill-down Workflow Bar — Zero-overlap responsive layout */}
              <div
                data-testid="crew-workflow-bar"
                className="grid grid-cols-2 @[460px]:flex @[460px]:flex-wrap @[460px]:items-center @[460px]:justify-between gap-2 pt-2.5 border-t border-white/10"
              >
                <button
                  type="button"
                  data-testid="crew-task-list-btn"
                  onClick={() => navigateForward('list')}
                  className="min-h-[42px] w-full @[460px]:w-auto flex items-center justify-between @[460px]:justify-start gap-1.5 px-3 py-1.5 rounded-xl liquid-glass-subtle hover:bg-white/10 text-xs font-medium text-zinc-200 transition-colors whitespace-nowrap"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <List className="w-3.5 h-3.5 text-[#54B0FF] shrink-0" />
                    <span>Task List</span>
                    <span className="font-mono text-zinc-400 tabular-nums">
                      ({schedulerTasks.length})
                    </span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                </button>

                <button
                  type="button"
                  data-testid="crew-nanoteam-btn"
                  aria-label="Open NanoTeam"
                  onClick={() => {
                    setFocusedNanoTeamAgent(null);
                    setNanoTeamDirectoryNonce((n) => n + 1);
                    navigateForward('nanoteam');
                  }}
                  className="min-h-[42px] w-full @[460px]:w-auto flex items-center justify-between @[460px]:justify-start gap-1.5 px-3 py-1.5 rounded-xl liquid-glass-subtle hover:bg-white/10 text-xs font-medium text-zinc-200 transition-colors whitespace-nowrap"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Users className="w-3.5 h-3.5 text-[#54B0FF] shrink-0" />
                    <span>NanoTeam</span>
                    {nanobots && nanobots.length > 0 && (
                      <span className="font-mono text-[#54B0FF] tabular-nums">
                        ({nanobots.length})
                      </span>
                    )}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                </button>

                <button
                  type="button"
                  data-testid="crew-new-task-btn"
                  onClick={() => handleOpenCreateFromView('timeline')}
                  className="col-span-2 @[460px]:col-span-1 @[460px]:ml-auto min-h-[42px] w-full @[460px]:w-auto flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl liquid-accent-glass text-xs font-semibold whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span>New Task</span>
                </button>
              </div>
            </div>

            {/* Non-Scrolling Clickable Agent Lanes */}
            <div className="space-y-2.5" data-testid="crew-agent-lanes-list">
              <p className="text-[11px] text-zinc-400 px-1">
                Tap any Agent Lane to open NanoTeam focused on that agent, or assign a time slot directly.
              </p>

              {agentLanes.map((lane) => {
                const accent = GENTEAM_ACCENT_STYLES[lane.agent.accent];
                const statusTextClass =
                  lane.status === 'working'
                    ? 'text-emerald-300'
                    : lane.status === 'scheduled-next'
                      ? 'text-amber-300'
                      : 'text-zinc-400';
                const workloadBars = Math.min(3, Math.max(0, lane.workloadCount));
                const slotGridClass =
                  timelineGranularity === 'day'
                    ? 'grid grid-cols-2 @[580px]:grid-cols-4 gap-2'
                    : 'grid grid-cols-2 @[580px]:grid-cols-3 @[820px]:grid-cols-5 gap-2';

                return (
                  <article
                    key={lane.agent.id}
                    data-testid={`crew-agent-lane-${lane.agent.id}`}
                    aria-label={`${lane.agent.name} lane`}
                    onClick={() => handleOpenAgentInNanoTeam(lane.agent.id)}
                    className="p-3 rounded-2xl liquid-glass hover:bg-white/[0.045] border border-white/10 hover:border-[#54B0FF]/45 transition-colors space-y-2.5 cursor-pointer group"
                  >
                    {/* Clickable Agent Identity & Telemetry Header */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenAgentInNanoTeam(lane.agent.id);
                      }}
                      aria-label={`Open ${lane.agent.name} in NanoTeam`}
                      className="w-full flex items-center justify-between gap-2.5 text-left rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#54B0FF]/60"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span
                          className={`w-8 h-8 rounded-xl border flex items-center justify-center text-xs font-semibold shrink-0 ${accent.avatarClass}`}
                        >
                          {getAgentInitials(lane.agent.name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-xs font-semibold text-zinc-100 truncate">
                              {lane.agent.name}
                            </span>
                            <span className="font-mono text-[10.5px] text-[#54B0FF] shrink-0">
                              {lane.agent.handle}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 truncate mt-0.5 tabular-nums">
                            <span className="truncate">{lane.agent.roleTitle}</span>
                            <span aria-hidden="true">·</span>
                            <span className={`font-medium shrink-0 ${statusTextClass}`}>
                              {lane.statusLabel}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          title={`${lane.workloadCount} active tasks`}
                          aria-label={`Workload: ${lane.workloadCount} active`}
                          className="inline-flex items-center gap-1 text-[11px] font-mono tabular-nums text-zinc-300"
                        >
                          <span className="inline-flex items-end gap-[2px] h-2.5">
                            {[1, 2, 3].map((barIdx) => (
                              <span
                                key={barIdx}
                                className={`w-[3px] rounded-full ${
                                  barIdx <= workloadBars ? 'bg-[#54B0FF]' : 'bg-white/15'
                                }`}
                                style={{ height: `${barIdx * 3 + 2}px` }}
                              />
                            ))}
                          </span>
                          {lane.workloadCount}
                        </span>
                        <span className="hidden @[440px]:inline text-[10.5px] font-medium text-[#54B0FF] group-hover:text-white transition-colors">
                          Open
                        </span>
                        <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-[#54B0FF] transition-colors" />
                      </div>
                    </button>

                    {/* Non-Scrolling Responsive Time Slots Grid */}
                    <div
                      className={`${slotGridClass} pt-2 border-t border-white/10`}
                    >
                      {timelineSlots.map((slot) => {
                        const slotTasks = lane.tasks.filter(
                          (t) =>
                            resolveTaskTimelineSlotKey(
                              t,
                              timelineSlots,
                              timelineGranularity
                            ) === slot.key
                        );
                        const isDropHover =
                          dropTarget?.agentId === lane.agent.id &&
                          dropTarget?.slotKey === slot.key;

                        return (
                          <div
                            key={`${lane.agent.id}-${slot.key}`}
                            onDragOver={(e) => {
                              e.preventDefault();
                              if (
                                dropTarget?.agentId !== lane.agent.id ||
                                dropTarget?.slotKey !== slot.key
                              ) {
                                setDropTarget({
                                  agentId: lane.agent.id,
                                  slotKey: slot.key
                                });
                              }
                            }}
                            onDragLeave={() => {
                              if (
                                dropTarget?.agentId === lane.agent.id &&
                                dropTarget?.slotKey === slot.key
                              ) {
                                setDropTarget(null);
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              const droppedTaskId =
                                e.dataTransfer.getData('text/plain') || draggingTaskId;
                              setDropTarget(null);
                              setDraggingTaskId(null);
                              if (droppedTaskId) {
                                triggerHaptic('success');
                                onReassignTask(droppedTaskId, lane.agent.id, slot.slotIso);
                              }
                            }}
                            className={`p-2 rounded-xl border transition-colors flex flex-col gap-1.5 min-w-0 ${
                              isDropHover
                                ? 'bg-[#0F7FFF]/20 border-[#54B0FF]/70'
                                : 'bg-white/[0.025] border-white/10'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 text-[10px] font-mono text-zinc-400">
                              <span className="font-sans font-medium text-zinc-200 truncate">
                                {slot.label}
                              </span>
                              <span className="shrink-0 tabular-nums">{slot.subLabel}</span>
                            </div>

                            {slotTasks.map((task) => {
                              const isRunning = task.status === 'running';
                              const isBusyNow = Boolean(runningTaskIds[task.id]);
                              return (
                                <div
                                  key={task.id}
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData('text/plain', task.id);
                                    setDraggingTaskId(task.id);
                                  }}
                                  onDragEnd={() => {
                                    setDraggingTaskId(null);
                                    setDropTarget(null);
                                  }}
                                  className="p-2 rounded-lg liquid-glass-elevated border border-white/15 space-y-1.5 cursor-grab active:cursor-grabbing"
                                >
                                  <div className="flex items-start justify-between gap-1">
                                    <div className="flex items-center gap-1 min-w-0">
                                      <GripVertical className="w-3 h-3 text-zinc-500 shrink-0" />
                                      <span className="text-[11px] font-semibold text-zinc-100 truncate">
                                        {task.title}
                                      </span>
                                    </div>
                                    <span
                                      className={`text-[9.5px] font-medium shrink-0 ${
                                        isRunning ? 'text-emerald-300' : 'text-zinc-400'
                                      }`}
                                    >
                                      {isRunning ? 'Active' : 'Paused'}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between gap-1 text-[9.5px] font-mono text-zinc-400">
                                    <span>{task.intervalLabel}</span>
                                    <span className="text-[#54B0FF] tabular-nums">
                                      #{task.runCount}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1 pt-0.5">
                                    <button
                                      type="button"
                                      disabled={isBusyNow}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleRunBlockNow(task.id);
                                      }}
                                      aria-label={`Run ${task.title} now`}
                                      className="flex-1 min-h-[30px] inline-flex items-center justify-center gap-1 px-1.5 py-1 rounded-md bg-[#0F7FFF]/25 hover:bg-[#0F7FFF]/40 text-[#54B0FF] text-[10px] font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
                                    >
                                      <Play className="w-2.5 h-2.5 fill-current" />
                                      <span>{isBusyNow ? 'Running' : 'Run now'}</span>
                                    </button>

                                    <select
                                      aria-label={`Reassign ${task.title} to another agent`}
                                      value={lane.agent.id}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        if (e.target.value !== lane.agent.id) {
                                          triggerHaptic('selection');
                                          onReassignTask(task.id, e.target.value, slot.slotIso);
                                        }
                                      }}
                                      className="min-h-[30px] max-w-[68px] rounded-md liquid-glass-subtle px-1 py-0.5 text-[9.5px] text-zinc-200 focus:outline-hidden"
                                    >
                                      {agents.map((ag) => (
                                        <option key={ag.id} value={ag.id} className="bg-zinc-900">
                                          {ag.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              );
                            })}

                            {/* Tappable Empty Slot / Add Trigger -> Drills forward to Schedule Task */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenCreateForSlot(lane.agent, slot.slotIso);
                              }}
                              aria-label={`Schedule task for ${lane.agent.name} at ${slot.label}`}
                              className={`w-full flex items-center justify-center gap-1 rounded-lg border border-dashed border-white/10 text-[10px] text-zinc-400 hover:text-[#54B0FF] hover:border-[#54B0FF]/45 hover:bg-[#0F7FFF]/10 transition-colors ${
                                slotTasks.length === 0 ? 'min-h-[36px]' : 'min-h-[30px] py-1'
                              }`}
                            >
                              <Plus className="w-3 h-3" />
                              {slotTasks.length === 0 && <span>Assign</span>}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ==================== SUB-PAGE 1: SCHEDULE TASK & LOOKUP SETUP ==================== */}
        {activeCrewView === 'create' && (
          <motion.div
            key="crew-page-create"
            custom={pageDirection}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-0.5 pb-4"
          >
            {/* Segregated Back Navigation Header */}
            <div className="min-h-[48px] px-3 py-1.5 rounded-2xl liquid-glass flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => navigateBack(createReturnView)}
                aria-label={`Back to ${createReturnView === 'list' ? 'Task List' : 'Timeline'}`}
                className="min-h-[44px] px-2 flex items-center gap-1.5 rounded-xl text-xs font-medium text-[#54B0FF] hover:bg-white/[0.08] transition-colors whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{createReturnView === 'list' ? 'Task List' : 'Timeline'}</span>
              </button>

              <span className="text-xs font-semibold text-zinc-100 truncate">
                Schedule Task
              </span>
            </div>

            <form
              onSubmit={(e) => void handleSubmitTaskForm(e)}
              className="p-3.5 rounded-2xl liquid-glass space-y-3"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.txt,.epub,.md,.csv,.json,application/pdf,text/plain,application/epub+zip,image/*,audio/*"
                aria-label="Upload documents or media for scheduled task"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    onUploadFiles(e.target.files);
                  }
                  e.target.value = '';
                }}
                className="hidden"
              />

              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/10">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-300">
                  <span className="font-semibold text-zinc-100">Task Configuration</span>
                  {selectedComposerAgent && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#54B0FF] font-medium">
                        {selectedComposerAgent.name}
                      </span>
                    </>
                  )}
                  {scheduledSlotIso && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-zinc-300 tabular-nums">
                        {scheduledSlotIso.slice(0, 16).replace('T', ' ')}
                      </span>
                    </>
                  )}
                </div>
                {scheduledSlotIso && (
                  <button
                    type="button"
                    onClick={() => onChangeScheduledSlotIso(null)}
                    className="min-h-[32px] px-2 text-[11px] text-zinc-400 hover:text-white transition-colors"
                  >
                    Clear slot
                  </button>
                )}
              </div>

              <input
                type="text"
                aria-label="Background task title"
                value={taskTitle}
                onChange={(e) => onChangeTaskTitle(e.target.value)}
                placeholder="Task name (optional)..."
                className="w-full min-h-[42px] liquid-glass-subtle rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:border-[#54B0FF]"
              />

              <textarea
                aria-label="Continuous background task prompt"
                rows={3}
                value={taskPrompt}
                onChange={(e) => onChangeTaskPrompt(e.target.value)}
                placeholder="Describe what this agent should monitor, analyze, or prepare..."
                className="w-full liquid-glass-subtle rounded-xl px-3 py-2.5 text-xs text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:border-[#54B0FF] resize-none"
              />

              <div className="grid grid-cols-1 @[420px]:grid-cols-3 gap-2">
                <select
                  aria-label="Assign task to team agent"
                  value={assignedAgentId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    onChangeAssignedAgentId(nextId);
                    const ag = agents.find((a) => a.id === nextId);
                    if (ag) {
                      onChangeCloudModelId(mapAgentToCloudModel(ag, cloudModelId));
                    }
                  }}
                  className="min-h-[42px] liquid-glass-subtle rounded-xl px-2.5 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-[#54B0FF]"
                >
                  {agents.map((ag) => (
                    <option key={ag.id} value={ag.id} className="bg-zinc-900">
                      Agent: {ag.name}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Cloud AI model for scheduled task"
                  value={cloudModelId}
                  onChange={(e) => onChangeCloudModelId(e.target.value as CloudSchedulerModelId)}
                  className="min-h-[42px] liquid-glass-subtle rounded-xl px-2.5 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-[#54B0FF]"
                >
                  {CLOUD_SCHEDULER_MODELS.map((m) => (
                    <option key={m.id} value={m.id} className="bg-zinc-900">
                      {m.label}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Task execution interval"
                  value={intervalId}
                  onChange={(e) => onChangeIntervalId(e.target.value as SchedulerIntervalId)}
                  className="min-h-[42px] liquid-glass-subtle rounded-xl px-2.5 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-[#54B0FF]"
                >
                  {SCHEDULER_INTERVAL_SPECS.map((spec) => (
                    <option key={spec.id} value={spec.id} className="bg-zinc-900">
                      {spec.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-1 border-t border-white/10">
                {renderRagControlBar()}
              </div>

              {schedulerAttachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {schedulerAttachments.map((att) => (
                    <span
                      key={att.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl liquid-glass-subtle text-[11px] text-zinc-200"
                    >
                      <FileText className="w-3.5 h-3.5 text-[#54B0FF]" />
                      <span className="truncate max-w-[140px]">{att.fileName}</span>
                      <button
                        type="button"
                        onClick={() => onRemoveAttachment(att.id)}
                        aria-label={`Remove ${att.fileName}`}
                        className="p-0.5 text-zinc-400 hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[44px] flex items-center gap-1.5 px-3 py-2 rounded-xl liquid-glass-subtle hover:bg-white/10 text-xs font-medium text-zinc-200 whitespace-nowrap shrink-0"
                >
                  <Upload className="w-3.5 h-3.5 text-[#54B0FF]" />
                  <span>{isIngestingFiles ? 'Indexing...' : 'Attach Context'}</span>
                </button>

                <button
                  type="submit"
                  disabled={!taskPrompt.trim() || isCreatingTask}
                  className="min-h-[44px] flex-1 min-w-[160px] flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl liquid-accent-glass text-xs font-semibold disabled:opacity-40 whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5 shrink-0" />
                  <span>{isCreatingTask ? 'Scheduling...' : 'Start Continuous Task'}</span>
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {/* ==================== SUB-PAGE 2: TASK LIST & LOGS ==================== */}
        {activeCrewView === 'list' && (
          <motion.div
            key="crew-page-list"
            custom={pageDirection}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-0.5 pb-4"
          >
            {/* Segregated Back Navigation Header */}
            <div className="min-h-[48px] px-3 py-1.5 rounded-2xl liquid-glass flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => navigateBack('timeline')}
                aria-label="Back to Crew Timeline"
                className="min-h-[44px] px-2 flex items-center gap-1.5 rounded-xl text-xs font-medium text-[#54B0FF] hover:bg-white/[0.08] transition-colors whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Timeline</span>
              </button>

              <div className="flex items-center gap-1.5 text-xs min-w-0">
                <span className="font-semibold text-zinc-100 truncate">Task List</span>
                <span className="font-mono text-[11px] text-zinc-400 tabular-nums shrink-0">
                  · {schedulerTasks.length}
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleOpenCreateFromView('list')}
                className="min-h-[38px] flex items-center gap-1 px-2.5 py-1.5 rounded-xl liquid-accent-glass text-[11px] font-semibold whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Task</span>
              </button>
            </div>

            {isSchedulerLoading && schedulerTasks.length === 0 ? (
              <div className="p-5 rounded-2xl liquid-glass text-center text-xs text-zinc-400">
                Syncing background scheduler...
              </div>
            ) : schedulerTasks.length === 0 ? (
              <div className="p-6 rounded-2xl liquid-glass text-center space-y-3">
                <Cpu className="w-7 h-7 text-[#54B0FF] mx-auto" />
                <div className="space-y-1">
                  <p className="text-xs font-medium text-zinc-200">No scheduled tasks running</p>
                  <p className="text-[11px] text-zinc-400">
                    Create a scheduled crew task or assign a time slot on the Timeline.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenCreateFromView('list')}
                  className="min-h-[42px] inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl liquid-accent-glass text-xs font-semibold whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Schedule First Task</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {schedulerTasks.map((task) => {
                  const isRunning = task.status === 'running';
                  const showRag = expandedTaskRagId[task.id] ?? false;
                  const showHistory = expandedTaskHistoryId[task.id] ?? false;
                  const ownerAgentId = resolveTaskAgentId(task, agents);
                  const ownerAgent = agents.find((a) => a.id === ownerAgentId);
                  const friendlyRag = getRagStrategyUserConfig(task.ragStrategyId);

                  return (
                    <article key={task.id} className="p-3.5 rounded-2xl liquid-glass space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-mono">
                            <span
                              className={`font-sans font-semibold ${
                                isRunning ? 'text-emerald-300' : 'text-zinc-400'
                              }`}
                            >
                              {isRunning ? 'Running' : 'Paused'}
                            </span>
                            {ownerAgent && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-[#54B0FF] font-sans font-medium">
                                  {ownerAgent.name}
                                </span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            <span className="text-zinc-200">{task.cloudModelLabel}</span>
                            <span aria-hidden="true">·</span>
                            <span className="text-zinc-400">{task.intervalLabel}</span>
                            <span aria-hidden="true">·</span>
                            <span className="text-[#54B0FF] tabular-nums">
                              Run #{task.runCount}
                            </span>
                          </div>
                          <h3 className="text-xs font-semibold text-zinc-100 mt-1.5 leading-snug">
                            {task.title}
                          </h3>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => void handleRunBlockNow(task.id)}
                            aria-label={`Run ${task.title} now`}
                            title="Run now"
                            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl liquid-glass-subtle text-[#54B0FF] hover:bg-white/15"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onToggleTaskStatus(task)}
                            aria-label={isRunning ? `Pause ${task.title}` : `Resume ${task.title}`}
                            title={isRunning ? 'Pause background task' : 'Resume background task'}
                            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl liquid-glass-subtle text-zinc-200 hover:bg-white/15"
                          >
                            {isRunning ? (
                              <Pause className="w-3.5 h-3.5" />
                            ) : (
                              <Play className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteTask(task.id)}
                            aria-label={`Delete ${task.title}`}
                            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl liquid-glass-subtle text-zinc-400 hover:text-red-300"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-xl liquid-glass-subtle text-[11px] text-zinc-200 leading-relaxed whitespace-pre-wrap">
                        {task.latestOutput}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] font-mono text-zinc-400">
                        <div className="flex items-center gap-1">
                          {task.ragEnabled && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedTaskRagId((prev) => ({
                                    ...prev,
                                    [task.id]: !showRag
                                  }))
                                }
                                className="min-h-[36px] flex items-center gap-1 px-1.5 text-[#54B0FF] hover:text-sky-300"
                              >
                                <Database className="w-3 h-3" />
                                <span>
                                  {friendlyRag.friendlyName} ({task.latestChunks.length})
                                </span>
                                {showRag ? (
                                  <ChevronUp className="w-3 h-3" />
                                ) : (
                                  <ChevronDown className="w-3 h-3" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => setInfoStrategyId(task.ragStrategyId)}
                                aria-label={`Info about ${friendlyRag.friendlyName}`}
                                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-[#54B0FF]"
                              >
                                <Info className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setExpandedTaskHistoryId((prev) => ({
                              ...prev,
                              [task.id]: !showHistory
                            }))
                          }
                          className="min-h-[36px] flex items-center gap-1 px-1.5 text-zinc-300 hover:text-white"
                        >
                          <span>Logs ({task.runHistory.length})</span>
                          {showHistory ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                        </button>
                      </div>

                      {showRag && task.latestChunks.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          {task.latestChunks.map((chunk) => (
                            <div
                              key={chunk.chunkId}
                              className="p-2 rounded-xl liquid-glass-subtle space-y-0.5 text-[11px]"
                            >
                              <div className="flex items-center justify-between font-mono text-zinc-200">
                                <span className="truncate">{chunk.documentTitle}</span>
                                <span className="text-emerald-400 shrink-0 tabular-nums">
                                  {chunk.fusedScore.toFixed(2)}
                                </span>
                              </div>
                              <p className="text-zinc-400 line-clamp-2">{chunk.text}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {showHistory && task.runHistory.length > 0 && (
                        <div className="space-y-1 pt-1 border-t border-white/10">
                          {task.runHistory.slice(0, 5).map((log) => (
                            <div
                              key={log.runNumber}
                              className="flex items-center justify-between gap-2 text-[10px] font-mono text-zinc-400 tabular-nums"
                            >
                              <span className="truncate">
                                #{log.runNumber} · {log.executedAtLabel} · {log.summary}
                              </span>
                              <span className="shrink-0">{log.durationMs}ms</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* ==================== SUB-PAGE 3: NANOTEAM COLLABORATION ==================== */}
        {(activeCrewView === 'nanoteam' || activeCrewView === 'genteam') && (
          <motion.div
            key="crew-page-nanoteam"
            custom={pageDirection}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex-1 min-h-0 flex flex-col overflow-hidden"
          >
            <GenTeamView
              embedded
              onBackToTimeline={() => navigateBack('timeline')}
              focusedAgentId={focusedNanoTeamAgent?.agentId ?? null}
              focusedAgentNonce={focusedNanoTeamAgent?.nonce ?? nanoTeamDirectoryNonce}
              agents={agents}
              channels={channels}
              messages={messages}
              tasks={genTeamTasks}
              onAgentsChange={onAgentsChange}
              onChannelsChange={onChannelsChange}
              onMessagesChange={onMessagesChange}
              onTasksChange={onGenTeamTasksChange}
              identity={identity}
              nanobots={nanobots}
              nanobotRuns={nanobotRuns}
              onReleaseNanobot={onReleaseNanobot}
              onRerunNanobot={onRerunNanobot}
              onUpdateNanobot={onUpdateNanobot}
              onDeleteNanobot={onDeleteNanobot}
              nanobotWizardSeed={nanobotWizardSeed}
              onClearNanobotSeed={onClearNanobotSeed}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================== RAG OPTION INFO BOTTOM SHEET ==================== */}
      <MotionSheet
        isOpen={Boolean(infoRagConfig)}
        onClose={() => setInfoStrategyId(null)}
        ariaLabel={infoRagConfig ? `${infoRagConfig.friendlyName} guide` : 'Lookup mode guide'}
        maxWidthClass="max-w-md"
      >
        {infoRagConfig && (
          <div className="p-4 space-y-3 overflow-y-auto">
            <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-2.5">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-zinc-50 leading-snug">
                  {infoRagConfig.friendlyName}
                </h4>
                <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                  Technical name: {infoRagConfig.technicalName}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInfoStrategyId(null)}
                aria-label="Close lookup mode guide"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/10 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              {RAG_STRATEGY_USER_CONFIG.map((opt) => {
                const isViewed = opt.id === infoRagConfig.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setInfoStrategyId(opt.id)}
                    className={`min-h-[36px] px-3 py-1 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                      isViewed
                        ? 'liquid-lens-active text-zinc-950 font-semibold'
                        : 'liquid-glass-subtle text-zinc-300 hover:text-white'
                    }`}
                  >
                    {opt.friendlyName}
                  </button>
                );
              })}
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-3 rounded-xl liquid-glass-subtle space-y-1">
                <div className="text-[10px] font-mono uppercase tracking-wider text-[#54B0FF]">
                  What it does
                </div>
                <p className="text-zinc-100 leading-relaxed">{infoRagConfig.whatItDoes}</p>
              </div>

              <div className="p-3 rounded-xl liquid-glass-subtle space-y-1">
                <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-400">
                  When to use it
                </div>
                <p className="text-zinc-200 leading-relaxed">{infoRagConfig.whenToUse}</p>
              </div>

              <div className="p-3 rounded-xl liquid-glass-subtle space-y-1">
                <div className="text-[10px] font-mono uppercase tracking-wider text-amber-300">
                  Speed · Accuracy · Cost
                </div>
                <p className="text-zinc-200 font-medium">{infoRagConfig.tradeOff}</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              {infoRagConfig.id !== ragStrategyId && (
                <motion.button
                  type="button"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={() => {
                    onChangeRagStrategyId(infoRagConfig.id);
                    if (!ragEnabled) onToggleRagEnabled();
                    setIsRagMenuOpen(false);
                    setInfoStrategyId(null);
                    triggerHaptic('success');
                  }}
                  className="min-h-[42px] px-4 py-1.5 rounded-full liquid-accent-glass text-xs font-semibold"
                >
                  Use {infoRagConfig.friendlyName}
                </motion.button>
              )}
              <button
                type="button"
                onClick={() => setInfoStrategyId(null)}
                className="min-h-[42px] px-4 py-1.5 rounded-full liquid-glass-subtle text-xs font-medium text-zinc-200 hover:text-white"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </MotionSheet>
    </div>
  );
};
