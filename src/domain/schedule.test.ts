import { occursOn, occurrenceKey } from './schedule';
import type { Task } from './types';

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1', title: 'Train', notes: '', priority: 'medium', color: '#5B8DEF',
  estimatedMinutes: 45, energy: 'medium', scheduleDate: '2026-01-31', scheduleTime: null,
  recurrence: { type: 'monthly', dayOfMonth: 31 }, goalId: null, proofRequired: false,
  archived: false, createdAt: '', updatedAt: '', ...overrides,
});

test('monthly day 31 lands on the final day of a short month', () => {
  expect(occursOn(task(), new Date('2027-02-28T12:00:00'))).toBe(true);
  expect(occursOn(task(), new Date('2027-02-27T12:00:00'))).toBe(false);
});

test('weekly tasks occur only on selected weekdays after their start', () => {
  const weekly = task({ scheduleDate: '2026-08-03', recurrence: { type: 'weekly', weekdays: [1, 4] } });
  expect(occursOn(weekly, new Date('2026-08-06T12:00:00'))).toBe(true);
  expect(occursOn(weekly, new Date('2026-08-07T12:00:00'))).toBe(false);
  expect(occursOn(weekly, new Date('2026-07-30T12:00:00'))).toBe(false);
});

test('occurrence keys use a stable local calendar date', () => {
  expect(occurrenceKey('task-1', new Date(2026, 7, 9))).toBe('task-1:2026-08-09');
});
