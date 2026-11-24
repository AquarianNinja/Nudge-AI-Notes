import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Bot,
  CheckCircle2,
  Clock,
  Cpu,
  Lock,
  Rocket,
  ShieldCheck,
  Sparkles,
  Zap
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type {
  NanobotEngineId,
  NanobotSchedule,
  NanobotScheduleCadence,
  NanobotStyleId,
  NanobotWizardSeed
} from '../types/index.ts';
import {
  NANOBOT_CADENCE_OPTIONS,
  NANOBOT_ENGINES,
  NANOBOT_STYLES,
  getEngineSpec,
  getModelsForEngine,
  getStyleSpec
} from '../utils/nanobotCatalog.ts';
import { recordAiConsentIso } from '../utils/scoutAgent.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import { MOTION_OFFSETS, MOTION_SPRINGS, MOTION_TRANSITIONS } from '../utils/motion.ts';

export interface CreateNanobotPayload {
  name: string;
  engine: NanobotEngineId;
  styleId: NanobotStyleId;
  modelId: string;
  taskPrompt: string;
  schedule: NanobotSchedule;
  consentTimestampIso: string;
}

interface CreateNanobotWizardProps {
  userId: string;
  initialSeed?: NanobotWizardSeed | null;
  onCancel: () => void;
  onRelease: (payload: CreateNanobotPayload) => Promise<void>;
}

const WIZARD_STEPS = [
  'AI & Data Disclosure',
  'Choose Engine',
  'Choose Style',
  'Choose Model',
  'Task & Schedule',
  'Review & Release'
] as const;

function renderDotsRating(count: 1 | 2 | 3, colorClass: string): React.ReactNode {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={`w-1.5 h-1.5 rounded-full ${
            n <= count ? colorClass : 'bg-white/15'
          }`}
        />
      ))}
    </span>
  );
}

