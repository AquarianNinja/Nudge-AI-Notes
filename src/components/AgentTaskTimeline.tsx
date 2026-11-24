import React, { useId } from 'react';
import {
  AlertCircle,
  Clock,
  FileText,
  Layers,
  Loader2,
  Search,
  X
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AgentStep,
  StageTelemetryMap,
  TimelineStage,
  TimelineStageId,
  TimelineStageStatus
} from '../types/index.ts';
import {
  formatStageDuration,
  mapAgentStepsToTimelineStages
} from '../utils/agentOrchestration.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import {
  MOTION_DURATIONS,
  MOTION_OFFSETS,
  MOTION_SPRINGS,
  MOTION_TRANSITIONS,
  buildListItemVariants,
  buildTimelineStepVariants,
  getStaggerDelay
} from '../utils/motion.ts';
import { AnimatedCheckmark } from './MotionPrimitives.tsx';

export interface AgentTaskTimelineProps {
  steps: AgentStep[];
  telemetry: StageTelemetryMap;
  isResearching: boolean;
  selectedStageId: TimelineStageId | null;
  onSelectStage: (stageId: TimelineStageId) => void;
  className?: string;
}

const STAGE_ICONS: Record<TimelineStageId, React.FC<{ className?: string }>> = {
  search: Search,
  synthesis: Layers,
  drafting: FileText
};

const STATUS_META: Record<
  TimelineStageStatus,
  {
    label: string;
    textClass: string;
    nodeClass: string;
    accentClass: string;
  }
> = {
  pending: {
    label: 'Pending',
    textClass: 'text-zinc-400',
    nodeClass: 'liquid-glass-subtle hover:bg-white/[0.06]',
    accentClass: 'text-zinc-400'
  },
  running: {
    label: 'Running',
    textClass: 'text-cyan-300',
    nodeClass: 'bg-cyan-500/12 border-cyan-400/45 hover:border-cyan-300/60 backdrop-blur-md',
    accentClass: 'text-cyan-300'
  },
  completed: {
    label: 'Completed',
    textClass: 'text-emerald-400',
    nodeClass: 'liquid-glass-subtle hover:bg-white/[0.06]',
    accentClass: 'text-emerald-400'
  },
  failed: {
    label: 'Failed',
    textClass: 'text-red-400',
    nodeClass: 'bg-red-950/25 border-red-800/60',
    accentClass: 'text-red-400'
  }
};

function renderStatusIcon(
  status: TimelineStageStatus,
  prefersReduced: boolean,
  sizeClass = 'w-3.5 h-3.5'
) {
  if (status === 'running') {
    return (
      <Loader2
        className={`${sizeClass} text-cyan-300 shrink-0 ${prefersReduced ? '' : 'animate-spin'}`}
      />
    );
  }
  if (status === 'completed') {
    return <AnimatedCheckmark className={`${sizeClass} text-emerald-400`} />;
  }
  if (status === 'failed') {
    return <AlertCircle className={`${sizeClass} text-red-400 shrink-0`} />;
  }
  return <Clock className={`${sizeClass} text-zinc-500 shrink-0`} />;
}

