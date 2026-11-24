import React, { useMemo } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  Plus,
  X
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { OfficeDiaryEntry } from '../types/index.ts';
import {
  DIARY_CATEGORY_META,
  ORDERED_DIARY_CATEGORIES,
  buildDiaryCalendarMonth,
  shiftYearMonth
} from '../utils/diaryCalendar.ts';
import { formatDiaryDateLabel, getTodayIsoDate } from '../utils/workspaceScheduler.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import { MOTION_OFFSETS, MOTION_SPRINGS, MOTION_TRANSITIONS } from '../utils/motion.ts';

interface OfficeDiaryCalendarProps {
  entries: OfficeDiaryEntry[];
  selectedDateIso: string | null;
  onSelectDate: (dateIso: string | null) => void;
  viewYear: number;
  viewMonthIndex: number;
  onChangeMonth: (year: number, monthIndex: number) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  selectedDateEntryCount: number;
  allSelectedEntriesCollapsed: boolean;
  onToggleSelectedEntriesExpanded: () => void;
  onCreateNoteForDate: (dateIso: string) => void;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export const OfficeDiaryCalendar: React.FC<OfficeDiaryCalendarProps> = ({
  entries,
  selectedDateIso,
  onSelectDate,
  viewYear,
  viewMonthIndex,
  onChangeMonth,
  isOpen,
  onToggleOpen,
  selectedDateEntryCount,
  allSelectedEntriesCollapsed,
  onToggleSelectedEntriesExpanded,
  onCreateNoteForDate
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const todayIso = getTodayIsoDate();

  const monthData = useMemo(
    () =>
      buildDiaryCalendarMonth({
        year: viewYear,
        monthIndex: viewMonthIndex,
        entries,
        selectedDateIso,
        todayIso
      }),
    [viewYear, viewMonthIndex, entries, selectedDateIso, todayIso]
  );

  const handleStepMonth = (delta: number) => {
    triggerHaptic('selection');
    const next = shiftYearMonth(viewYear, viewMonthIndex, delta);
    onChangeMonth(next.year, next.monthIndex);
  };

  const handleJumpToToday = () => {
    triggerHaptic('selection');
    const now = new Date();
    onChangeMonth(now.getFullYear(), now.getMonth());
    onSelectDate(todayIso);
  };

  return (
    <section
      aria-label="Office Diary Calendar"
      className="rounded-2xl liquid-glass p-3 space-y-2.5"
    >
      {/* Collapsible Calendar Header */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls="office-diary-calendar-grid"
          onClick={() => {
            triggerHaptic('selection');
            onToggleOpen();
          }}
          className="flex items-center gap-2 min-w-0 text-left py-1 rounded-lg hover:bg-white/[0.04] transition-colors cursor-pointer"
        >
          <Calendar className="w-4 h-4 text-[#54B0FF] shrink-0" />
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-xs font-semibold text-zinc-100 truncate">
              {monthData.monthLabel}
            </span>
            <span className="text-[11px] font-mono tabular-nums text-zinc-400 whitespace-nowrap shrink-0">
              · {monthData.totalEntriesInMonth}{' '}
              {monthData.totalEntriesInMonth === 1 ? 'log' : 'logs'}
            </span>
          </div>
          {isOpen ? (
            <ChevronUp className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          )}
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {selectedDateIso && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                onSelectDate(null);
              }}
              title="Clear selected calendar date"
              className="min-h-[30px] flex items-center gap-1 px-2.5 py-1 rounded-full liquid-glass-subtle hover:bg-white/10 text-[11px] text-zinc-200 whitespace-nowrap"
            >
              <X className="w-3 h-3" />
              <span>All Dates</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleJumpToToday}
            className="min-h-[30px] px-2.5 py-1 rounded-full liquid-glass-subtle hover:bg-white/10 text-[11px] font-medium text-[#54B0FF] whitespace-nowrap"
          >
            Today
          </button>
        </div>
      </div>

      {/* Collapsible Monthly Calendar Grid */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id="office-diary-calendar-grid"
            initial={{ opacity: 0, y: prefersReduced ? 0 : -4 }}
            animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITIONS.elementEnter }}
            exit={{
              opacity: 0,
              y: prefersReduced ? 0 : -4,
              transition: MOTION_TRANSITIONS.elementExit
            }}
            className="pt-2 border-t border-white/10 space-y-2"
          >
            {/* Month Stepper */}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => handleStepMonth(-1)}
                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl liquid-glass-subtle hover:bg-white/10 text-zinc-200 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="text-[11px] font-mono tabular-nums text-zinc-300">
                {monthData.activeDaysCount} active{' '}
                {monthData.activeDaysCount === 1 ? 'day' : 'days'} in {monthData.monthLabel}
              </div>

