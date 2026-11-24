import test from 'node:test';
import assert from 'node:assert/strict';
import {
  areAllEntriesCollapsed,
  buildDiaryCalendarMonth,
  parseIsoYearMonth,
  shiftYearMonth,
  toggleEntriesCollapsedState
} from './diaryCalendar.ts';
import { createDiaryEntry } from './workspaceScheduler.ts';

test('parseIsoYearMonth and shiftYearMonth handle year boundaries and leap years', () => {
  assert.deepEqual(parseIsoYearMonth('2026-11-19'), { year: 2026, monthIndex: 10 });
  assert.deepEqual(shiftYearMonth(2026, 0, -1), { year: 2025, monthIndex: 11 });
  assert.deepEqual(shiftYearMonth(2026, 11, 1), { year: 2027, monthIndex: 0 });
});

test('buildDiaryCalendarMonth builds Sunday-first grid with leap Feb 29 and ordered category dots', () => {
  const entries = [
    createDiaryEntry({
      id: 'd1',
      dateIso: '2024-02-29',
      title: 'Leap Focus',
      content: 'Audit reserve limits',
      category: 'Note'
    }),
    createDiaryEntry({
      id: 'd2',
      dateIso: '2024-02-29',
      title: 'Leap Decision',
      content: 'Lock ClaimCenter API v10',
      category: 'Focus'
    }),
    createDiaryEntry({
      id: 'd3',
      dateIso: '2024-02-29',
      title: 'Duplicate Focus',
      content: 'Second focus log',
      category: 'Focus'
    }),
    createDiaryEntry({
      id: 'd4',
      dateIso: '2024-02-14',
      title: 'Blocker log',
      content: 'PolicyCenter latency',
      category: 'Blocker'
    })
  ];

  const grid = buildDiaryCalendarMonth({
    year: 2024,
    monthIndex: 1, // Feb 2024 (starts Thu -> 4 leading days + 29 days = 33 -> 35 cells)
    entries,
    selectedDateIso: '2024-02-29',
    todayIso: '2024-02-14'
  });

  assert.equal(grid.days.length, 35);
  assert.equal(grid.monthIsoPrefix, '2024-02');
  assert.equal(grid.activeDaysCount, 2);
  assert.equal(grid.totalEntriesInMonth, 4);

  const leapCell = grid.days.find((d) => d.dateIso === '2024-02-29');
  assert.ok(leapCell);
  assert.equal(leapCell.inCurrentMonth, true);
  assert.equal(leapCell.isSelected, true);
  assert.equal(leapCell.entryCount, 3);
  // Deduplicated and ordered Focus -> Decision -> Blocker -> Note
  assert.deepEqual(leapCell.categories, ['Focus', 'Note']);
  assert.match(leapCell.ariaLabel, /3 entries: Focus, Note/);

  const todayCell = grid.days.find((d) => d.dateIso === '2024-02-14');
  assert.ok(todayCell);
  assert.equal(todayCell.isToday, true);
  assert.deepEqual(todayCell.categories, ['Blocker']);
});

test('toggleEntriesCollapsedState flips between collapsing all and expanding all entries', () => {
  const entries = [
    createDiaryEntry({ id: 'e1', dateIso: '2026-11-19', title: 'A', content: 'Body A' }),
    createDiaryEntry({ id: 'e2', dateIso: '2026-11-19', title: 'B', content: 'Body B' })
  ];

  // Mixed or all-expanded -> collapses all
  const collapsed = toggleEntriesCollapsedState(entries, { e1: true, e2: false });
  assert.equal(areAllEntriesCollapsed(entries, collapsed), true);
  assert.deepEqual(collapsed, { e1: true, e2: true });

  // All-collapsed -> expands all
  const expanded = toggleEntriesCollapsedState(entries, collapsed);
  assert.equal(areAllEntriesCollapsed(entries, expanded), false);
  assert.deepEqual(expanded, { e1: false, e2: false });
});
