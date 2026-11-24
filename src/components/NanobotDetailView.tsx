import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  Bot,
  CheckCircle2,
  Clock,
  Cpu,
  Edit3,
  FolderLock,
  History,
  Lock,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Square,
  Trash2,
  XCircle
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type {
  Nanobot,
  NanobotRun,
  NanobotSandboxState,
  NanobotScheduleCadence,
  NanobotStatus
} from '../types/index.ts';
import {
  NANOBOT_CADENCE_OPTIONS,
  NANOBOT_STATUS_META,
  getEngineSpec,
  getModelSpec,
  getModelsForEngine,
  getStyleSpec
} from '../utils/nanobotCatalog.ts';
import { fetchNanobotSandboxRequest } from '../utils/nanobotClient.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import { MOTION_SPRINGS, MOTION_TRANSITIONS } from '../utils/motion.ts';

type NanobotDetailTab = 'overview' | 'runs' | 'sandbox' | 'edit';

interface NanobotDetailViewProps {
  bot: Nanobot;
  runs: NanobotRun[];
  onBack: () => void;
  onRerun: (bot: Nanobot) => Promise<void>;
  onUpdateBot: (
    botId: string,
    patch: {
      name?: string;
      modelId?: string;
      taskPrompt?: string;
      schedule?: Nanobot['schedule'];
      status?: NanobotStatus;
    }
  ) => Promise<void>;
  onDeleteBot: (bot: Nanobot) => Promise<void>;
}

