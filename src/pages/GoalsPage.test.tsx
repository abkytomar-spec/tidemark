import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GoalsPage } from './GoalsPage';
import type { Goal } from '../domain/types';
import { installCameraMock } from '../test/camera';

const fitnessGoal: Goal = {
  id: 'goal-1', title: 'Build strength', description: 'Feel capable', area: 'fitness', trackingType: 'count',
  targetValue: 12, currentValue: 3, unit: 'workouts', deadline: null, color: '#69C9A5', status: 'active', createdAt: '', updatedAt: '',
};

test('creates a goal without crowding the overview', async () => {
  const onCreateGoal = vi.fn();
  render(<GoalsPage goals={[]} milestones={[]} progressEntries={[]} enabledAreas={['fitness', 'learning']} onCreateGoal={onCreateGoal} onAddProgress={vi.fn()} />);
  expect(screen.getByText('Life balance')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Learning' }));
  await userEvent.click(screen.getByRole('button', { name: 'Add goal' }));
  await userEvent.type(screen.getByLabelText('Goal title'), 'Read more');
  await userEvent.selectOptions(screen.getByLabelText('Life area'), 'learning');
  await userEvent.clear(screen.getByLabelText('Target'));
  await userEvent.type(screen.getByLabelText('Target'), '12');
  await userEvent.click(screen.getByRole('button', { name: 'Create goal' }));
  expect(onCreateGoal).toHaveBeenCalledWith(expect.objectContaining({ title: 'Read more', area: 'learning', targetValue: 12 }));
});

test('uses the generic goal form when adding a Fitness goal', async () => {
  const onCreateGoal = vi.fn().mockResolvedValue(undefined);
  render(<GoalsPage goals={[]} milestones={[]} progressEntries={[]} enabledAreas={['fitness']} onCreateGoal={onCreateGoal} onAddProgress={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Fitness' }));
  await userEvent.click(screen.getByRole('button', { name: 'Add goal' }));

  expect(screen.getByLabelText('Goal title')).toBeVisible();
  expect(screen.getByLabelText('Life area')).toHaveValue('fitness');
  expect(screen.getByLabelText('Target')).toBeVisible();
  expect(screen.getByLabelText('Unit')).toBeVisible();
  expect(screen.queryByRole('radio', { name: /Physique|Strength \/ PR|Body measurements|Workout consistency/ })).not.toBeInTheDocument();
});

test('requires photo proof for a workout and records its exercise details', async () => {
  installCameraMock();
  const onAddProgress = vi.fn();
  render(<GoalsPage goals={[fitnessGoal]} milestones={[]} progressEntries={[]} enabledAreas={['fitness']} onCreateGoal={vi.fn()} onAddProgress={onAddProgress} />);
  await userEvent.click(screen.getByRole('button', { name: /Build strength/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Log workout' }));
  await userEvent.type(screen.getByLabelText('Workout'), 'Upper body');
  await userEvent.type(screen.getByLabelText('Exercise'), 'Bench press');
  await userEvent.clear(screen.getByLabelText('Weight'));
  await userEvent.type(screen.getByLabelText('Weight'), '70');
  await userEvent.click(await screen.findByRole('button', { name: 'Capture' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Save photo' }));
  const save = screen.getByRole('button', { name: 'Save workout' });
  await userEvent.click(save);
  expect(onAddProgress).toHaveBeenCalledWith(fitnessGoal, expect.objectContaining({ entryType: 'workout', details: expect.objectContaining({ workout: 'Upper body', exercise: 'Bench press', weight: 70 }) }), expect.objectContaining({ type: 'image/jpeg' }));
  expect(document.querySelector('input[type="file"]')).toBeNull();
});

test('captures an optional progress memory without changing its callback', async () => {
  installCameraMock();
  const onAddProgress = vi.fn();
  render(<GoalsPage goals={[fitnessGoal]} milestones={[]} progressEntries={[]} enabledAreas={['fitness']} onCreateGoal={vi.fn()} onAddProgress={onAddProgress} />);
  await userEvent.click(screen.getByRole('button', { name: /Build strength/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Log progress' }));
  await userEvent.type(screen.getByLabelText('Progress (workouts)'), '1');
  await userEvent.click(await screen.findByRole('button', { name: 'Capture' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Save photo' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save progress' }));
  expect(onAddProgress).toHaveBeenCalledWith(fitnessGoal, expect.objectContaining({ entryType: 'fitness', value: 1 }), expect.objectContaining({ type: 'image/jpeg' }));
});

test('retaking workout proof clears the confirmed frame', async () => {
  installCameraMock();
  const onAddProgress = vi.fn();
  render(<GoalsPage goals={[fitnessGoal]} milestones={[]} progressEntries={[]} enabledAreas={['fitness']} onCreateGoal={vi.fn()} onAddProgress={onAddProgress} />);
  await userEvent.click(screen.getByRole('button', { name: /Build strength/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Log workout' }));
  await userEvent.type(screen.getByLabelText('Workout'), 'Upper body');
  await userEvent.type(screen.getByLabelText('Exercise'), 'Bench press');
  await userEvent.click(await screen.findByRole('button', { name: 'Capture' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save photo' }));
  await userEvent.click(screen.getByRole('button', { name: 'Retake' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save workout' }));
  expect(onAddProgress).not.toHaveBeenCalled();
  expect(screen.getByText('Add a photo so this workout can count.')).toBeVisible();
});
