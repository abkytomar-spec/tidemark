import { dailyProgress, personalRecords, streakFor } from './progress';
import type { ProgressEntry, Task, TaskCompletion } from './types';

test('planned rest days preserve but do not grow a fitness streak', () => {
  expect(streakFor({ cadence: 'daily', restWeekdays: [0] }, ['2026-08-08'], new Date('2026-08-09T12:00:00')))
    .toMatchObject({ current: 1, preservedByRest: true });
});

test('a return after a gap creates a comeback without deleting the best run', () => {
  expect(streakFor({ cadence: 'daily', restWeekdays: [] }, ['2026-08-01', '2026-08-02', '2026-08-05'], new Date('2026-08-05T12:00:00')))
    .toMatchObject({ current: 1, best: 2, comeback: true });
});

test('daily progress counts only scheduled tasks and unique completions', () => {
  const tasks = [baseTask('a'), baseTask('b')];
  const completions: TaskCompletion[] = [{ id: 'c', taskId: 'a', occurrenceDate: '2026-08-09', completedAt: '', points: 10, hasProof: false }];
  expect(dailyProgress(tasks, completions, new Date('2026-08-09T12:00:00'))).toEqual({ completed: 1, total: 2, percent: 50, points: 10 });
});

test('personal records keep the highest numeric value per metric', () => {
  const entries = [entry('bench', 60), entry('bench', 70), entry('study-minutes', 45)];
  expect(personalRecords(entries)).toEqual({ bench: 70, 'study-minutes': 45 });
});

function baseTask(id: string): Task {
  return { id, title: id, notes: '', priority: 'medium', color: '#fff', estimatedMinutes: 10, energy: 'low', scheduleDate: '2026-08-09', scheduleTime: null, recurrence: { type: 'one_time' }, goalId: null, proofRequired: false, archived: false, createdAt: '', updatedAt: '' };
}

function entry(metric: string, value: number): ProgressEntry {
  return { id: crypto.randomUUID(), goalId: 'g', area: 'fitness', entryType: 'measurement', metric, value, durationMinutes: null, details: {}, note: '', occurrenceAt: '', status: 'complete', createdAt: '' };
}