export const NanobotStatusChip: React.FC<{ status: NanobotStatus }> = ({ status }) => {
  const meta = NANOBOT_STATUS_META[status] || NANOBOT_STATUS_META.idle;
  const Icon =
    status === 'running'
      ? RefreshCw
      : status === 'completed'
      ? CheckCircle2
      : status === 'failed'
      ? XCircle
      : status === 'paused'
      ? Pause
      : status === 'stopped'
      ? Square
      : status === 'scheduled'
      ? Clock
      : Bot;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium backdrop-blur-md whitespace-nowrap ${meta.surfaceClass} ${meta.textClass}`}
    >
      <Icon className={`w-3 h-3 shrink-0 ${status === 'running' ? 'animate-spin' : ''}`} />
      <span>{meta.label}</span>
    </span>
  );
};

export const NanobotDetailView: React.FC<NanobotDetailViewProps> = ({
  bot,
  runs,
  onBack,
  onRerun,
  onUpdateBot,
  onDeleteBot
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const [activeTab, setActiveTab] = useState<NanobotDetailTab>('overview');
  const [confirmStop, setConfirmStop] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const [sandbox, setSandbox] = useState<NanobotSandboxState | null>(null);
  const [sandboxError, setSandboxError] = useState<string | null>(null);

  // Edit form draft state
  const allowedModels = useMemo(() => getModelsForEngine(bot.engine), [bot.engine]);
  const [draftName, setDraftName] = useState(bot.name);
  const [draftModelId, setDraftModelId] = useState(bot.modelId);
  const [draftPrompt, setDraftPrompt] = useState(bot.taskPrompt);
  const [draftCadence, setDraftCadence] = useState<NanobotScheduleCadence>(bot.schedule.cadence);
  const [draftStartTime, setDraftStartTime] = useState(bot.schedule.startTime);
  const [draftCustomMins, setDraftCustomMins] = useState(
    bot.schedule.customIntervalMinutes || 30
  );
  const [draftNotify, setDraftNotify] = useState(bot.schedule.notificationsEnabled);

  useEffect(() => {
    setDraftName(bot.name);
    setDraftModelId(bot.modelId);
    setDraftPrompt(bot.taskPrompt);
    setDraftCadence(bot.schedule.cadence);
    setDraftStartTime(bot.schedule.startTime);
    setDraftCustomMins(bot.schedule.customIntervalMinutes || 30);
    setDraftNotify(bot.schedule.notificationsEnabled);
  }, [bot]);

  useEffect(() => {
    if (activeTab !== 'sandbox') return;
    let active = true;
    setSandboxError(null);
    fetchNanobotSandboxRequest(bot.id, bot.userId, bot.id)
      .then((res) => {
        if (active) setSandbox(res.sandbox);
      })
      .catch((err) => {
        if (active) {
          setSandboxError(err instanceof Error ? err.message : 'Unable to inspect sandbox.');
        }
      });
    return () => {
      active = false;
    };
  }, [activeTab, bot.id, bot.userId, runs.length]);

  const engineSpec = getEngineSpec(bot.engine);
  const styleSpec = getStyleSpec(bot.styleId);
  const modelSpec = getModelSpec(bot.modelId);

  const botRuns = useMemo(
    () =>
      runs
        .filter((r) => r.botId === bot.id)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [runs, bot.id]
  );

  const handleRerunClick = async () => {
    if (isBusy) return;
    setIsBusy(true);
    triggerHaptic('medium');
    try {
      await onRerun(bot);
      triggerHaptic('success');
    } finally {
      setIsBusy(false);
    }
  };

  const handleConfirmStop = async () => {
    if (isBusy) return;
    setIsBusy(true);
    triggerHaptic('warning');
    try {
      await onUpdateBot(bot.id, { status: 'stopped' });
      setConfirmStop(false);
    } finally {
      setIsBusy(false);
    }
  };

  const handleTogglePause = async () => {
    if (isBusy) return;
    setIsBusy(true);
    triggerHaptic('selection');
    try {
      await onUpdateBot(bot.id, {
        status: bot.status === 'paused' ? 'scheduled' : 'paused'
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (isBusy) return;
    setIsBusy(true);
    triggerHaptic('warning');
    try {
      await onDeleteBot(bot);
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftPrompt.trim() || isBusy) return;
    setIsBusy(true);
    triggerHaptic('medium');
    try {
      await onUpdateBot(bot.id, {
        name: draftName.trim() || bot.name,
        modelId: draftModelId,
        taskPrompt: draftPrompt.trim(),
        schedule: {
          cadence: draftCadence,
          startTime: draftStartTime,
          ...(draftCadence === 'custom' ? { customIntervalMinutes: draftCustomMins } : {}),
          notificationsEnabled: draftNotify
        }
      });
      triggerHaptic('success');
      setActiveTab('overview');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden gap-2.5">
      {/* Top Bar */}
      <div className="min-h-[48px] px-3 py-1.5 rounded-2xl liquid-glass flex items-center justify-between gap-2 shrink-0">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('selection');
            onBack();
          }}
          aria-label="Back to NanoTeam directory"
          className="min-h-[44px] px-2 flex items-center gap-1.5 rounded-xl text-xs font-medium text-[#54B0FF] hover:bg-white/[0.08] transition-colors whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>NanoTeam</span>
        </button>

        <div className="min-w-0 flex-1 text-center">
          <div className="text-xs font-semibold text-zinc-100 truncate">{bot.name}</div>
        </div>

        <NanobotStatusChip status={bot.status} />
      </div>

      {/* Sub-Tabs */}
      <div className="p-1 rounded-xl liquid-glass shrink-0">
        <div
          role="tablist"
          aria-label={`${bot.name} sections`}
          className="grid grid-cols-[1.2fr_1.05fr_1.05fr_0.75fr] gap-1"
        >
          {(
            [
              { id: 'overview', label: 'Overview', Icon: Bot },
              { id: 'runs', label: `Runs (${botRuns.length})`, Icon: History },
              { id: 'sandbox', label: 'Sandbox', Icon: FolderLock },
              { id: 'edit', label: 'Edit', Icon: Edit3 }
            ] as const
          ).map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  triggerHaptic('selection');
                  setActiveTab(id);
                }}
                className={`relative min-h-[38px] flex items-center justify-center gap-1 px-1 py-1.5 rounded-lg text-[10px] font-medium transition-colors whitespace-nowrap ${
                  active ? 'text-white font-semibold' : 'text-zinc-300 hover:text-white'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId={`nanobot-detail-pill-${bot.id}`}
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

      {/* Scrollable Body */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-0.5 pb-4 space-y-3">
        {activeTab === 'overview' && (
          <div className="space-y-3">
            {/* Lifecycle Action Bar */}
            <div className="rounded-2xl liquid-glass p-3.5 space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleRerunClick()}
                  aria-label={`Rerun ${bot.name}`}
                  className="min-h-[42px] px-3 py-2 rounded-xl liquid-accent-glass text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Rerun</span>
                </button>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleTogglePause()}
                  className="min-h-[42px] px-3 py-2 rounded-xl liquid-glass-subtle hover:bg-white/10 text-xs font-medium text-zinc-100 flex items-center justify-center gap-1.5"
                >
                  {bot.status === 'paused' ? (
                    <>
                      <Play className="w-3.5 h-3.5 text-emerald-300" />
                      <span>Resume</span>
                    </>
                  ) : (
                    <>
                      <Pause className="w-3.5 h-3.5 text-amber-300" />
                      <span>Pause</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={isBusy || bot.status === 'stopped'}
                  onClick={() => {
                    triggerHaptic('selection');
                    setConfirmStop(true);
                    setConfirmDelete(false);
                  }}
                  aria-label={`Stop ${bot.name}`}
                  className="min-h-[42px] px-3 py-2 rounded-xl liquid-glass-subtle hover:bg-amber-500/15 text-xs font-medium text-amber-200 flex items-center justify-center gap-1.5 disabled:opacity-40"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>Stop</span>
                </button>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    triggerHaptic('selection');
                    setConfirmDelete(true);
                    setConfirmStop(false);
                  }}
                  aria-label={`Delete ${bot.name}`}
                  className="min-h-[42px] px-3 py-2 rounded-xl liquid-glass-subtle hover:bg-red-500/15 text-xs font-medium text-red-300 flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              </div>

              <AnimatePresence>
                {confirmStop && (
                  <motion.div
                    initial={{ opacity: 0, y: prefersReduced ? 0 : 4 }}
                    animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITIONS.microEnter }}
                    exit={{ opacity: 0, transition: MOTION_TRANSITIONS.elementExit }}
                    className="p-3 rounded-xl bg-amber-500/12 border border-amber-400/35 space-y-2"
                  >
                    <div className="text-xs font-semibold text-amber-200">
                      Confirm Stop Nanobot
                    </div>
                    <p className="text-[11px] text-amber-100/80">
                      Stop scheduled executions for {bot.name}? You can Rerun or Resume anytime.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleConfirmStop()}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-amber-500/25 border border-amber-400/45 text-xs font-semibold text-amber-100"
                      >
                        Confirm Stop
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmStop(false)}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg liquid-glass-subtle text-xs text-zinc-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                )}

                {confirmDelete && (
                  <motion.div
                    initial={{ opacity: 0, y: prefersReduced ? 0 : 4 }}
                    animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITIONS.microEnter }}
                    exit={{ opacity: 0, transition: MOTION_TRANSITIONS.elementExit }}
                    className="p-3 rounded-xl bg-red-500/12 border border-red-400/35 space-y-2"
                  >
                    <div className="text-xs font-semibold text-red-200">
                      Delete Nanobot & Wipe Sandbox?
                    </div>
                    <p className="text-[11px] text-red-100/80">
                      This permanently removes {bot.name}, its run history, and wipes sandbox {bot.sandboxId}.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleConfirmDelete()}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-red-500/30 border border-red-400/45 text-xs font-semibold text-red-100"
                      >
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg liquid-glass-subtle text-xs text-zinc-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Config Metadata */}
            <div className="rounded-2xl liquid-glass p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-[#54B0FF]">
                <Cpu className="w-3.5 h-3.5" />
                <span>{engineSpec.name}</span>
                <span aria-hidden="true">·</span>
                <span>{styleSpec.name}</span>
                <span aria-hidden="true">·</span>
                <span>{modelSpec?.name || bot.modelId}</span>
              </div>

              <div className="p-3 rounded-xl liquid-glass-subtle space-y-1">
                <div className="text-[10.5px] font-mono text-zinc-400">Task Objective</div>
                <p className="text-xs text-zinc-100 leading-relaxed">{bot.taskPrompt}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 rounded-xl liquid-glass-subtle">
                  <div className="text-zinc-400">Cadence</div>
                  <div className="font-semibold text-zinc-100 capitalize mt-0.5">
                    {bot.schedule.cadence} · {bot.schedule.startTime}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl liquid-glass-subtle">
                  <div className="text-zinc-400">Owner User ID</div>
                  <div className="font-mono font-semibold text-zinc-100 mt-0.5">{bot.userId}</div>
                </div>
              </div>

              <div className="p-2.5 rounded-xl liquid-glass-subtle text-[10.5px] text-zinc-300 flex items-center justify-between gap-2">
                <span className="font-mono truncate">Sandbox: {bot.sandboxId}</span>
                <span className="text-emerald-300 shrink-0">Isolated</span>
              </div>
            </div>

            {/* Latest Run Output */}
            {botRuns[0] && (
              <div className="rounded-2xl liquid-glass p-4 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-zinc-100">Latest Output</span>
                  <span className="font-mono text-zinc-400 tabular-nums">
                    {botRuns[0].startedAt.slice(0, 19).replace('T', ' ')}
                  </span>
                </div>
                <pre className="p-3 rounded-xl liquid-glass-subtle text-[11px] text-zinc-200 whitespace-pre-wrap font-sans leading-relaxed">
                  {botRuns[0].output}
                </pre>
              </div>
            )}
          </div>
        )}

        {activeTab === 'runs' && (
          <div className="space-y-2.5">
            {botRuns.length === 0 ? (
              <div className="rounded-2xl liquid-glass p-6 text-center space-y-2">
                <History className="w-6 h-6 text-[#54B0FF] mx-auto" />
                <div className="text-xs font-medium text-zinc-200">No runs recorded yet</div>
                <p className="text-[11px] text-zinc-400">
                  Trigger Rerun from Overview to create an execution entry.
                </p>
              </div>
            ) : (
              botRuns.map((run) => (
                <div key={run.id} className="rounded-2xl liquid-glass p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-mono font-semibold text-zinc-100 truncate">
                      {run.id}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/35 text-emerald-300 text-[10px] font-medium capitalize shrink-0">
                      {run.status}
                    </span>
                  </div>
                  <div className="text-[10.5px] font-mono text-zinc-400 tabular-nums">
                    Started: {run.startedAt.slice(0, 19).replace('T', ' ')}
                    {run.endedAt ? ` · Ended: ${run.endedAt.slice(11, 19)}` : ''}
                  </div>
                  <pre className="p-2.5 rounded-xl liquid-glass-subtle text-[11px] text-zinc-200 whitespace-pre-wrap font-sans leading-relaxed">
                    {run.output}
                  </pre>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'sandbox' && (
          <div className="space-y-3">
            <div className="rounded-2xl liquid-glass p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-100">
                <Lock className="w-4 h-4 text-emerald-300" />
                <span>Private Sandbox Isolation</span>
              </div>
              <p className="text-[11px] text-zinc-300 leading-relaxed">
                This Nanobot’s storage directory, memory log, credentials, and network scope are strictly isolated to <code className="font-mono text-zinc-100">{bot.id}</code> and rejected by backend policy if accessed by another bot.
              </p>

              {sandboxError && (
                <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-400/35 text-xs text-amber-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{sandboxError}</span>
                </div>
              )}

              {sandbox && (
                <div className="space-y-2 text-[11px]">
                  <div className="p-2.5 rounded-xl liquid-glass-subtle">
                    <div className="text-zinc-400">Storage Directory</div>
                    <div className="font-mono text-zinc-100 break-all mt-0.5">
                      {sandbox.storagePath}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 rounded-xl liquid-glass-subtle">
                      <div className="text-zinc-400">Credential Scope</div>
                      <div className="font-mono text-zinc-100 truncate mt-0.5">
                        {sandbox.credentialScope}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl liquid-glass-subtle">
                      <div className="text-zinc-400">Network Policy</div>
                      <div className="font-mono text-zinc-100 truncate mt-0.5">
                        {sandbox.networkScope}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {sandbox && (
              <div className="rounded-2xl liquid-glass p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-100">
                    Isolated Memory Log
                  </span>
                  <span className="text-[10.5px] font-mono text-zinc-400 tabular-nums">
                    {sandbox.memoryEntries.length} entries
                  </span>
                </div>
                <div className="space-y-1.5">
                  {sandbox.memoryEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-2.5 rounded-xl liquid-glass-subtle text-[11px] space-y-0.5"
                    >
                      <div className="font-mono text-[10px] text-zinc-400 tabular-nums">
                        {entry.timestamp.slice(0, 19).replace('T', ' ')}
                      </div>
                      <div className="text-zinc-200">{entry.summary}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'edit' && (
          <form
            onSubmit={(e) => void handleSaveEdit(e)}
            className="rounded-2xl liquid-glass p-4 space-y-3"
          >
            <div>
              <label htmlFor="edit-bot-name" className="text-xs font-semibold text-zinc-100 block mb-1">
                Nanobot Name
              </label>
              <input
                id="edit-bot-name"
                type="text"
                maxLength={60}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="w-full min-h-[40px] liquid-glass-subtle rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-[#54B0FF]"
              />
            </div>

            <div>
              <label htmlFor="edit-bot-model" className="text-xs font-semibold text-zinc-100 block mb-1">
                Model ({engineSpec.name} Engine)
              </label>
              <select
                id="edit-bot-model"
                value={draftModelId}
                onChange={(e) => setDraftModelId(e.target.value)}
                className="w-full min-h-[40px] liquid-glass-subtle rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-[#54B0FF]"
              >
                {allowedModels.map((m) => (
                  <option key={m.id} value={m.id} className="bg-zinc-900">
                    {m.name} ({m.provider})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="edit-bot-prompt" className="text-xs font-semibold text-zinc-100 block mb-1">
                Task Prompt
              </label>
              <textarea
                id="edit-bot-prompt"
                rows={3}
                value={draftPrompt}
                onChange={(e) => setDraftPrompt(e.target.value)}
                className="w-full liquid-glass-subtle rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-[#54B0FF] resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="edit-bot-cadence" className="text-[11px] text-zinc-400 block mb-1">
                  Cadence
                </label>
                <select
                  id="edit-bot-cadence"
                  value={draftCadence}
                  onChange={(e) => setDraftCadence(e.target.value as NanobotScheduleCadence)}
                  className="w-full min-h-[40px] liquid-glass-subtle rounded-xl px-2.5 py-1.5 text-xs text-zinc-100"
                >
                  {NANOBOT_CADENCE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id} className="bg-zinc-900">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="edit-bot-time" className="text-[11px] text-zinc-400 block mb-1">
                  Start Time
                </label>
                <input
                  id="edit-bot-time"
                  type="time"
                  value={draftStartTime}
                  onChange={(e) => setDraftStartTime(e.target.value)}
                  className="w-full min-h-[40px] liquid-glass-subtle rounded-xl px-2.5 py-1.5 text-xs font-mono text-zinc-100"
                />
              </div>
            </div>

            {draftCadence === 'custom' && (
              <div>
                <label htmlFor="edit-bot-custom" className="text-[11px] text-zinc-400 block mb-1">
                  Custom Interval (minutes)
                </label>
                <input
                  id="edit-bot-custom"
                  type="number"
                  min={1}
                  max={10080}
                  value={draftCustomMins}
                  onChange={(e) => setDraftCustomMins(Math.max(1, Number(e.target.value) || 15))}
                  className="w-full min-h-[40px] liquid-glass-subtle rounded-xl px-3 py-1.5 text-xs font-mono text-zinc-100"
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-2 text-xs text-zinc-200">
                <Bell className="w-3.5 h-3.5 text-[#54B0FF]" />
                <span>Run notifications</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={draftNotify}
                onClick={() => setDraftNotify((p) => !p)}
                className={`min-h-[34px] px-3 py-1 rounded-full text-[11px] font-semibold border ${
                  draftNotify
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                    : 'liquid-glass-subtle text-zinc-400'
                }`}
              >
                {draftNotify ? 'On' : 'Off'}
              </button>
            </div>

            <button
              type="submit"
              disabled={!draftPrompt.trim() || isBusy}
              className="w-full min-h-[44px] px-4 py-2 rounded-xl liquid-accent-glass text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Save Changes</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
