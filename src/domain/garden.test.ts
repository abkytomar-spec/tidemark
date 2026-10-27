import { gardenLine, gardenStage, learnedFocusWindow, lightenCandidates, parseMindSweep } from './garden';
import type { Task, TaskCompletion } from './types';

test('garden stages grow at the five progress boundaries', () => {
  expect(gardenStage(0, 4)).toBe('soil');
  expect(gardenStage(1, 4)).toBe('sprout');
  expect(gardenStage(2, 4)).toBe('leaves');
  expect(gardenStage(3, 4)).toBe('bloom');
  expect(gardenStage(4, 4)).toBe('lantern');
  expect(gardenStage(0, 0)).toBe('soil');
});

test('mind sweep trims, deduplicates, and caps planted tasks', () => {
  const lines = [' Email Sam ', 'email sam', 'Book dentist', ...Array.from({ length: 20 }, (_, index) => `Task ${index}`)];
  const tasks = parseMindSweep(lines.join('\n'), '2026-08-10');
  expect(tasks).toHaveLength(12);
  expect(tasks[0]).toEqual({ title: 'Email Sam', scheduleDate: '2026-08-10' });
  expect(tasks[1]).toEqual({ title: 'Book dentist', scheduleDate: '2026-08-10' });
});

test('lighten candidates exclude completed, recurring, timed, and high-priority tasks', () => {
  const tasks = [
    task({ id: 'movable' }),
    task({ id: 'high', priority: 'high' }),
    task({ id: 'timed', scheduleTime: '09:00' }),
    task({ id: 'daily', recurrence: { type: 'daily' } }),
    task({ id: 'done' }),
    task({ id: 'tomorrow', scheduleDate: '2026-08-11' }),
  ];
  const completions: TaskCompletion[] = [{ id: 'c', taskId: 'done', occurrenceDate: '2026-08-10', completedAt: '2026-08-10T08:00:00Z', points: 5, hasProof: false, status: 'complete' }];
  expect(lightenCandidates(tasks, completions, '2026-08-10').map(item => item.id)).toEqual(['movable']);
});

test('learned focus window needs five recent completions and chooses the busiest window', () => {
  const recent = ['07:00', '08:00', '09:00', '10:00', '15:00'].map((time, index) => completion(index, `2026-08-0${index + 5}T${time}:00`));
  expect(learnedFocusWindow(recent.slice(0, 4), new Date('2026-08-10T18:00:00'))).toBeNull();
  expect(learnedFocusWindow(recent, new Date('2026-08-10T18:00:00'))).toBe('morning');
  expect(learnedFocusWindow([...recent, completion(9, '2026-07-01T08:00:00')], new Date('2026-08-10T18:00:00'))).toBe('morning');
});

test('garden personality copy is deterministic for a day and voice', () => {
  const first = gardenLine('bloom', 'gentle', '2026-08-10');
  expect(first).toBe(gardenLine('bloom', 'gentle', '2026-08-10'));
  expect(first.length).toBeGreaterThan(10);
});

function task(overrides: Partial<Task>): Task {
  return { id: 'task', title: 'Task', notes: '', priority: 'low', color: '#78B98A', estimatedMinutes: 5, energy: 'medium', scheduleDate: '2026-08-10', scheduleTime: null, recurrence: { type: 'one_time' }, goalId: null, proofRequired: false, archived: false, createdAt: '', updatedAt: '', ...overrides };
}

function completion(index: number, completedAt: string): TaskCompletion {
  return { id: `c${index}`, taskId: `t${index}`, occurrenceDate: completedAt.slice(0, 10), completedAt, points: 5, hasProof: false, status: 'complete' };
}
