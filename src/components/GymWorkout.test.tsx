import { render } from '@testing-library/react';
import { activeWorkoutKey, GymWorkout, readActiveWorkout } from './GymWorkout';

const userId = 'user-1';

beforeEach(() => localStorage.clear());

test('a draft older than any real session is not resumed', () => {
  const draft = { id: 'w', entrySaved: false, routineId: null, routineName: 'Open', sets: [], plannedState: 'open', note: '' };
  localStorage.setItem(activeWorkoutKey(userId), JSON.stringify({ draft, startedAt: new Date(Date.now() - 90 * 60_000).toISOString() }));
  expect(readActiveWorkout(userId)?.draft.id).toBe('w');

  localStorage.setItem(activeWorkoutKey(userId), JSON.stringify({ draft, startedAt: new Date(Date.now() - 7 * 60 * 60_000).toISOString() }));
  expect(readActiveWorkout(userId)).toBeNull();
});

test('the elapsed clock keeps reading hours past the first one', () => {
  localStorage.setItem(activeWorkoutKey(userId), JSON.stringify({
    draft: { id: 'w', entrySaved: false, routineId: null, routineName: 'Open', sets: [{ exercise: 'Squat', reps: 8, load: 60, warmup: false, rpe: null }], plannedState: 'open', note: '' },
    startedAt: new Date(Date.now() - (2 * 3600 + 4 * 60 + 9) * 1000).toISOString(),
  }));
  const { getByText } = render(<GymWorkout userId={userId} routine={null} entries={[]} goalId="g" date="2026-08-12" plannedState="open" onSaveEntry={vi.fn()} onSaveProof={vi.fn()} onClose={vi.fn()} />);

  expect(getByText('2:04:09')).toBeInTheDocument();
  expect(getByText('480 kg')).toBeInTheDocument();
});