              <button
                type="button"
                aria-label="Next month"
                onClick={() => handleStepMonth(1)}
                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl liquid-glass-subtle hover:bg-white/10 text-zinc-200 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Weekday Header */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAY_LABELS.map((day) => (
                <div
                  key={day}
                  className="text-[10px] font-mono text-zinc-500 py-0.5 select-none"
                >
                  {day.slice(0, 2)}
                </div>
              ))}
            </div>

            {/* 7-Column Date Grid */}
            <div role="grid" aria-label={monthData.monthLabel} className="grid grid-cols-7 gap-1">
              {monthData.days.map((cell) => {
                const isSelected = cell.isSelected;
                return (
                  <motion.button
                    key={cell.dateIso}
                    type="button"
                    data-haptic="off"
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                    transition={MOTION_SPRINGS.interactive}
                    onClick={() => {
                      triggerHaptic('selection');
                      onSelectDate(isSelected ? null : cell.dateIso);
                    }}
                    aria-label={cell.ariaLabel}
                    aria-pressed={isSelected}
                    className={`min-h-[42px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-[#54B0FF] ${
                      isSelected
                        ? 'liquid-lens-active text-zinc-950 font-semibold'
                        : cell.isToday
                        ? 'bg-[#0F7FFF]/15 ring-1 ring-[#54B0FF]/65 text-zinc-50 font-semibold hover:bg-[#0F7FFF]/25'
                        : cell.inCurrentMonth
                        ? 'text-zinc-100 hover:bg-white/[0.08]'
                        : 'text-zinc-600 hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className="text-xs font-mono tabular-nums leading-none">
                      {cell.dayNumber}
                    </span>

                    <span
                      aria-hidden="true"
                      className="h-1.5 flex items-center justify-center gap-0.5"
                    >
                      {cell.categories.map((cat) => (
                        <span
                          key={cat}
                          className={`w-1.5 h-1.5 rounded-full ${
                            isSelected
                              ? DIARY_CATEGORY_META[cat].activeDotClass
                              : DIARY_CATEGORY_META[cat].dotClass
                          }`}
                        />
                      ))}
                    </span>
                  </motion.button>
                );
              })}
            </div>

            {/* Quiet Category Dot Legend (Unboxed Metadata) */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-1 px-0.5 text-[10px] text-zinc-400">
              <div className="flex items-center gap-3">
                {ORDERED_DIARY_CATEGORIES.map((cat) => (
                  <span key={cat} className="inline-flex items-center gap-1">
                    <span
                      aria-hidden="true"
                      className={`w-1.5 h-1.5 rounded-full ${DIARY_CATEGORY_META[cat].dotClass}`}
                    />
                    <span>{DIARY_CATEGORY_META[cat].label}</span>
                  </span>
                ))}
              </div>
              <span className="font-mono text-zinc-500">Tap date to filter</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active Selected Date Filter + Quick-Toggle Controls */}
      {selectedDateIso && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
          <div className="text-[11px] text-zinc-200 font-medium min-w-0">
            <span>{formatDiaryDateLabel(selectedDateIso)}</span>
            <span className="text-zinc-400 font-mono tabular-nums ml-1.5">
              · {selectedDateEntryCount}{' '}
              {selectedDateEntryCount === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {selectedDateEntryCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  onToggleSelectedEntriesExpanded();
                }}
                className="min-h-[32px] flex items-center gap-1 px-2.5 py-1 rounded-full liquid-glass-subtle hover:bg-white/10 text-[11px] font-medium text-zinc-100 whitespace-nowrap"
              >
                {allSelectedEntriesCollapsed ? (
                  <>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-[#54B0FF]" />
                    <span>Expand Entries</span>
                  </>
                ) : (
                  <>
                    <ChevronsDownUp className="w-3.5 h-3.5 text-[#54B0FF]" />
                    <span>Collapse Entries</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                onCreateNoteForDate(selectedDateIso);
              }}
              className="min-h-[32px] flex items-center gap-1 px-2.5 py-1 rounded-full liquid-accent-glass text-[11px] font-semibold whitespace-nowrap"
            >
              <Plus className="w-3 h-3" />
              <span>Log Day</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
