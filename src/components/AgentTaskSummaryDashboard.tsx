import React, { useMemo } from 'react';
import { CalendarClock, CheckCircle2, Play, Plus } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { GenTeamAgent, GenTeamTask, GenTeamTaskStatus } from '../types/index.ts';
import {
  computeAgentTaskWorkloadSummary,
  formatTaskDeadlineMeta,
  sortPendingTasksByDeadline
} from '../utils/genTeamTaskSummary.ts';

interface AgentTaskSummaryDashboardProps {
  agent: GenTeamAgent;
  tasks: readonly GenTeamTask[];
  onRunTask?: (task: GenTeamTask) => void;
  onAdvanceTask?: (taskId: string) => void;
  onAssignNewTask?: () => void;
}

function formatStageLabel(status: GenTeamTaskStatus): string {
  if (status === 'todo') return 'To Do';
  if (status === 'in-progress') return 'In Progress';
  if (status === 'in-review') return 'In Review';
  return 'Done';
}

export const AgentTaskSummaryDashboard: React.FC<AgentTaskSummaryDashboardProps> = ({
  agent,
  tasks,
  onRunTask,
  onAdvanceTask,
  onAssignNewTask
}) => {
  const prefersReduced = Boolean(useReducedMotion());

  const summary = useMemo(
    () => computeAgentTaskWorkloadSummary(agent, tasks),
    [agent, tasks]
  );

  const pendingSorted = useMemo(
    () => sortPendingTasksByDeadline(tasks, agent.id),
    [tasks, agent.id]
  );

  // SVG Ring Geometry (88px diameter, r=36, circumference=2*pi*36 ~ 226.19)
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const targetDashOffset =
    circumference * (1 - Math.min(1, Math.max(0, summary.ringProgressPct / 100)));

  const strokeColor =
    summary.loadState === 'at-capacity'
      ? '#F87171'
      : summary.loadState === 'elevated'
      ? '#F59E0B'
      : '#54B0FF';

  const loadTextClass =
    summary.loadState === 'at-capacity'
      ? 'text-red-300'
      : summary.loadState === 'elevated'
      ? 'text-amber-300'
      : summary.loadState === 'clear'
      ? 'text-emerald-300'
      : 'text-[#54B0FF]';

  return (
    <div className="space-y-3">
      {/* Workload Progress Ring & Capacity Breakdown Card */}
      <section
        aria-label={`${agent.name} workload summary`}
        className="p-3.5 rounded-2xl liquid-glass flex items-center gap-4"
      >
        <div
          className="relative w-[88px] h-[88px] shrink-0 flex items-center justify-center"
          role="img"
          aria-label={`${summary.pendingCount} of ${summary.capacity} pending task capacity (${summary.rawUtilizationPct}%)`}
        >
          <svg
            viewBox="0 0 88 88"
            className="w-full h-full -rotate-90"
            aria-hidden="true"
          >
            <circle
              cx="44"
              cy="44"
              r={radius}
              fill="none"
              stroke="rgba(255, 255, 255, 0.1)"
              strokeWidth="7"
            />
            <motion.circle
              cx="44"
              cy="44"
              r={radius}
              fill="none"
              stroke={strokeColor}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={false}
              animate={{ strokeDashoffset: targetDashOffset }}
              transition={
                prefersReduced
                  ? { duration: 0 }
                  : { duration: 0.45, ease: [0.16, 1, 0.3, 1] }
              }
            />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            <span className="text-base font-bold text-zinc-50 font-mono tabular-nums leading-none">
              {summary.pendingCount}/{summary.capacity}
            </span>
            <span className="text-[10px] text-zinc-400 mt-1 leading-none">
              pending
            </span>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-1.5">
            <h3 className="text-xs font-semibold text-zinc-100 truncate">
              {agent.name} Workload
            </h3>
            <span className={`text-[11px] font-semibold shrink-0 ${loadTextClass}`}>
              {summary.loadLabel}
            </span>
          </div>

          <div className="flex items-baseline gap-1.5 text-[11px] text-zinc-300 tabular-nums">
            <span className="text-sm font-semibold text-zinc-50 font-mono">
              {summary.rawUtilizationPct}%
            </span>
            <span>of capacity</span>
            <span aria-hidden="true" className="text-zinc-500">·</span>
            <span className="text-zinc-400">{summary.completedCount} done</span>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-400 tabular-nums pt-1 border-t border-white/10">
            <span>To Do: {summary.todoCount}</span>
            <span aria-hidden="true">·</span>
            <span>In Progress: {summary.inProgressCount}</span>
            <span aria-hidden="true">·</span>
            <span>Review: {summary.inReviewCount}</span>
          </div>
        </div>
      </section>

      {/* Deadline-Sorted Pending Tasks Section */}
      <section aria-label={`${agent.name} pending tasks by deadline`} className="space-y-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 tabular-nums">
            <CalendarClock className="w-3.5 h-3.5 text-[#54B0FF] shrink-0" />
            <span className="font-medium text-zinc-200">
              Pending by Deadline · {pendingSorted.length}
            </span>
            <span aria-hidden="true">·</span>
            <span>Soonest first</span>
          </div>

          {onAssignNewTask && (
            <button
              type="button"
              onClick={onAssignNewTask}
              className="min-h-[32px] inline-flex items-center gap-1 text-[11px] font-medium text-[#54B0FF] hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Task</span>
            </button>
          )}
        </div>

        {pendingSorted.length === 0 ? (
          <div className="p-5 rounded-2xl liquid-glass text-center space-y-2">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-zinc-100">
                All caught up
              </p>
              <p className="text-[11px] text-zinc-400">
                Zero pending tasks in {agent.name}&apos;s queue.
              </p>
            </div>
            {onAssignNewTask && (
              <button
                type="button"
                onClick={onAssignNewTask}
                className="min-h-[38px] inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl liquid-accent-glass text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Assign Task</span>
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-2xl liquid-glass divide-y divide-white/10 overflow-hidden">
            {pendingSorted.map((task) => {
              const deadlineMeta = formatTaskDeadlineMeta(task.deadlineIso);
              const urgencyColorClass =
                deadlineMeta.urgency === 'overdue'
                  ? 'text-red-300'
                  : deadlineMeta.urgency === 'today'
                  ? 'text-amber-300'
                  : deadlineMeta.urgency === 'soon'
                  ? 'text-[#54B0FF]'
                  : 'text-zinc-400';

              return (
                <article key={task.id} className="p-3.5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] tabular-nums">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`font-semibold ${urgencyColorClass}`}>
                        {deadlineMeta.label}
                      </span>
                      <span aria-hidden="true" className="text-zinc-600">·</span>
                      <span className="text-zinc-300">{formatStageLabel(task.status)}</span>
                      {task.priority === 'High' && (
                        <>
                          <span aria-hidden="true" className="text-zinc-600">·</span>
                          <span className="text-amber-300 font-medium">High priority</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-zinc-100 leading-snug">
                      {task.title}
                    </h4>
                    {task.description && (
                      <p className="text-[11px] text-zinc-400 leading-relaxed mt-0.5 line-clamp-2">
                        {task.description}
                      </p>
                    )}
                  </div>

                  {(onRunTask || onAdvanceTask) && (
                    <div className="flex items-center justify-end gap-1.5 pt-1">
                      {onRunTask && (
                        <button
                          type="button"
                          onClick={() => onRunTask(task)}
                          className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#0F7FFF]/20 hover:bg-[#0F7FFF]/35 text-[#58A6FF] text-[11px] font-medium whitespace-nowrap transition-colors"
                        >
                          <Play className="w-3 h-3" />
                          <span>Run</span>
                        </button>
                      )}
                      {onAdvanceTask && (
                        <button
                          type="button"
                          onClick={() => onAdvanceTask(task.id)}
                          className="min-h-[34px] px-2.5 py-1 rounded-xl liquid-glass-subtle hover:bg-white/10 text-[11px] font-medium text-zinc-200 whitespace-nowrap transition-colors"
                        >
                          Next Stage
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