export const AgentTaskTimeline: React.FC<AgentTaskTimelineProps> = ({
  steps,
  telemetry,
  isResearching,
  selectedStageId,
  onSelectStage,
  className = ''
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const listItemVariants = buildListItemVariants(prefersReduced);
  const stepVariants = buildTimelineStepVariants(prefersReduced);
  const uid = useId();
  const detailPanelId = `agent-stage-detail-${uid}`;

  const stages: TimelineStage[] = mapAgentStepsToTimelineStages(steps, telemetry);
  const activeStage = stages.find(s => s.id === selectedStageId) || null;

  const totalElapsedMs = stages.reduce((sum, s) => sum + s.telemetry.elapsedMs, 0);
  const completedCount = stages.filter(s => s.status === 'completed').length;
  const totalSources = telemetry.search.sourceCount;

  const handleStagePress = (stageId: TimelineStageId) => {
    triggerHaptic('selection');
    onSelectStage(stageId);
  };

  return (
    <section
      aria-label="Multi-agent research timeline"
      className={`@container rounded-2xl liquid-glass-subtle p-3 ${className}`}
    >
      {/* Header Telemetry Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums text-zinc-400 min-w-0">
          <span className="font-sans text-xs font-medium text-zinc-200 whitespace-nowrap">
            Agent Pipeline
          </span>
          <span aria-hidden="true" className="text-zinc-600">·</span>
          <span className="whitespace-nowrap">{completedCount}/3 stages</span>
          <span aria-hidden="true" className="text-zinc-600">·</span>
          <span className="whitespace-nowrap">{formatStageDuration(totalElapsedMs)}</span>
          {totalSources > 0 && (
            <>
              <span aria-hidden="true" className="text-zinc-600 hidden @sm:inline">·</span>
              <span className="whitespace-nowrap hidden @sm:inline">
                {totalSources} sources
              </span>
            </>
          )}
        </div>

        <span className="text-[11px] font-mono text-zinc-400 whitespace-nowrap shrink-0">
          {isResearching ? 'Live telemetry' : 'Tap stage to inspect'}
        </span>
      </div>

      {/* Horizontal 3-Stage Stepper */}
      <div className="grid grid-cols-3 @md:flex @md:items-stretch gap-1 @md:gap-2">
        {stages.map((stage, idx) => {
          const StageIcon = STAGE_ICONS[stage.id];
          const meta = STATUS_META[stage.status];
          const isSelected = selectedStageId === stage.id;
          const prevCompleted = idx > 0 && stages[idx - 1].status === 'completed';
          const trackActive =
            stage.status === 'completed' || stage.status === 'running' || prevCompleted;

          return (
            <React.Fragment key={stage.id}>
              {idx > 0 && (
                <div
                  aria-hidden="true"
                  className="hidden @md:flex items-center shrink-0 w-4 md:w-6"
                >
                  <div className="relative h-px w-full bg-zinc-800 overflow-hidden">
                    <motion.div
                      initial={false}
                      animate={{ scaleX: trackActive ? 1 : 0 }}
                      transition={MOTION_TRANSITIONS.elementEnter}
                      style={{ transformOrigin: 'left' }}
                      className={`absolute inset-0 ${
                        stage.status === 'running' ? 'bg-cyan-400/70' : 'bg-emerald-500/70'
                      }`}
                    />
                  </div>
                </div>
              )}

              <motion.button
                type="button"
                data-haptic="off"
                custom={idx}
                variants={stepVariants}
                initial="initial"
                animate={stage.status}
                whileTap={
                  prefersReduced
                    ? undefined
                    : { scale: MOTION_OFFSETS.cardTapScale, transition: MOTION_SPRINGS.interactive }
                }
                onClick={() => handleStagePress(stage.id)}
                aria-expanded={isSelected}
                aria-controls={detailPanelId}
                aria-label={`${stage.label} stage: ${meta.label}, ${formatStageDuration(stage.telemetry.elapsedMs)}, ${stage.telemetry.sourceCount} ${stage.telemetry.sourceLabel}`}
                className={`relative min-w-0 @md:flex-1 text-left p-1.5 @md:p-2.5 rounded-xl border transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-white/50 overflow-hidden ${meta.nodeClass}`}
              >
                <AnimatePresence initial={false}>
                  {stage.status === 'completed' && (
                    <motion.span
                      key={`stage-complete-tint-${stage.id}`}
                      aria-hidden="true"
                      initial={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                      animate={{
                        opacity: 1,
                        scale: 1,
                        transition: {
                          ...MOTION_TRANSITIONS.elementEnter,
                          delay: getStaggerDelay(idx)
                        }
                      }}
                      exit={{ opacity: 0, transition: MOTION_TRANSITIONS.elementExit }}
                      className="pointer-events-none absolute inset-0 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04]"
                    />
                  )}
                </AnimatePresence>

                {isSelected && (
                  <motion.span
                    layoutId={`timeline-stage-ring-${uid}`}
                    transition={MOTION_SPRINGS.pill}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-xl border border-white/45 bg-white/[0.08]"
                  />
                )}

                <div className="relative z-10 flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1 @md:gap-1.5 min-w-0">
                    <StageIcon
                      className={`w-3 h-3 @md:w-3.5 @md:h-3.5 shrink-0 ${meta.accentClass}`}
                    />
                    <span className="text-[10.5px] @md:text-xs font-medium text-zinc-100 truncate">
                      <span className="hidden @md:inline font-mono text-zinc-500 mr-1">
                        {stage.indexLabel}
                      </span>
                      {stage.label}
                    </span>
                  </div>
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={`stage-icon-${stage.status}`}
                      initial={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
                      animate={{
                        opacity: 1,
                        scale: 1,
                        transition: {
                          ...MOTION_TRANSITIONS.microEnter,
                          delay: stage.status === 'completed' ? getStaggerDelay(idx) : 0
                        }
                      }}
                      exit={{
                        opacity: 0,
                        scale: prefersReduced ? 1 : 0.85,
                        transition: { duration: MOTION_DURATIONS.microFast }
                      }}
                      className="inline-flex items-center justify-center shrink-0"
                    >
                      {renderStatusIcon(stage.status, prefersReduced, 'w-3 h-3 @md:w-3.5 @md:h-3.5')}
                    </motion.span>
                  </AnimatePresence>
                </div>

                <div className="relative z-10 flex flex-col gap-0.5 text-[10px] @md:text-[11px]">
                  <div className="flex items-center gap-1 font-mono tabular-nums text-zinc-400 min-w-0">
                    <span className="shrink-0">{formatStageDuration(stage.telemetry.elapsedMs)}</span>
                    <span aria-hidden="true" className="text-zinc-600 shrink-0 hidden @md:inline">
                      ·
                    </span>
                    <span className="hidden @md:inline whitespace-nowrap">
                      {stage.telemetry.sourceCount} {stage.telemetry.sourceLabel}
                    </span>
                    <span className="truncate @md:hidden text-zinc-500">
                      · {stage.telemetry.sourceCount}
                    </span>
                  </div>

                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={`stage-status-${stage.status}`}
                      initial={
                        prefersReduced
                          ? { opacity: 0 }
                          : { opacity: 0, y: Math.round(MOTION_OFFSETS.listItemSlidePx * 0.5) }
                      }
                      animate={{
                        opacity: 1,
                        y: 0,
                        transition: {
                          ...MOTION_TRANSITIONS.microEnter,
                          delay: stage.status === 'completed' ? getStaggerDelay(idx) : 0
                        }
                      }}
                      exit={{
                        opacity: 0,
                        y: prefersReduced ? 0 : -Math.round(MOTION_OFFSETS.listItemSlidePx * 0.4),
                        transition: { duration: MOTION_DURATIONS.microFast }
                      }}
                      className={`text-[10px] font-mono whitespace-nowrap shrink-0 ${meta.textClass}`}
                    >
                      {meta.label}
                    </motion.span>
                  </AnimatePresence>
                </div>
              </motion.button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Interactive Stage Detail Drawer */}
      <AnimatePresence initial={false}>
        {activeStage && (
          <motion.div
            key={activeStage.id}
            id={detailPanelId}
            initial={{ opacity: 0, y: prefersReduced ? 0 : -4 }}
            animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITIONS.elementEnter }}
            exit={{
              opacity: 0,
              y: prefersReduced ? 0 : -4,
              transition: MOTION_TRANSITIONS.elementExit
            }}
            className="mt-3 pt-3 border-t border-white/10 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-xs font-medium text-zinc-100">
                  <span className="font-mono text-zinc-400 mr-1.5">{activeStage.indexLabel}</span>
                  {activeStage.label}
                </h3>
                <p className="text-[11px] text-zinc-400 truncate">{activeStage.description}</p>
              </div>
              <motion.button
                type="button"
                data-haptic="off"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                transition={MOTION_SPRINGS.interactive}
                onClick={() => handleStagePress(activeStage.id)}
                aria-label={`Close ${activeStage.label} details`}
                className="flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white px-2.5 py-1 rounded-full hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
              >
                <X className="w-3 h-3" />
                <span>Close</span>
              </motion.button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {activeStage.subSteps.map((subStep, sIdx) => {
                const subMeta = STATUS_META[subStep.status];
                return (
                  <motion.div
                    key={subStep.id}
                    custom={sIdx}
                    variants={stepVariants}
                    initial="initial"
                    animate={subStep.status}
                    className={`relative p-2.5 rounded-xl border text-xs space-y-1 transition-colors overflow-hidden ${
                      subStep.status === 'completed'
                        ? 'liquid-glass-subtle border-emerald-400/25'
                        : subStep.status === 'running'
                        ? 'bg-cyan-500/10 border-cyan-400/35'
                        : 'liquid-glass-subtle'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <AnimatePresence mode="popLayout" initial={false}>
                          <motion.span
                            key={`substep-icon-${subStep.status}`}
                            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
                            animate={{
                              opacity: 1,
                              scale: 1,
                              transition: {
                                ...MOTION_TRANSITIONS.microEnter,
                                delay: subStep.status === 'completed' ? getStaggerDelay(sIdx) : 0
                              }
                            }}
                            exit={{
                              opacity: 0,
                              scale: prefersReduced ? 1 : 0.85,
                              transition: { duration: MOTION_DURATIONS.microFast }
                            }}
                            className="inline-flex items-center justify-center shrink-0"
                          >
                            {renderStatusIcon(subStep.status, prefersReduced, 'w-3 h-3')}
                          </motion.span>
                        </AnimatePresence>
                        <span className="font-medium text-[11px] text-zinc-100 truncate">
                          {subStep.title}
                        </span>
                      </div>
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.span
                          key={`substep-status-${subStep.status}`}
                          initial={
                            prefersReduced
                              ? { opacity: 0 }
                              : { opacity: 0, y: Math.round(MOTION_OFFSETS.listItemSlidePx * 0.5) }
                          }
                          animate={{
                            opacity: 1,
                            y: 0,
                            transition: {
                              ...MOTION_TRANSITIONS.microEnter,
                              delay: subStep.status === 'completed' ? getStaggerDelay(sIdx) : 0
                            }
                          }}
                          exit={{
                            opacity: 0,
                            y: prefersReduced ? 0 : -Math.round(MOTION_OFFSETS.listItemSlidePx * 0.4),
                            transition: { duration: MOTION_DURATIONS.microFast }
                          }}
                          className={`text-[10px] font-mono tabular-nums whitespace-nowrap shrink-0 ${subMeta.textClass}`}
                        >
                          {subStep.latencyMs ? formatStageDuration(subStep.latencyMs) : subMeta.label}
                        </motion.span>
                      </AnimatePresence>
                    </div>

                    <p className="text-[11px] text-zinc-400">{subStep.detail}</p>

                    {subStep.dataOutput && subStep.dataOutput.length > 0 && (
                      <ul className="pt-1.5 border-t border-zinc-800/70 space-y-0.5 text-[10px] text-zinc-400 font-mono">
                        {subStep.dataOutput.slice(0, 3).map((item, vIdx) => (
                          <motion.li
                            key={`${subStep.id}-out-${vIdx}-${subStep.status === 'completed' ? 'done' : 'wait'}`}
                            custom={sIdx + vIdx}
                            variants={listItemVariants}
                            initial={subStep.status === 'completed' ? 'initial' : false}
                            animate="animate"
                            className="truncate"
                          >
                            {vIdx + 1}. {item}
                          </motion.li>
                        ))}
                      </ul>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};
