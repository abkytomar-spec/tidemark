import { rankNextActions } from './suggestions';
import type { Task } from './types';

const now = new Date('2026-08-09T08:00:00');
const urgentQuickTask: Task = {
  id: 'urgent', title: 'Send the form', notes: '', priority: 'high', color: '#F37B6D',
  estimatedMinutes: 8, energy: 'low', scheduleDate: '2026-08-09', scheduleTime: '09:00',
  recurrence: { type: 'one_time' }, goalId: null, proofRequired: false, archived: false, createdAt: '', updatedAt: '',
};

test('next action explains an urgent low-energy fit', () => {
  const result = rankNextActions([urgentQuickTask], { minutes: 10, energy: 'low', now });
  expect(result[0].task.id).toBe('urgent');
  expect(result[0].reason).toContain('due soon');
  expect(result[0].reason).toContain('fits 10 min');
});

test('archived and oversized tasks are excluded', () => {
  const archived = { ...urgentQuickTask, id: 'archived', archived: true };
  const long = { ...urgentQuickTask, id: 'long', estimatedMinutes: 90 };
  expect(rankNextActions([archived, long], { minutes: 10, energy: 'low', now })).toEqual([]);
});
