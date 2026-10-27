import { activeGymPlan, gymDayState, gymPersonalRecords, gymStreak, gymWeekSummary, nextSafeState } from './gym';
import type { GymRuleInput } from './gym';
import type { GymPlan, ProgressEntry, WorkoutSet } from './types';

test('active plans include their start date and exclude their end date', () => {
  const plan = basePlan();
  expect(activeGymPlan([plan], '2026-08-01')).toBe(plan);
  expect(activeGymPlan([plan], '2026-08-09')).toBeNull();
});

test('fixed Saturday rest preserves without growing the streak', () => {
  expect(gymStreak(input({ fixedRestWeekdays: [6], completed: ['2026-08-07'], today: '2026-08-08' })))
    .toMatchObject({ current: 1, preservedByRest: true, pendingSafeDate: null });
});

test('flexible rest is planned only within its weekly allowance', () => {
  const state = gymDayState(input({ restMode: 'flexible', flexibleRestAllowance: 1, restEvents: [{ id: 'r', date: '2026-08-08', kind: 'flexible' }], today: '2026-08-08' }));
  expect(state).toMatchObject({ kind: 'rest', canUndoRest: true, remainingFlexibleRest: 0 });
});

test('warmups never create a personal record', () => {
  expect(gymPersonalRecords([workout([{ exercise: 'Bench press', warmup: true, reps: 5, load: 80, rpe: null }, { exercise: 'Bench press', warmup: false, reps: 8, load: 70, rpe: null }])]))
    .toEqual({ 'bench press': { load: 70, reps: 8, entryId: 'w' } });
});

test('a stored Anchor protects one miss without growing the streak', () => {
  expect(gymStreak(input({ completed: ['2026-08-06'], today: '2026-08-08', safe: { scope: 'gym', stored: 1, qualifyingCount: 0, lastProtectedDate: null } })))
    .toMatchObject({ current: 1, pendingSafeDate: '2026-08-07' });
});

test('Anchor earning pauses at the one-Anchor cap', () => {
  expect(nextSafeState({ scope: 'gym', stored: 1, qualifyingCount: 6, lastProtectedDate: null }, 'qualifying_workout'))
    .toMatchObject({ stored: 1, qualifyingCount: 6 });
});

test('the seventh workout earns a Anchor and consuming one keeps paused progress', () => {
  expect(nextSafeState({ scope: 'gym', stored: 0, qualifyingCount: 6, lastProtectedDate: null }, 'qualifying_workout'))
    .toMatchObject({ stored: 1, qualifyingCount: 0 });
  expect(nextSafeState({ scope: 'gym', stored: 1, qualifyingCount: 6, lastProtectedDate: null }, { missedDate: '2026-08-07' }))
    .toMatchObject({ stored: 0, qualifyingCount: 6, lastProtectedDate: '2026-08-07' });
});

test('the week summary counts sessions against the plan and only working-set volume', () => {
  const week = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09'];
  const summary = gymWeekSummary(input({
    fixedRestWeekdays: [6],
    completed: ['2026-08-04'],
    entries: [workout([{ exercise: 'Bench press', warmup: true, reps: 5, load: 100, rpe: null }, { exercise: 'Bench press', warmup: false, reps: 8, load: 60, rpe: null }])],
    today: '2026-08-08',
  }), week);
  expect(summary).toMatchObject({ done: 1, rest: 1, target: 7, volume: 480 });
});

function input(overrides: Record<string, unknown> = {}): GymRuleInput {
  const { restMode, fixedRestWeekdays, flexibleRestAllowance, trainingWeekdays, ...inputOverrides } = overrides;
  return {
    plans: [{
      ...basePlan(),
      ...(restMode === 'fixed' || restMode === 'flexible' ? { restMode } : {}),
      ...(Array.isArray(fixedRestWeekdays) ? { fixedRestWeekdays: fixedRestWeekdays as number[] } : {}),
      ...(flexibleRestAllowance === 1 || flexibleRestAllowance === 2 ? { flexibleRestAllowance } : {}),
      ...(Array.isArray(trainingWeekdays) ? { trainingWeekdays: trainingWeekdays as number[] } : {}),
    }],
    restEvents: [],
    entries: [],
    safe: { scope: 'gym', stored: 0, qualifyingCount: 0, lastProtectedDate: null },
    completed: [],
    today: '2026-08-08',
    ...inputOverrides,
  } as GymRuleInput;
}

function basePlan(): GymPlan {
  return { id: 'p', primaryGoalId: 'g', restMode: 'fixed', fixedRestWeekdays: [], flexibleRestAllowance: 1, trainingWeekdays: [1, 2, 3, 4, 5, 6, 0], weeklySessionTarget: 7, weightUnit: 'kg', measurementUnit: 'cm', effectiveFrom: '2026-08-01', effectiveTo: '2026-08-09' };
}

function workout(sets: WorkoutSet[]): ProgressEntry {
  return { id: 'w', goalId: 'g', area: 'fitness', entryType: 'workout', metric: 'workout', value: 1, durationMinutes: 45, details: { routineId: null, routineName: 'Test', sets, startedAt: '2026-08-08T06:00:00Z', plannedState: 'training' }, note: '', occurrenceAt: '2026-08-08T06:45:00Z', status: 'complete', createdAt: '2026-08-08T06:45:00Z' };
}
