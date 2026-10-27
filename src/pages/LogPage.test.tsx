import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogPage } from './LogPage';
import type { Snapshot } from '../domain/types';

const data: Pick<Snapshot, 'tasks' | 'completions' | 'activities' | 'proofs' | 'checkins'> = {
  tasks: [],
  completions: [
    { id: 'c1', taskId: 't1', occurrenceDate: '2026-08-07', completedAt: '', points: 10, hasProof: false, status: 'complete' },
    { id: 'c2', taskId: 't2', occurrenceDate: '2026-08-08', completedAt: '', points: 10, hasProof: true, status: 'complete' },
  ],
  activities: [{ id: 'a1', type: 'task_completed', message: 'Completed Read', relatedType: 'task', relatedId: 't1', createdAt: '2026-08-08T10:00:00Z' }],
  proofs: [{ id: 'p1', ownerType: 'completion', ownerId: 'c2', imageUrl: '/api/proofs/p1/image', createdAt: '2026-08-08T10:00:00Z', selectedForRecap: false }],
  checkins: [],
};

test('turns consistency into a forgiving streak constellation', () => {
  render(<LogPage {...data} globalSafe={{ scope: 'global', stored: 1, qualifyingCount: 0, lastProtectedDate: null }} today={new Date('2026-08-09T12:00:00')} onDeleteProof={vi.fn()} onSaveReflection={vi.fn()} />);
  expect(screen.getByText('2 day tide')).toBeVisible();
  expect(screen.getByText('Anchor ready')).toBeVisible();
  expect(screen.getByText('Completed Read')).toBeVisible();
  expect(screen.getByLabelText('Tide chart')).toBeVisible();
});

test('reveals recent moments in small batches instead of an endless feed', async () => {
  const activities = Array.from({ length: 12 }, (_, index) => ({
    id: `activity-${index}`,
    type: 'task_completed',
    message: `Finished task ${index + 1}`,
    relatedType: 'task',
    relatedId: `task-${index}`,
    createdAt: `2026-08-${String(11 - index).padStart(2, '0')}T10:00:00Z`,
  }));
  render(<LogPage {...data} activities={activities} today={new Date('2026-08-11T12:00:00')} onDeleteProof={vi.fn()} onSaveReflection={vi.fn()} />);

  expect(screen.getByText('Finished task 8')).toBeVisible();
  expect(screen.queryByText('Finished task 9')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Show more moments' }));
  expect(screen.getByText('Finished task 12')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Show more moments' })).not.toBeInTheDocument();
});

test('keeps old proof viewable and saves a weekly reset', async () => {
  const onDeleteProof = vi.fn();
  const onSaveReflection = vi.fn();
  render(<LogPage {...data} today={new Date('2026-08-09T12:00:00')} onDeleteProof={onDeleteProof} onSaveReflection={onSaveReflection} />);
  await userEvent.click(screen.getByRole('button', { name: 'Photos' }));
  await userEvent.click(screen.getByRole('button', { name: /Tasks 1/ }));
  await userEvent.click(screen.getByRole('button', { name: /Proof from/ }));
  expect(screen.getByRole('img', { name: /Proof from/ })).toHaveAttribute('src', '/api/proofs/p1/image');
  await userEvent.click(screen.getByRole('button', { name: 'Close Proof memory' }));
  await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
  await userEvent.type(screen.getByLabelText('A win'), 'Kept showing up');
  await userEvent.type(screen.getByLabelText('Next week'), 'Train twice');
  await userEvent.click(screen.getByRole('button', { name: 'Save reset' }));
  expect(onSaveReflection).toHaveBeenCalledWith(expect.stringContaining('Kept showing up'));
});

test('shows saved evening watches in the private logbook', () => {
  const checkins = [{ id: 'd1', date: '2026-08-09', energy: 'medium' as const, mood: 3 as const, note: '', intention: 'Ship calmly', win: 'Finished the release', gratitude: 'A quiet walk' }];
  render(<LogPage {...data} checkins={checkins} today={new Date('2026-08-09T20:00:00')} onDeleteProof={vi.fn()} onSaveReflection={vi.fn()} />);
  expect(screen.getByRole('heading', { name: 'Evening watches' })).toBeVisible();
  expect(screen.getByText('Finished the release')).toBeVisible();
  expect(screen.getByText('A quiet walk')).toBeVisible();
});

test('keeps Gym, Goals, Tasks, and Daily photos in separate libraries', async () => {
  const onDeleteProof = vi.fn();
  const moments = {
    settings: { enabled: true, windowStart: '12:00', windowEnd: '17:00', notifications: false },
    today: null,
    eligiblePrompt: false,
    days: [
      { id: 'august-day', localDate: '2026-08-11', scheduledTime: '14:30', status: 'scheduled' as const, capturedAt: null, caption: '' },
    ],
  };
  const proofs = [
    { id: 'august-proof', ownerType: 'daily_moment' as const, ownerId: 'august-day', category: 'daily' as const, caption: 'Rain on glass', imageUrl: '/api/proofs/august-proof/image', createdAt: '2026-08-11T09:10:00Z', selectedForRecap: false },
    { id: 'second-proof', ownerType: 'daily_moment' as const, ownerId: 'august-day', category: 'daily' as const, caption: 'Coffee light', imageUrl: '/api/proofs/second-proof/image', createdAt: '2026-08-11T09:20:00Z', selectedForRecap: false },
    { id: 'gym-proof', ownerType: 'progress' as const, ownerId: 'gym-entry', category: 'gym' as const, imageUrl: '/api/proofs/gym/image', createdAt: '2026-08-10T09:10:00Z', selectedForRecap: false },
    { id: 'goal-proof', ownerType: 'progress' as const, ownerId: 'goal-entry', category: 'goals' as const, imageUrl: '/api/proofs/goal/image', createdAt: '2026-08-09T09:10:00Z', selectedForRecap: false },
    { id: 'task-proof', ownerType: 'completion' as const, ownerId: 'task-completion', category: 'tasks' as const, imageUrl: '/api/proofs/task/image', createdAt: '2026-08-08T09:10:00Z', selectedForRecap: false },
  ];
  render(<LogPage {...data} proofs={proofs} dailyMoment={moments} today={new Date('2026-08-11T12:00:00')} onDeleteProof={onDeleteProof} onSaveReflection={vi.fn()} />);

  await userEvent.click(screen.getByRole('button', { name: 'Photos' }));
  expect(screen.getByRole('button', { name: /Gym 1/ })).toBeVisible();
  expect(screen.getByRole('button', { name: /Goals 1/ })).toBeVisible();
  expect(screen.getByRole('button', { name: /Tasks 1/ })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: /Daily 2/ }));
  expect(screen.getByRole('heading', { name: 'August 2026' })).toBeVisible();
  expect(screen.getAllByRole('button', { name: 'Daily Snapshot from 11 Aug 2026' })).toHaveLength(2);
  await userEvent.click(screen.getAllByRole('button', { name: 'Daily Snapshot from 11 Aug 2026' })[0]);
  expect(screen.getByRole('img', { name: 'Daily Snapshot from 11 August 2026' })).toHaveAttribute('src', '/api/proofs/second-proof/image');
  expect(screen.getByText('Coffee light')).toBeVisible();
  expect(screen.getByText('Daily Snapshot', { selector: 'strong' })).toBeVisible();
  expect(screen.getByText(/captured at/i)).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Delete moment' }));
  expect(onDeleteProof).toHaveBeenCalledWith(expect.objectContaining({ id: 'second-proof' }));
});
