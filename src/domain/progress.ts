import { addDays, addMonths, addWeeks, format, getDay, getISOWeek, getISOWeekYear, parseISO } from 'date-fns';
import { dateKey, occursOn } from './schedule';
import type { ProgressEntry, Task, TaskCompletion } from './types';

export function dailyProgress(tasks: Task[], completions: TaskCompletion[], date: Date) {
  const scheduled = tasks.filter(task => occursOn(task, date));
  const key = dateKey(date);
  const done = new Map(completions.filter(item => item.occurrenceDate === key && item.status !== 'pending_proof').map(item => [item.taskId, item]));
  const completed = scheduled.filter(task => done.has(task.id)).length;
  const points = scheduled.reduce((sum, task) => sum + (done.get(task.id)?.points ?? 0), 0);
  return { completed, total: scheduled.length, percent: scheduled.length ? Math.round(completed / scheduled.length * 100) : 0, points };
}

export function personalRecords(entries: ProgressEntry[]): Record<string, number> {
  return entries.reduce<Record<string, number>>((records, entry) => {
    records[entry.metric] = Math.max(records[entry.metric] ?? Number.NEGATIVE_INFINITY, entry.value);
    return records;
  }, {});
}

type StreakSchedule = { cadence: 'daily' | 'weekly' | 'monthly'; restWeekdays: number[] };
export type StreakResult = { current: number; best: number; comeback: boolean; preservedByRest: boolean };

export function streakFor(schedule: StreakSchedule, completionDates: string[], today: Date): StreakResult {
  if (schedule.cadence !== 'daily') return periodStreak(schedule.cadence, completionDates, today);
  const dates = [...new Set(completionDates)].sort();
  const completed = new Set(dates);
  const rest = new Set(schedule.restWeekdays);
  let cursor = today;
  let current = 0;
  let preservedByRest = false;
  let skippedOpenToday = false;

  for (let i = 0; i < 370; i += 1) {
    if (rest.has(getDay(cursor))) {
      if (i === 0) preservedByRest = true;
      cursor = addDays(cursor, -1);
      continue;
    }
    if (completed.has(dateKey(cursor))) {
      current += 1;
      cursor = addDays(cursor, -1);
      continue;
    }
    if (!skippedOpenToday && dateKey(cursor) === dateKey(today)) {
      skippedOpenToday = true;
      cursor = addDays(cursor, -1);
      continue;
    }
    break;
  }

  let best = 0;
  let run = 0;
  let previous: Date | null = null;
  let runs = 0;
  for (const key of dates) {
    const date = parseISO(key);
    if (!previous || dateKey(previousRequired(date, rest)) !== dateKey(previous)) {
      run = 1;
      runs += 1;
    } else run += 1;
    best = Math.max(best, run);
    previous = date;
  }
  return { current, best, comeback: runs > 1 && current > 0, preservedByRest };
}

function previousRequired(date: Date, rest: Set<number>) {
  let previous = addDays(date, -1);
  while (rest.has(getDay(previous))) previous = addDays(previous, -1);
  return previous;
}

function periodStreak(cadence: 'weekly' | 'monthly', completionDates: string[], today: Date): StreakResult {
  const key = cadence === 'weekly'
    ? (date: Date) => `${getISOWeekYear(date)}-${String(getISOWeek(date)).padStart(2, '0')}`
    : (date: Date) => format(date, 'yyyy-MM');
  const step = cadence === 'weekly' ? addWeeks : addMonths;
  const periods = new Set(completionDates.map(value => key(parseISO(value))));
  let cursor = today;
  let current = 0;
  if (!periods.has(key(cursor))) cursor = step(cursor, -1);
  while (periods.has(key(cursor))) { current += 1; cursor = step(cursor, -1); }
  const sorted = [...periods].sort();
  let best = 0;
  let run = 0;
  let previous: Date | null = null;
  let runs = 0;
  for (const value of sorted) {
    const date = cadence === 'weekly'
      ? parseISO(completionDates.find(item => key(parseISO(item)) === value)!)
      : parseISO(`${value}-01`);
    if (!previous || key(step(previous, 1)) !== key(date)) { run = 1; runs += 1; } else run += 1;
    best = Math.max(best, run);
    previous = date;
  }
  return { current, best, comeback: runs > 1 && current > 0, preservedByRest: false };
}