export const CreateNanobotWizard: React.FC<CreateNanobotWizardProps> = ({
  userId,
  initialSeed,
  onCancel,
  onRelease
}) => {
  const prefersReduced = Boolean(useReducedMotion());

  const [[stepIdx, stepDir], setStepState] = useState<[number, 1 | -1]>(() =>
    initialSeed
      ? [initialSeed.consentTimestampIso ? 4 : 0, 1]
      : [0, 1]
  );

  // Step 1: Disclosure
  const [consentAgreed, setConsentAgreed] = useState(() =>
    Boolean(initialSeed?.consentTimestampIso)
  );
  const [consentTimestampIso, setConsentTimestampIso] = useState<string>(
    () => initialSeed?.consentTimestampIso || ''
  );

  // Step 2: Engine
  const [engine, setEngine] = useState<NanobotEngineId>(
    () => initialSeed?.engine || 'atlas'
  );

  // Step 3: Style
  const [styleId, setStyleId] = useState<NanobotStyleId>(
    () => initialSeed?.styleId || 'researcher'
  );

  // Step 4: Model (filtered strictly by engine) + Name
  const availableModels = useMemo(() => getModelsForEngine(engine), [engine]);
  const [modelId, setModelId] = useState<string>(
    () => getModelsForEngine(initialSeed?.engine || 'atlas')[0].id
  );
  const [botName, setBotName] = useState<string>(
    () => initialSeed?.name || 'Atlas Researcher'
  );
  const [nameTouched, setNameTouched] = useState(() => Boolean(initialSeed?.name));

  // Step 5: Task & Schedule
  const [taskPrompt, setTaskPrompt] = useState<string>(
    () => initialSeed?.taskPrompt || ''
  );
  const [cadence, setCadence] = useState<NanobotScheduleCadence>('daily');
  const [startTime, setStartTime] = useState<string>('09:00');
  const [customIntervalMinutes, setCustomIntervalMinutes] = useState<number>(30);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(true);

  // Step 6: Launch state
  const [isReleasing, setIsReleasing] = useState(false);
  const [releaseDone, setReleaseDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialSeed) return;
    setEngine(initialSeed.engine);
    setStyleId(initialSeed.styleId);
    setTaskPrompt(initialSeed.taskPrompt);
    if (initialSeed.name) {
      setBotName(initialSeed.name);
      setNameTouched(true);
    }
    if (initialSeed.consentTimestampIso) {
      setConsentAgreed(true);
      setConsentTimestampIso(initialSeed.consentTimestampIso);
      setStepState([4, 1]);
    }
  }, [initialSeed?.nonce]);

  useEffect(() => {
    const allowed = getModelsForEngine(engine);
    if (!allowed.some((m) => m.id === modelId)) {
      setModelId(allowed[0].id);
    }
  }, [engine, modelId]);

  useEffect(() => {
    if (!nameTouched) {
      const eng = getEngineSpec(engine);
      const st = getStyleSpec(styleId);
      setBotName(`${eng.name} ${st.name.split('/')[0]}`);
    }
  }, [engine, styleId, nameTouched]);

  const selectedEngineSpec = getEngineSpec(engine);
  const selectedStyleSpec = getStyleSpec(styleId);
  const selectedModelSpec =
    availableModels.find((m) => m.id === modelId) || availableModels[0];

  const canAdvance = useMemo(() => {
    if (stepIdx === 0) return consentAgreed && Boolean(consentTimestampIso);
    if (stepIdx === 3) return Boolean(modelId) && botName.trim().length > 0;
    if (stepIdx === 4) return taskPrompt.trim().length > 0;
    return true;
  }, [stepIdx, consentAgreed, consentTimestampIso, modelId, botName, taskPrompt]);

  const handleToggleConsent = () => {
    triggerHaptic('selection');
    setConsentAgreed((prev) => {
      const next = !prev;
      if (next) {
        const iso = recordAiConsentIso(new Date().toISOString());
        setConsentTimestampIso(iso);
      } else {
        setConsentTimestampIso('');
      }
      return next;
    });
  };

  const handleBack = () => {
    triggerHaptic('selection');
    if (stepIdx === 0) {
      onCancel();
      return;
    }
    setStepState(([prev]) => [Math.max(0, prev - 1), -1]);
  };

  const handleNext = () => {
    if (!canAdvance) {
      triggerHaptic('warning');
      return;
    }
    triggerHaptic('selection');
    setStepState(([prev]) => [Math.min(WIZARD_STEPS.length - 1, prev + 1), 1]);
  };

  const handleReleaseClick = async () => {
    if (isReleasing || releaseDone) return;
    setSubmitError(null);
    setIsReleasing(true);
    triggerHaptic('heavy');

    try {
      await onRelease({
        name: botName.trim() || `${selectedEngineSpec.name} Bot`,
        engine,
        styleId,
        modelId: selectedModelSpec.id,
        taskPrompt: taskPrompt.trim(),
        schedule: {
          cadence,
          startTime,
          ...(cadence === 'custom' ? { customIntervalMinutes } : {}),
          notificationsEnabled
        },
        consentTimestampIso: consentTimestampIso || new Date().toISOString()
      });
      setReleaseDone(true);
      triggerHaptic('success');
    } catch (err) {
      setIsReleasing(false);
      setSubmitError(err instanceof Error ? err.message : 'Unable to release Nanobot.');
      triggerHaptic('warning');
    }
  };

  const progressPct = Math.round(((stepIdx + 1) / WIZARD_STEPS.length) * 100);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden gap-2.5">
      {/* Top Navigation Header */}
      <div className="min-h-[48px] px-3 py-1.5 rounded-2xl liquid-glass flex items-center justify-between gap-2 shrink-0">
        <button
          type="button"
          onClick={handleBack}
          aria-label={stepIdx === 0 ? 'Cancel Nanobot creation' : 'Previous step'}
          className="min-h-[44px] px-2 flex items-center gap-1.5 rounded-xl text-xs font-medium text-[#54B0FF] hover:bg-white/[0.08] transition-colors whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{stepIdx === 0 ? 'NanoTeam' : 'Back'}</span>
        </button>

        <div className="min-w-0 text-center">
          <div className="text-xs font-semibold text-zinc-100 truncate">
            {WIZARD_STEPS[stepIdx]}
          </div>
          <div className="text-[10px] font-mono text-zinc-400 tabular-nums">
            Step {stepIdx + 1} of {WIZARD_STEPS.length}
          </div>
        </div>

        <span className="text-[11px] font-mono tabular-nums text-[#54B0FF] px-2 shrink-0">
          {progressPct}%
        </span>
      </div>

      {/* Progress Bar */}
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={WIZARD_STEPS.length}
        aria-valuenow={stepIdx + 1}
        aria-label="Create Nanobot progress"
        className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden shrink-0"
      >
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-[#0F7FFF] to-[#54B0FF]"
          initial={false}
          animate={{ width: `${progressPct}%` }}
          transition={MOTION_SPRINGS.interactive}
        />
      </div>

      {/* Step Body */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-0.5 pb-2">
        <AnimatePresence initial={false} mode="popLayout" custom={stepDir}>
          {/* STEP 1: AI & DATA DISCLOSURE */}
          {stepIdx === 0 && (
            <motion.div
              key="wizard-step-disclosure"
              custom={stepDir}
              initial={prefersReduced ? { opacity: 0 } : { opacity: 0, x: stepDir * 14 }}
              animate={{ opacity: 1, x: 0, transition: { duration: 0.16, ease: 'easeOut' } }}
              exit={
                prefersReduced
                  ? { opacity: 0, transition: { duration: 0.1 } }
                  : { opacity: 0, x: stepDir * -14, transition: { duration: 0.12 } }
              }
              className="space-y-3"
            >
              <div className="rounded-2xl liquid-glass-elevated p-4 border border-amber-400/30 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="w-10 h-10 rounded-xl bg-amber-500/18 border border-amber-400/35 flex items-center justify-center text-amber-300 shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </span>
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-zinc-50">
                      AI & Data Disclosure
                    </h3>
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      Before releasing a Nanobot, review how your prompt and sandbox data are handled.
                    </p>
                  </div>
                </div>

                <ul className="space-y-2 text-xs text-zinc-200 leading-relaxed pl-1">
                  <li className="flex items-start gap-2">
                    <Cpu className="w-3.5 h-3.5 text-[#54B0FF] shrink-0 mt-0.5" />
                    <span>
                      This Nanobot uses AI models and processes the task prompt and context you provide.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" />
                    <span>
                      AI outputs can be inaccurate or incomplete; verify important findings before acting.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Lock className="w-3.5 h-3.5 text-emerald-300 shrink-0 mt-0.5" />
                    <span>
                      Data stays inside this Nanobot’s private sandbox (scoped strictly to User ID{' '}
                      <code className="font-mono text-zinc-100">{userId}</code>).
                    </span>
                  </li>
                </ul>
              </div>

              <div className="rounded-2xl liquid-glass p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-zinc-100">
                    I understand and agree
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={consentAgreed}
                    aria-label="I understand and agree to AI and Data Disclosure"
                    onClick={handleToggleConsent}
                    className={`min-h-[36px] px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      consentAgreed
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                        : 'liquid-glass-subtle text-zinc-300'
                    }`}
                  >
                    {consentAgreed ? 'Agreed' : 'Off'}
                  </button>
                </div>

                {consentTimestampIso && (
                  <div className="text-[10.5px] font-mono text-emerald-300/90 tabular-nums">
                    Consent logged · {consentTimestampIso}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* STEP 2: CHOOSE ENGINE */}
          {stepIdx === 1 && (
            <motion.div
              key="wizard-step-engine"
              custom={stepDir}
              initial={prefersReduced ? { opacity: 0 } : { opacity: 0, x: stepDir * 24 }}
              animate={{ opacity: 1, x: 0, transition: MOTION_TRANSITIONS.elementEnter }}
              exit={
                prefersReduced
                  ? { opacity: 0, transition: MOTION_TRANSITIONS.elementExit }
                  : { opacity: 0, x: stepDir * -24, transition: MOTION_TRANSITIONS.elementExit }
              }
              className="space-y-2.5"
            >
              {NANOBOT_ENGINES.map((spec) => {
                const selected = engine === spec.id;
                return (
                  <motion.button
                    key={spec.id}
                    type="button"
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                    transition={MOTION_SPRINGS.interactive}
                    onClick={() => {
                      triggerHaptic('selection');
                      setEngine(spec.id);
                    }}
                    aria-pressed={selected}
                    className={`w-full text-left rounded-2xl p-4 space-y-3 border transition-colors ${
                      selected
                        ? 'liquid-glass-elevated border-[#54B0FF]/65 bg-[#0F7FFF]/12'
                        : 'liquid-glass border-white/10 hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-[#54B0FF]" />
                          <span className="text-sm font-semibold text-zinc-50">{spec.name}</span>
                        </div>
                        <div className="text-[11px] font-mono text-[#54B0FF] mt-0.5">
                          {spec.tagline}
                        </div>
                      </div>
                      {selected && <CheckCircle2 className="w-5 h-5 text-[#54B0FF] shrink-0" />}
                    </div>

                    <p className="text-xs text-zinc-300 leading-relaxed">{spec.description}</p>

                    <div className="flex flex-wrap gap-1.5 text-[11px] text-zinc-200">
                      {spec.strengths.map((s) => (
                        <span
                          key={s}
                          className="px-2 py-0.5 rounded-lg liquid-glass-subtle text-[10.5px]"
                        >
                          {s}
                        </span>
                      ))}
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10 text-[10.5px] font-mono">
                      <div className="space-y-1">
                        <div className="text-zinc-400">Speed</div>
                        <div className="flex items-center gap-1.5 text-zinc-100">
                          {renderDotsRating(spec.speedRating, 'bg-cyan-400')}
                          <span>{spec.speedLabel}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-zinc-400">Depth</div>
                        <div className="flex items-center gap-1.5 text-zinc-100">
                          {renderDotsRating(spec.depthRating, 'bg-[#54B0FF]')}
                          <span>{spec.depthLabel}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-zinc-400">Cost</div>
                        <div className="flex items-center gap-1.5 text-zinc-100">
                          {renderDotsRating(spec.costRating, 'bg-amber-400')}
                          <span>{spec.costLabel}</span>
                        </div>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>
          )}

          {/* STEP 3: CHOOSE STYLE */}
          {stepIdx === 2 && (
            <motion.div
              key="wizard-step-style"
              custom={stepDir}
              initial={prefersReduced ? { opacity: 0 } : { opacity: 0, x: stepDir * 24 }}
              animate={{ opacity: 1, x: 0, transition: MOTION_TRANSITIONS.elementEnter }}
              exit={
                prefersReduced
                  ? { opacity: 0, transition: MOTION_TRANSITIONS.elementExit }
                  : { opacity: 0, x: stepDir * -24, transition: MOTION_TRANSITIONS.elementExit }
              }
              className="grid grid-cols-1 gap-2"
            >
              {NANOBOT_STYLES.map((st) => {
                const selected = styleId === st.id;
                return (
                  <motion.button
                    key={st.id}
                    type="button"
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                    transition={MOTION_SPRINGS.interactive}
                    onClick={() => {
                      triggerHaptic('selection');
                      setStyleId(st.id);
                    }}
                    aria-pressed={selected}
                    className={`w-full text-left rounded-2xl p-3.5 space-y-1.5 border transition-colors ${
                      selected
                        ? 'liquid-glass-elevated border-[#54B0FF]/65 bg-[#0F7FFF]/12'
                        : 'liquid-glass border-white/10 hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Sparkles className="w-3.5 h-3.5 text-[#54B0FF] shrink-0" />
                        <span className="text-[13px] font-semibold text-zinc-100">{st.name}</span>
                        <span className="text-[10.5px] font-mono text-zinc-400">
                          · {st.shortTag}
                        </span>
                      </div>
                      {selected && <CheckCircle2 className="w-4 h-4 text-[#54B0FF] shrink-0" />}
                    </div>
                    <div className="text-[11px] text-zinc-300">
                      Format: {st.outputFormat}
                    </div>
                    <div className="text-[10.5px] text-zinc-400">Tone: {st.tone}</div>
                  </motion.button>
                );
              })}
            </motion.div>
          )}

          {/* STEP 4: CHOOSE MODEL (Filtered by Engine) + NAME */}
          {stepIdx === 3 && (
            <motion.div
              key="wizard-step-model"
              custom={stepDir}
              initial={prefersReduced ? { opacity: 0 } : { opacity: 0, x: stepDir * 24 }}
              animate={{ opacity: 1, x: 0, transition: MOTION_TRANSITIONS.elementEnter }}
              exit={
                prefersReduced
                  ? { opacity: 0, transition: MOTION_TRANSITIONS.elementExit }
                  : { opacity: 0, x: stepDir * -24, transition: MOTION_TRANSITIONS.elementExit }
              }
              className="space-y-3"
            >
              <div className="rounded-2xl liquid-glass p-3.5 space-y-2">
                <label
                  htmlFor="nanobot-name-input"
                  className="text-xs font-semibold text-zinc-100 block"
                >
                  Nanobot Name
                </label>
                <input
                  id="nanobot-name-input"
                  type="text"
                  maxLength={60}
                  value={botName}
                  onChange={(e) => {
                    setNameTouched(true);
                    setBotName(e.target.value);
                  }}
                  placeholder="Enter a name for this Nanobot"
                  className="w-full min-h-[42px] liquid-glass-subtle rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:border-[#54B0FF]"
                />
              </div>

              <div className="px-1 flex items-center justify-between text-[11px] text-zinc-400">
                <span>Models for {selectedEngineSpec.name} Engine</span>
                <span className="font-mono">{availableModels.length} available</span>
              </div>

              <div className="space-y-2">
                {availableModels.map((mod) => {
                  const selected = modelId === mod.id;
                  return (
                    <motion.button
                      key={mod.id}
                      type="button"
                      whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                      transition={MOTION_SPRINGS.interactive}
                      onClick={() => {
                        triggerHaptic('selection');
                        setModelId(mod.id);
                      }}
                      aria-pressed={selected}
                      className={`w-full text-left rounded-2xl p-3.5 space-y-1 border transition-colors ${
                        selected
                          ? 'liquid-glass-elevated border-[#54B0FF]/65 bg-[#0F7FFF]/12'
                          : 'liquid-glass border-white/10 hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-zinc-100">
                            {mod.name}
                          </div>
                          <div className="text-[10.5px] font-mono text-[#54B0FF]">
                            {mod.provider} · {mod.id}
                          </div>
                        </div>
                        {selected && <CheckCircle2 className="w-4 h-4 text-[#54B0FF] shrink-0" />}
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed pt-0.5">
                        {mod.description}
                      </p>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* STEP 5: DEFINE TASK & SCHEDULE */}
          {stepIdx === 4 && (
            <motion.div
              key="wizard-step-schedule"
              custom={stepDir}
              initial={prefersReduced ? { opacity: 0 } : { opacity: 0, x: stepDir * 24 }}
              animate={{ opacity: 1, x: 0, transition: MOTION_TRANSITIONS.elementEnter }}
              exit={
                prefersReduced
                  ? { opacity: 0, transition: MOTION_TRANSITIONS.elementExit }
                  : { opacity: 0, x: stepDir * -24, transition: MOTION_TRANSITIONS.elementExit }
              }
              className="space-y-3"
            >
              <div className="rounded-2xl liquid-glass p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="nanobot-task-prompt"
                    className="text-xs font-semibold text-zinc-100"
                  >
                    Task Prompt
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      setTaskPrompt(selectedStyleSpec.sampleTaskPrompt);
                    }}
                    className="text-[11px] font-medium text-[#54B0FF] hover:text-white"
                  >
                    Use {selectedStyleSpec.name} sample
                  </button>
                </div>

                <textarea
                  id="nanobot-task-prompt"
                  rows={4}
                  value={taskPrompt}
                  onChange={(e) => setTaskPrompt(e.target.value)}
                  placeholder={`Instruct your ${selectedStyleSpec.name} Nanobot what to research, draft, or monitor...`}
                  className="w-full liquid-glass-subtle rounded-xl px-3 py-2.5 text-xs text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:border-[#54B0FF] resize-none"
                />
              </div>

              <div className="rounded-2xl liquid-glass p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-100">
                  <Clock className="w-4 h-4 text-[#54B0FF]" />
                  <span>Execution Schedule</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {NANOBOT_CADENCE_OPTIONS.map((opt) => {
                    const selected = cadence === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          triggerHaptic('selection');
                          setCadence(opt.id);
                        }}
                        className={`p-2.5 rounded-xl text-left border transition-colors ${
                          selected
                            ? 'liquid-accent-glass border-[#54B0FF]/60'
                            : 'liquid-glass-subtle border-white/10 text-zinc-200 hover:bg-white/10'
                        }`}
                      >
                        <div className="text-xs font-semibold">{opt.label}</div>
                        <div
                          className={`text-[10.5px] mt-0.5 ${
                            selected ? 'text-white/85' : 'text-zinc-400'
                          }`}
                        >
                          {opt.description}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label
                      htmlFor="nanobot-start-time"
                      className="text-[11px] text-zinc-400 block mb-1"
                    >
                      Start Time
                    </label>
                    <input
                      id="nanobot-start-time"
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full min-h-[40px] liquid-glass-subtle rounded-xl px-3 py-1.5 text-xs font-mono text-zinc-100 focus:outline-hidden focus:border-[#54B0FF]"
                    />
                  </div>

                  {cadence === 'custom' && (
                    <div>
                      <label
                        htmlFor="nanobot-custom-interval"
                        className="text-[11px] text-zinc-400 block mb-1"
                      >
                        Every (minutes)
                      </label>
                      <input
                        id="nanobot-custom-interval"
                        type="number"
                        min={1}
                        max={10080}
                        value={customIntervalMinutes}
                        onChange={(e) =>
                          setCustomIntervalMinutes(Math.max(1, Number(e.target.value) || 15))
                        }
                        className="w-full min-h-[40px] liquid-glass-subtle rounded-xl px-3 py-1.5 text-xs font-mono text-zinc-100 focus:outline-hidden focus:border-[#54B0FF]"
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/10">
                  <div className="flex items-center gap-2 min-w-0">
                    <Bell className="w-4 h-4 text-[#54B0FF] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-zinc-100">Run Notifications</div>
                      <div className="text-[10.5px] text-zinc-400">
                        Alert when scheduled executions finish
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={notificationsEnabled}
                    aria-label="Toggle run notifications"
                    onClick={() => {
                      triggerHaptic('selection');
                      setNotificationsEnabled((p) => !p);
                    }}
                    className={`min-h-[34px] px-3 py-1 rounded-full text-[11px] font-semibold border ${
                      notificationsEnabled
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                        : 'liquid-glass-subtle text-zinc-400'
                    }`}
                  >
                    {notificationsEnabled ? 'On' : 'Off'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 6: REVIEW & RELEASE */}
          {stepIdx === 5 && (
            <motion.div
              key="wizard-step-review"
              custom={stepDir}
              initial={prefersReduced ? { opacity: 0 } : { opacity: 0, x: stepDir * 24 }}
              animate={{ opacity: 1, x: 0, transition: MOTION_TRANSITIONS.elementEnter }}
              exit={
                prefersReduced
                  ? { opacity: 0, transition: MOTION_TRANSITIONS.elementExit }
                  : { opacity: 0, x: stepDir * -24, transition: MOTION_TRANSITIONS.elementExit }
              }
              className="space-y-3"
            >
              <div className="rounded-2xl liquid-glass-elevated p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <motion.div
                    animate={
                      releaseDone
                        ? { y: prefersReduced ? 0 : -6, scale: 1.08 }
                        : isReleasing
                        ? { scale: [1, 1.06, 1], transition: { repeat: Infinity, duration: 0.7 } }
                        : { scale: 1 }
                    }
                    className="w-11 h-11 rounded-2xl bg-[#0F7FFF]/20 border border-[#54B0FF]/40 flex items-center justify-center text-[#54B0FF] shrink-0"
                  >
                    {releaseDone ? <CheckCircle2 className="w-6 h-6 text-emerald-400" /> : <Bot className="w-6 h-6" />}
                  </motion.div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-zinc-50 truncate">{botName}</h3>
                    <div className="text-[11px] font-mono text-[#54B0FF] truncate">
                      {selectedEngineSpec.name} · {selectedStyleSpec.name} · {selectedModelSpec.name}
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl liquid-glass-subtle space-y-1.5 text-xs">
                  <div className="text-[10.5px] font-mono text-zinc-400">Task Prompt</div>
                  <p className="text-zinc-100 leading-relaxed">{taskPrompt}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2.5 rounded-xl liquid-glass-subtle">
                    <div className="text-zinc-400">Schedule</div>
                    <div className="font-semibold text-zinc-100 capitalize mt-0.5">
                      {cadence === 'custom'
                        ? `Every ${customIntervalMinutes}m`
                        : cadence}{' '}
                      · {startTime}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl liquid-glass-subtle">
                    <div className="text-zinc-400">Notifications</div>
                    <div className="font-semibold text-zinc-100 mt-0.5">
                      {notificationsEnabled ? 'Enabled' : 'Muted'}
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-400/25 flex items-start gap-2 text-[11px] text-emerald-200">
                  <ShieldCheck className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-semibold">Private Bot Sandbox & Consent Logged</div>
                    <div className="text-emerald-200/80 font-mono text-[10px]">
                      Owner: {userId} · Agreed: {consentTimestampIso.slice(0, 19).replace('T', ' ')}
                    </div>
                  </div>
                </div>

                {submitError && (
                  <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-400/35 text-xs text-red-200">
                    {submitError}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Sticky Navigation Footer */}
      <div className="pt-1 shrink-0">
        {stepIdx < WIZARD_STEPS.length - 1 ? (
          <motion.button
            type="button"
            disabled={!canAdvance}
            whileTap={prefersReduced || !canAdvance ? undefined : { scale: MOTION_OFFSETS.tapScale }}
            transition={MOTION_SPRINGS.interactive}
            onClick={handleNext}
            className="w-full min-h-[48px] px-4 py-2.5 rounded-2xl liquid-accent-glass text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <span>Continue</span>
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        ) : (
          <motion.button
            type="button"
            disabled={isReleasing || releaseDone}
            whileTap={prefersReduced || isReleasing ? undefined : { scale: MOTION_OFFSETS.tapScale }}
            transition={MOTION_SPRINGS.interactive}
            onClick={() => void handleReleaseClick()}
            className="w-full min-h-[50px] px-4 py-3 rounded-2xl liquid-accent-glass text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-70"
          >
            <Rocket className={`w-4 h-4 ${isReleasing && !prefersReduced ? 'animate-bounce' : ''}`} />
            <span>
              {releaseDone
                ? 'Nanobot Released!'
                : isReleasing
                ? 'Provisioning Isolated Sandbox…'
                : 'Release Nanobot'}
            </span>
          </motion.button>
        )}
      </div>
    </div>
  );
};
