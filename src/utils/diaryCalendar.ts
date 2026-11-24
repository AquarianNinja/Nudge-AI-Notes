import type { OfficeDiaryCategory, OfficeDiaryEntry } from '../types/index.ts';
import { formatDiaryDateLabel, getTodayIsoDate } from './workspaceScheduler.ts';

export const ORDERED_DIARY_CATEGORIES: readonly OfficeDiaryCategory[] = [
  'Focus',
  'Decision',
  'Blocker',
  'Note'
];

export const DIARY_CATEGORY_META: Record<
  OfficeDiaryCategory,
  {
    dotClass: string;
    activeDotClass: string;
    label: string;
  }
> = {
  Focus: {
    dotClass: 'bg-[#54B0FF]',
    activeDotClass: 'bg-[#0F7FFF]',
    label: 'Focus'
  },
  Decision: {
    dotClass: 'bg-emerald-400',
    activeDotClass: 'bg-emerald-600',
    label: 'Decision'
  },
  Blocker: {
    dotClass: 'bg-rose-400',
    activeDotClass: 'bg-rose-600',
    label: 'Blocker'
  },
  Note: {
    dotClass: 'bg-amber-400',
    activeDotClass: 'bg-amber-600',
    label: 'Note'
  }
};

export interface DiaryCalendarDayCell {
  dateIso: string;
  dayNumber: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  entryCount: number;
  categories: OfficeDiaryCategory[];
  ariaLabel: string;
}

export interface DiaryCalendarMonthData {
  year: number;
  monthIndex: number; // 0-11
  monthLabel: string;
  monthIsoPrefix: string; // YYYY-MM
  days: DiaryCalendarDayCell[];
  activeDaysCount: number;
  totalEntriesInMonth: number;
}

export function formatIsoDate(year: number, monthIndex: number, day: number): string {
  const mm = String(monthIndex + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function parseIsoYearMonth(dateIso: string): { year: number; monthIndex: number } {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec((dateIso || '').trim());
  if (!match) {
    const now = new Date();
    return { year: now.getFullYear(), monthIndex: now.getMonth() };
  }
  const year = Number(match[1]);
  const monthIndex = Math.max(0, Math.min(11, Number(match[2]) - 1));
  return { year, monthIndex };
}

export function shiftYearMonth(
  year: number,
  monthIndex: number,
  deltaMonths: number
): { year: number; monthIndex: number } {
  const d = new Date(year, monthIndex + deltaMonths, 1);
  return {
    year: d.getFullYear(),
    monthIndex: d.getMonth()
  };
}

export function buildDiaryCalendarMonth(options: {
  year: number;
  monthIndex: number;
  entries: OfficeDiaryEntry[];
  selectedDateIso: string | null;
  todayIso?: string;
}): DiaryCalendarMonthData {
  const { year, monthIndex, entries, selectedDateIso } = options;
  const todayIso = options.todayIso || getTodayIsoDate();

  const monthStart = new Date(year, monthIndex, 1);
  const monthLabel = monthStart.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  });
  const monthIsoPrefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

  // Aggregate categories and counts per YYYY-MM-DD
  const byDate = new Map<
    string,
    { count: number; categorySet: Set<OfficeDiaryCategory> }
  >();

  for (const entry of entries) {
    const bucket = byDate.get(entry.dateIso) || {
      count: 0,
      categorySet: new Set<OfficeDiaryCategory>()
    };
    bucket.count += 1;
    bucket.categorySet.add(entry.category);
    byDate.set(entry.dateIso, bucket);
  }

  const startWeekday = monthStart.getDay(); // 0 (Sun) - 6 (Sat)
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;

  const days: DiaryCalendarDayCell[] = [];
  let activeDaysCount = 0;
  let totalEntriesInMonth = 0;

  for (let i = 0; i < totalCells; i += 1) {
    const cellDate = new Date(year, monthIndex, 1 - startWeekday + i);
    const cellYear = cellDate.getFullYear();
    const cellMonth = cellDate.getMonth();
    const cellDay = cellDate.getDate();
    const dateIso = formatIsoDate(cellYear, cellMonth, cellDay);
    const inCurrentMonth = cellYear === year && cellMonth === monthIndex;
    const stats = byDate.get(dateIso);
    const entryCount = stats?.count || 0;
    const categories = stats
      ? ORDERED_DIARY_CATEGORIES.filter((cat) => stats.categorySet.has(cat))
      : [];

    if (inCurrentMonth && entryCount > 0) {
      activeDaysCount += 1;
      totalEntriesInMonth += entryCount;
    }

    const humanDate = formatDiaryDateLabel(dateIso);
    const ariaLabel =
      entryCount > 0
        ? `${humanDate}, ${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}: ${categories.join(', ')}`
        : `${humanDate}, no entries`;

    days.push({
      dateIso,
      dayNumber: cellDay,
      inCurrentMonth,
      isToday: dateIso === todayIso,
      isSelected: selectedDateIso === dateIso,
      entryCount,
      categories,
      ariaLabel
    });
  }

  return {
    year,
    monthIndex,
    monthLabel,
    monthIsoPrefix,
    days,
    activeDaysCount,
    totalEntriesInMonth
  };
}

export function areAllEntriesCollapsed(
  entries: OfficeDiaryEntry[],
  collapsedMap: Record<string, boolean>
): boolean {
  if (entries.length === 0) return false;
  return entries.every((entry) => Boolean(collapsedMap[entry.id]));
}

export function toggleEntriesCollapsedState(
  entries: OfficeDiaryEntry[],
  collapsedMap: Record<string, boolean>
): Record<string, boolean> {
  if (entries.length === 0) return collapsedMap;
  const shouldExpandAll = areAllEntriesCollapsed(entries, collapsedMap);
  const next = { ...collapsedMap };
  for (const entry of entries) {
    next[entry.id] = !shouldExpandAll;
  }
  return next;
}
