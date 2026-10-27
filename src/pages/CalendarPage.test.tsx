import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installCameraMock } from '../test/camera';
import { CalendarPage } from './CalendarPage';
import type { Task } from '../domain/types';

test('shows a day-31 monthly task on the last day of February', async () => {
  const monthly: Task = { id: 'monthly', title: 'Monthly review', notes: '', priority: 'medium', color: '#5B8DEF', estimatedMinutes: 30, energy: 'medium', scheduleDate: '2026-01-31', scheduleTime: null, recurrence: { type: 'monthly', dayOfMonth: 31 }, goalId: null, proofRequired: false, archived: false, createdAt: '', updatedAt: '' };
  render(<CalendarPage initialDate={new Date('2027-02-01T12:00:00')} tasks={[monthly]} completions={[]} goals={[]} onCreateTask={vi.fn()} onComplete={vi.fn()} onReopen={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'February 28, 1 task' }));
  expect(screen.getByRole('heading', { name: 'Monthly review' })).toBeVisible();
});

test('month navigation moves one calendar month', async () => {
  render(<CalendarPage initialDate={new Date('2026-08-09T12:00:00')} tasks={[]} completions={[]} goals={[]} onCreateTask={vi.fn()} onComplete={vi.fn()} onReopen={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
  expect(screen.getByRole('heading', { name: 'September 2026' })).toBeVisible();
});

test('captures required task proof in the calendar without a file picker', async () => {
  installCameraMock();
  const onComplete = vi.fn();
  const task: Task = { id: 'proof', title: 'Gym session', notes: '', priority: 'high', color: '#F37B6D', estimatedMinutes: 45, energy: 'high', scheduleDate: '2026-08-09', scheduleTime: null, recurrence: { type: 'one_time' }, goalId: null, proofRequired: true, archived: false, createdAt: '', updatedAt: '' };
  render(<CalendarPage initialDate={new Date('2026-08-09T12:00:00')} tasks={[task]} completions={[]} goals={[]} onCreateTask={vi.fn()} onComplete={onComplete} onReopen={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Complete Gym session' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Capture' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Save photo' }));
  expect(onComplete).toHaveBeenCalledWith(task, '2026-08-09', expect.objectContaining({ type: 'image/jpeg' }));
  expect(document.querySelector('input[type="file"]')).toBeNull();
});
