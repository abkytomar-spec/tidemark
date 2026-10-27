import { addDays, getDay, parseISO, startOfWeek } from 'date-fns';
import { dateKey } from './schedule';
import type { GymDayState, GymPlan, GymRestEvent, GymSafe, GymSnapshot, GymStreakResult, ProgressEntry, WorkoutSet } from './types';

export type GymRuleInput = { plans: GymPlan[]; restEvents: GymRestEvent[]; entries: ProgressEntry[]; safe: GymSafe; completed: string[]; today: string };

export const EMPTY_GYM_SNAPSHOT: GymSnapshot = {
  plans: [],
  routines: [],
  restEvents: [],
  safe: { scope: 'gym', stored: 0, qualifyingCount: 0, lastProtectedDate: null },
};

export function activeGymPlan(plans: GymPlan[], date: string): GymPlan | null {
  const key = toDateKey(date);
  return plans.find(plan => plan.effectiveFrom <= key && (plan.effectiveTo === null || key < plan.effectiveTo)) ?? null;
}

export function gymDayState(input: GymRuleInput): GymDayState {
  const key = toDateKey(input.today);
  const plan = activeGymPlan(input.plans, key);
  const completed = input.completed.includes(key);
  const status = dayStatus(plan, input.restEvents, key);
  const remainingFlexibleRest = plan?.restMode === 'flexible'
    ? Math.max(0, plan.flexibleRestAllowance - flexibleRestDates(plan, input.restEvents, key).length)
    : 0;

  if (completed) return { kind: 'complete', scheduled: status === 'training', canUndoRest: false, canTrainAnyway: false, remainingFlexibleRest };
  if (status === 'rest') return { kind: 'rest', scheduled: false, canUndoRest: plan?.restMode === 'flexible', canTrainAnyway: true, remainingFlexibleRest };
  if (status === 'training') return { kind: 'training', scheduled: true, canUndoRest: false, canTrainAnyway: false, remainingFlexibleRest };
  return { kind: 'open', scheduled: false, canUndoRest: false, canTrainAnyway: true, remainingFlexibleRest };
}

export function gymStreak(input: GymRuleInput): GymStreakResult {
  const today = toDateKey(input.today);
  const completed = new Set(input.completed.map(toDateKey));
  const earliestPlanDate = input.plans.reduce<string | null>((earliest, plan) => !earliest || plan.effectiveFrom < earliest ? plan.effectiveFrom : earliest, null);
  if (!earliestPlanDate) return { current: 0, best: 0, preservedByRest: false, pendingSafeDate: null, comeback: false };

  let cursor = today;
  let current = 0;
  let pendingSafeDate: string | null = null;
  let safeAvailable = input.safe.stored === 1;
  const todayStatus = dayStatus(activeGymPlan(input.plans, today), input.restEvents, today);

  while (cursor >= earliestPlanDate) {
    const status = dayStatus(activeGymPlan(input.plans, cursor), input.restEvents, cursor);
    if (status === 'open' || status === 'rest' || cursor === today && !completed.has(cursor)) {
      cursor = previousDate(cursor);
      continue;
    }
    if (completed.has(cursor)) {
      current += 1;
      cursor = previousDate(cursor);
      continue;
    }
    if (input.safe.lastProtectedDate === cursor) {
      cursor = previousDate(cursor);
      continue;
    }
    if (safeAvailable) {
      pendingSafeDate = cursor;
      safeAvailable = false;
      cursor = previousDate(cursor);
      continue;
    }
    break;
  }

  let best = 0;
  let run = 0;
  let runs = 0;
  for (let date = earliestPlanDate; date <= today; date = nextDate(date)) {
    const status = dayStatus(activeGymPlan(input.plans, date), input.restEvents, date);
    if (status === 'open' || status === 'rest' || date === today && !completed.has(date) || input.safe.lastProtectedDate === date) continue;
    if (completed.has(date)) {
      if (run === 0) runs += 1;
      run += 1;
      best = Math.max(best, run);
    } else run = 0;
  }

  return {
    current,
    best: Math.max(best, current),
    preservedByRest: todayStatus === 'rest',
    pendingSafeDate,
    comeback: runs > 1 && current > 0,
  };
}

export type GymWeekSummary = { states: GymDayState[]; done: number; planned: number; rest: number; target: number; volume: number };

/** The week a tracker actually needs: sessions done against the plan, rest taken, and load moved. */
export function gymWeekSummary(input: GymRuleInput, weekDates: string[]): GymWeekSummary {
  const states = weekDates.map(date => gymDayState({ ...input, today: date }));
  const plan = activeGymPlan(input.plans, input.today);
  const inWeek = new Set(weekDates.map(toDateKey));
  const volume = input.entries.reduce((total, entry) => {
    if (entry.status !== 'complete' || entry.entryType !== 'workout' || !Array.isArray(entry.details.sets)) return total;
    if (!inWeek.has(toDateKey(entry.occurrenceAt))) return total;
    return total + (entry.details.sets as WorkoutSet[]).reduce((load, set) => set.warmup ? load : load + set.load * set.reps, 0);
  }, 0);

  return {
    states,
    done: states.filter(state => state.kind === 'complete').length,
    planned: states.filter(state => state.kind === 'training' || state.kind === 'complete' && state.scheduled).length,
    rest: states.filter(state => state.kind === 'rest').length,
    target: plan?.weeklySessionTarget ?? plan?.trainingWeekdays.length ?? 0,
    volume: Math.round(volume),
  };
}

export function gymPersonalRecords(entries: ProgressEntry[]): Record<string, { load: number; reps: number; entryId: string }> {
  const records: Record<string, { load: number; reps: number; entryId: string }> = {};
  for (const entry of entries) {
    if (entry.status !== 'complete' || entry.entryType !== 'workout' || !Array.isArray(entry.details.sets)) continue;
    for (const set of entry.details.sets as WorkoutSet[]) {
      if (set.warmup) continue;
      const exercise = set.exercise.trim().toLowerCase();
      if (!exercise) continue;
      const previous = records[exercise];
      if (!previous || set.load > previous.load || set.load === previous.load && set.reps > previous.reps) {
        records[exercise] = { load: set.load, reps: set.reps, entryId: entry.id };
      }
    }
  }
  return records;
}

export function nextSafeState(safe: GymSafe, event: 'qualifying_workout' | { missedDate: string }): GymSafe {
  if (event === 'qualifying_workout') {
    if (safe.stored === 1) return safe;
    const qualifyingCount = safe.qualifyingCount + 1;
    return qualifyingCount === 7
      ? { ...safe, stored: 1, qualifyingCount: 0 }
      : { ...safe, qualifyingCount };
  }
  return safe.stored === 1
    ? { ...safe, stored: 0, lastProtectedDate: toDateKey(event.missedDate) }
    : safe;
}

function dayStatus(plan: GymPlan | null, restEvents: GymRestEvent[], key: string): 'training' | 'rest' | 'open' {
  if (!plan) return 'open';
  const weekday = getDay(parseISO(key));
  if (plan.restMode === 'fixed' && plan.fixedRestWeekdays.includes(weekday)) return 'rest';
  if (plan.restMode === 'flexible' && flexibleRestDates(plan, restEvents, key).includes(key)) return 'rest';
  return plan.trainingWeekdays.includes(weekday) ? 'training' : 'open';
}

function flexibleRestDates(plan: GymPlan, restEvents: GymRestEvent[], key: string): string[] {
  const weekStart = toDateKey(startOfWeek(parseISO(key), { weekStartsOn: 1 }).toISOString());
  const weekEnd = dateKey(addDays(parseISO(weekStart), 6));
  return restEvents
    .filter(event => event.kind === 'flexible')
    .map(event => toDateKey(event.date))
    .filter(date => date >= weekStart && date <= weekEnd)
    .sort()
    .slice(0, plan.flexibleRestAllowance);
}

function toDateKey(value: string): string {
  return dateKey(parseISO(value));
}

function previousDate(value: string): string {
  return dateKey(addDays(parseISO(value), -1));
}

function nextDate(value: string): string {
  return dateKey(addDays(parseISO(value), 1));
}
