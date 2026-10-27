import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Goal, GymGoalType, GymPlan, ProgressEntry, Snapshot } from '../domain/types';
import { installCameraMock } from '../test/camera';
import { GymPage } from './GymPage';

const snapshot = {
  serverTime: '',
  user: { id: 'u', email: 'owner@example.com', timezone: 'Asia/Kolkata', enabledAreas: ['fitness'], onboardingStep: null, displayName: '', appearance: 'system', gardenSeason: 'dawn', voice: 'gentle', focusWindow: 'learn', celebration: 'full' },
  tasks: [], completions: [], goals: [], milestones: [], progressEntries: [], checkins: [], activities: [], proofs: [],
} satisfies Snapshot;

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
afterEach(() => { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined }); });

test('saves the current position as a synced workout place', async () => {
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (success: PositionCallback) => success({ coords: { latitude: 12.9716, longitude: 77.5946 } } as GeolocationPosition) } });
  const onSaveContext = vi.fn().mockResolvedValue(undefined);
  render(<GymPage snapshot={withPlan({})} mutate={vi.fn()} onSaveContext={onSaveContext} today={new Date('2026-08-10T10:00:00+05:30')} />);

  await userEvent.type(screen.getByLabelText('Place name'), 'Morning gym');
  await userEvent.selectOptions(screen.getByLabelText('Arrival radius'), '500');
  await userEvent.click(screen.getByRole('button', { name: 'Save current location' }));

  await waitFor(() => expect(onSaveContext).toHaveBeenCalledWith(expect.objectContaining({ contextualAmbience: false, gymPlaces: [expect.objectContaining({ id: expect.any(String), name: 'Morning gym', latitude: 12.9716, longitude: 77.5946, radiusMeters: 500 })] })));
});

test('keeps global weather settings out of Gym and removes only the chosen workout place', async () => {
  const onSaveContext = vi.fn().mockResolvedValue(undefined);
  const located = withPlan({});
  located.user.contextualAmbience = true;
  located.user.gymPlaces = [
    { id: '11111111-1111-4111-8111-111111111111', name: 'Morning gym', latitude: 12.9, longitude: 77.5, radiusMeters: 250 },
    { id: '22222222-2222-4222-8222-222222222222', name: 'Evening studio', latitude: 12.8, longitude: 77.6, radiusMeters: 300 },
  ];
  render(<GymPage snapshot={located} mutate={vi.fn()} onSaveContext={onSaveContext} today={new Date('2026-08-10T10:00:00+05:30')} />);

  expect(screen.queryByLabelText('Use local weather ambience')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Remove Morning gym' }));
  expect(onSaveContext).toHaveBeenLastCalledWith(expect.objectContaining({ contextualAmbience: true, gymPlaces: [expect.objectContaining({ name: 'Evening studio' })] }));
});

test('explains a denied workout-place permission without losing the form', async () => {
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => error({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }) } });
  render(<GymPage snapshot={withPlan({})} mutate={vi.fn()} onSaveContext={vi.fn()} today={new Date('2026-08-10T10:00:00+05:30')} />);
  await userEvent.type(screen.getByLabelText('Place name'), 'Morning gym');
  await userEvent.click(screen.getByRole('button', { name: 'Save current location' }));
  expect(await screen.findByText('Location is off. Allow it for Tidemark, then try again.')).toBeVisible();
  expect(screen.getByDisplayValue('Morning gym')).toBeVisible();
});

test('opens the active workout from a one-shot nearby start request', async () => {
  const handled = vi.fn();
  render(<GymPage snapshot={withPlan({})} mutate={vi.fn()} startRequested onStartRequestHandled={handled} today={new Date('2026-08-10T10:00:00+05:30')} />);
  expect(await screen.findByText('Active workout')).toBeVisible();
  expect(handled).toHaveBeenCalledTimes(1);
});

test('submits the selected guided plan and weekday schedule', async () => {
  const mutate = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(<GymPage snapshot={snapshot} mutate={mutate} today={new Date('2026-08-10T10:00:00+05:30')} />);

  await user.click(screen.getByRole('button', { name: 'Set up my gym' }));
  await user.click(screen.getByRole('radio', { name: 'Workout consistency' }));
  await user.click(screen.getByRole('radio', { name: 'Fixed rest' }));
  await user.click(screen.getByRole('checkbox', { name: 'Rest Saturday' }));
  await user.click(screen.getByRole('checkbox', { name: 'Train Monday' }));
  await user.click(screen.getByRole('checkbox', { name: 'Train Wednesday' }));
  await user.click(screen.getByRole('checkbox', { name: 'Train Friday' }));
  await user.click(screen.getByRole('button', { name: 'Create gym plan' }));

  expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
    method: 'POST',
    path: '/gym/plans',
    body: expect.objectContaining({
      goalType: 'workout_consistency',
      fixedRestWeekdays: [6],
      trainingWeekdays: [1, 3, 5],
    }),
  }));
});

test('renders the seven-day state and the calm rest actions', () => {
  render(<GymPage snapshot={withPlan({ fixedRestWeekdays: [6], trainingWeekdays: [1, 3, 5] })} mutate={vi.fn()} today={new Date('2026-08-08T10:00:00+05:30')} />);

  expect(screen.getAllByRole('listitem', { name: /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/ })).toHaveLength(7);
  expect(screen.getByText('Planned rest')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Train anyway' })).toBeVisible();
});

test('offers a flexible rest without hiding the scheduled workout action', () => {
  render(<GymPage snapshot={withPlan({ restMode: 'flexible', trainingWeekdays: [1, 3, 5] })} mutate={vi.fn()} today={new Date('2026-08-12T10:00:00+05:30')} />);

  expect(screen.getByRole('button', { name: 'Start workout' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Make today a rest day' })).toBeVisible();
});

test('reports the exhausted allowance on a flexible rest day', () => {
  const flexibleRest = withPlan({ restMode: 'flexible', flexibleRestAllowance: 1 });
  flexibleRest.gym!.restEvents = [{ id: 'rest', date: '2026-08-12', kind: 'flexible' }];
  render(<GymPage snapshot={flexibleRest} mutate={vi.fn()} today={new Date('2026-08-12T10:00:00+05:30')} />);

  expect(screen.getByRole('heading', { name: 'Planned rest' })).toBeVisible();
  expect(screen.getByText('0 flexible rests left')).toBeVisible();
});

test('settles one pending Streak Anchor only once across navigation remounts', async () => {
  const mutate = vi.fn().mockResolvedValue(undefined);
  const safeSnapshot = pendingSafeSnapshot();
  const view = render(<GymPage snapshot={safeSnapshot} mutate={mutate} today={new Date('2026-08-08T10:00:00+05:30')} />);

  await waitFor(() => expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ path: '/gym/streak/settle', body: { missedDate: '2026-08-07' } })));
  view.unmount();
  render(<GymPage snapshot={safeSnapshot} mutate={mutate} today={new Date('2026-08-08T10:00:00+05:30')} />);
  expect(mutate).toHaveBeenCalledTimes(1);
});

test('retries Anchor settlement after a genuine mutation failure', async () => {
  const mutate = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  const first = render(<GymPage snapshot={pendingSafeSnapshot()} mutate={mutate} today={new Date('2026-08-08T10:00:00+05:30')} />);

  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  first.unmount();
  render(<GymPage snapshot={pendingSafeSnapshot()} mutate={mutate} today={new Date('2026-08-08T10:00:00+05:30')} />);
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2));
});

test('clears the persisted Anchor marker after the authoritative snapshot settles it', async () => {
  const mutate = vi.fn().mockResolvedValue(undefined);
  const first = render(<GymPage snapshot={pendingSafeSnapshot()} mutate={mutate} today={new Date('2026-08-08T10:00:00+05:30')} />);
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  const settled = pendingSafeSnapshot();
  settled.gym!.safe = { scope: 'gym', stored: 0, qualifyingCount: 0, lastProtectedDate: '2026-08-07' };
  first.rerender(<GymPage snapshot={settled} mutate={mutate} today={new Date('2026-08-08T10:00:00+05:30')} />);
  first.unmount();

  render(<GymPage snapshot={pendingSafeSnapshot()} mutate={mutate} today={new Date('2026-08-08T10:00:00+05:30')} />);
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2));
});

test('builds and reorders a Full body routine before saving it', async () => {
  const mutate = vi.fn().mockResolvedValue(undefined);
  render(<GymPage snapshot={withPlan({})} mutate={mutate} today={new Date('2026-08-10T10:00:00+05:30')} />);
  await userEvent.click(screen.getByRole('button', { name: 'Create routine' }));
  await userEvent.click(screen.getByRole('button', { name: 'Full body' }));

  expect(screen.getByDisplayValue('Squat')).toBeVisible();
  expect(screen.getByDisplayValue('Bench press')).toBeVisible();
  expect(screen.getByDisplayValue('Row')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Move Squat down' }));
  expect(screen.getAllByLabelText('Exercise name').map(input => (input as HTMLInputElement).value)).toEqual(['Bench press', 'Squat', 'Row']);
  const squatSets = screen.getByRole('list', { name: 'Squat sets' });
  expect(squatSets).toHaveTextContent('Warm-up');
  await userEvent.click(screen.getByRole('button', { name: 'Move Squat warm-up down' }));
  expect(Array.from(squatSets.querySelectorAll('.routine-set-kind')).map(node => node.textContent)).toEqual(['Working set', 'Warm-up']);
  await userEvent.click(screen.getByRole('button', { name: 'Save routine' }));

  expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', path: '/gym/routines', body: expect.objectContaining({ name: 'Full body', template: 'full_body', position: 0, active: true, exercises: expect.any(Array) }) }));
});

test('adds, edits, classifies, and removes routine exercises and sets', async () => {
  const mutate = vi.fn().mockResolvedValue(undefined);
  render(<GymPage snapshot={withPlan({})} mutate={mutate} today={new Date('2026-08-10T10:00:00+05:30')} />);
  await userEvent.click(screen.getByRole('button', { name: 'Create routine' }));
  await userEvent.click(screen.getByRole('button', { name: 'Full body' }));

  await userEvent.click(screen.getByRole('button', { name: 'Add exercise' }));
  const names = screen.getAllByLabelText('Exercise name');
  await userEvent.clear(names[3]);
  await userEvent.type(names[3], 'Deadlift');
  await userEvent.click(screen.getByRole('button', { name: 'Remove Row' }));
  expect(screen.queryByDisplayValue('Row')).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Add Squat set' }));
  await userEvent.click(screen.getByRole('button', { name: 'Remove Squat set 2' }));
  await userEvent.clear(screen.getByLabelText('Squat set 2 reps'));
  await userEvent.type(screen.getByLabelText('Squat set 2 reps'), '3');
  await userEvent.clear(screen.getByLabelText('Squat set 2 load'));
  await userEvent.type(screen.getByLabelText('Squat set 2 load'), '95.5');
  await userEvent.type(screen.getByLabelText('Squat set 2 RPE'), '9');
  await userEvent.selectOptions(screen.getByLabelText('Squat set 1 classification'), 'working');
  expect(Array.from(screen.getByRole('list', { name: 'Squat sets' }).querySelectorAll('.routine-set-kind')).map(node => node.textContent)).toEqual(['Working set', 'Working set']);

  await userEvent.click(screen.getByRole('button', { name: 'Save routine' }));
  const body = mutate.mock.calls[0]![0].body as { exercises: Array<{ name: string; sets: Array<{ reps: number; load: number; warmup: boolean; rpe: number | null }> }> };
  expect(body.exercises.map(exercise => exercise.name)).toEqual(['Squat', 'Bench press', 'Deadlift']);
  expect(body.exercises[0].sets).toEqual([
    expect.objectContaining({ warmup: false }),
    expect.objectContaining({ reps: 3, load: 95.5, warmup: false, rpe: 9 }),
  ]);
});

test('prefills the last performed sets and restores edits after a remount', async () => {
  const gymSnapshot = withRoutine();
  gymSnapshot.progressEntries = [workoutEntry([{ exercise: 'Squat', reps: 6, load: 42, warmup: false, rpe: 8 }])];
  const first = render(<GymPage snapshot={gymSnapshot} mutate={vi.fn()} addProof={vi.fn()} today={new Date('2026-08-10T10:00:00+05:30')} />);
  await userEvent.click(screen.getByRole('button', { name: 'Start workout' }));
  expect(screen.getByLabelText('Squat set 1 load')).toHaveValue(42);
  const reps = screen.getByLabelText('Squat set 1 reps');
  await userEvent.clear(reps);
  await userEvent.type(reps, '9');
  expect(JSON.parse(localStorage.getItem('tidemark-active-workout:u') ?? '{}').draft.sets[0].reps).toBe(9);
  first.unmount();

  render(<GymPage snapshot={gymSnapshot} mutate={vi.fn()} addProof={vi.fn()} today={new Date('2026-08-10T10:00:00+05:30')} />);
  expect(screen.getByRole('heading', { name: 'Full body workout' })).toBeVisible();
  expect(screen.getByLabelText('Squat set 1 reps')).toHaveValue(9);
});

test('does not restore another user or a legacy unscoped active workout', async () => {
  const first = render(<GymPage snapshot={withUser(withRoutine(), 'user-a')} mutate={vi.fn()} addProof={vi.fn()} today={new Date('2026-08-10T10:00:00+05:30')} />);
  await userEvent.click(screen.getByRole('button', { name: 'Start workout' }));
  const reps = screen.getByLabelText('Squat set 1 reps');
  await userEvent.clear(reps);
  await userEvent.type(reps, '11');
  const userADraft = localStorage.getItem('tidemark-active-workout:user-a');
  expect(userADraft).not.toBeNull();
  first.unmount();

  localStorage.setItem('tidemark-active-workout', userADraft!);
  render(<GymPage snapshot={withUser(withRoutine(), 'user-b')} mutate={vi.fn()} addProof={vi.fn()} today={new Date('2026-08-10T10:00:00+05:30')} />);

  expect(screen.getByRole('button', { name: 'Start workout' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Full body workout' })).not.toBeInTheDocument();
  expect(localStorage.getItem('tidemark-active-workout')).toBeNull();
  expect(localStorage.getItem('tidemark-active-workout:user-a')).toBe(userADraft);
});

test('finishes only after a working set and confirmed live proof, with entry before proof', async () => {
  installCameraMock();
  const calls: string[] = [];
  const mutate = vi.fn(async (_input: { body?: unknown }) => { calls.push('entry'); });
  const addProof = vi.fn(async () => { calls.push('proof'); });
  const gymSnapshot = withRoutine(true);
  render(<GymPage snapshot={gymSnapshot} mutate={mutate} addProof={addProof} today={new Date('2026-08-10T10:00:00+05:30')} />);
  await userEvent.click(screen.getByRole('button', { name: 'Start workout' }));
  const startedAt = JSON.parse(localStorage.getItem('tidemark-active-workout:u')!).startedAt as string;
  const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse(startedAt) + 44 * 60_000 + 1);
  const finish = screen.getByRole('button', { name: 'Finish with proof' });
  expect(finish).toBeDisabled();
  await userEvent.click(await screen.findByRole('button', { name: 'Capture' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Save photo' }));
  expect(finish).toBeDisabled();
  await userEvent.click(screen.getByLabelText('Working set'));
  expect(finish).toBeEnabled();
  await userEvent.click(finish);

  await waitFor(() => expect(addProof).toHaveBeenCalledOnce());
  const body = mutate.mock.calls[0]![0].body as Record<string, unknown>;
  expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', path: '/gym/workouts', body: expect.objectContaining({ id: expect.any(String), goalId: 'g', durationMinutes: 45, sets: [expect.objectContaining({ exercise: 'Squat', warmup: false })] }) }));
  expect(addProof).toHaveBeenCalledWith(expect.objectContaining({ ownerType: 'progress', ownerId: body.id, photo: expect.objectContaining({ type: 'image/webp' }) }));
  expect(calls).toEqual(['entry', 'proof']);
  expect(localStorage.getItem('tidemark-active-workout:u')).toBeNull();
  now.mockRestore();
});

test('retries a partial finish with the same persisted workout id', async () => {
  installCameraMock();
  const mutate = vi.fn().mockResolvedValue(undefined);
  const addProof = vi.fn().mockRejectedValueOnce(new Error('Proof storage failed')).mockResolvedValue(undefined);
  render(<GymPage snapshot={withRoutine()} mutate={mutate} addProof={addProof} today={new Date('2026-08-10T10:00:00+05:30')} />);
  await userEvent.click(screen.getByRole('button', { name: 'Start workout' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Capture' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Save photo' }));
  await userEvent.click(screen.getByRole('button', { name: 'Finish with proof' }));
  expect(await screen.findByText('Proof storage failed')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Finish with proof' }));
  await waitFor(() => expect(addProof).toHaveBeenCalledTimes(2));
  expect(mutate).toHaveBeenCalledOnce();
  const entryId = (mutate.mock.calls[0]![0].body as { id: string }).id;
  expect(addProof.mock.calls.map(call => call[0].ownerId)).toEqual([entryId, entryId]);
  expect(localStorage.getItem('tidemark-active-workout:u')).toBeNull();
});

test('retaking proof disables workout finish until the new frame is saved', async () => {
  installCameraMock();
  render(<GymPage snapshot={withRoutine()} mutate={vi.fn()} addProof={vi.fn()} today={new Date('2026-08-10T10:00:00+05:30')} />);
  await userEvent.click(screen.getByRole('button', { name: 'Start workout' }));
  const finish = screen.getByRole('button', { name: 'Finish with proof' });
  await userEvent.click(await screen.findByRole('button', { name: 'Capture' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save photo' }));
  expect(finish).toBeEnabled();
  await userEvent.click(screen.getByRole('button', { name: 'Retake' }));
  expect(finish).toBeDisabled();
});

test('shows working-set records and opens the recent authenticated proof', async () => {
  const gymSnapshot = withPlan({ weightUnit: 'kg' });
  gymSnapshot.progressEntries = [workoutEntry([
    { exercise: 'Bench press', reps: 5, load: 80, warmup: true, rpe: null },
    { exercise: 'Bench press', reps: 8, load: 70, warmup: false, rpe: 8 },
  ])];
  gymSnapshot.proofs = [{ id: 'proof', ownerType: 'progress', ownerId: 'previous', imageUrl: '/api/proofs/proof/image', createdAt: '2026-08-08T06:41:00Z', selectedForRecap: false }];
  render(<GymPage snapshot={gymSnapshot} mutate={vi.fn()} today={new Date('2026-08-10T10:00:00+05:30')} />);

  expect(screen.getByRole('region', { name: 'Progress harbor' })).toHaveTextContent('Bench press');
  expect(screen.getByText('70 kg × 8')).toBeVisible();
  expect(screen.queryByText(/80 kg/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Open proof from Full body workout' }));
  expect(screen.getByRole('img', { name: 'Workout proof' })).toHaveAttribute('src', '/api/proofs/proof/image');
});

test('opens every saved physique angle from the progress harbor', async () => {
  const gymSnapshot = withPlan({});
  gymSnapshot.goals = [gymGoal('physique', { direction: 'recomposition', checkinCadence: 'weekly' })];
  gymSnapshot.progressEntries = [physiqueEntry('checkin')];
  gymSnapshot.proofs = [
    { id: 'back-proof', ownerType: 'progress', ownerId: 'checkin', imageUrl: '/api/proofs/back/image', createdAt: '2026-08-08T06:03:00Z', selectedForRecap: false },
    { id: 'side-proof', ownerType: 'progress', ownerId: 'checkin', imageUrl: '/api/proofs/side/image', createdAt: '2026-08-08T06:02:00Z', selectedForRecap: false },
    { id: 'front-proof', ownerType: 'progress', ownerId: 'checkin', imageUrl: '/api/proofs/front/image', createdAt: '2026-08-08T06:01:00Z', selectedForRecap: false },
  ];
  render(<GymPage snapshot={gymSnapshot} mutate={vi.fn()} today={new Date('2026-08-10T10:00:00+05:30')} />);

  expect(screen.getByRole('heading', { name: 'Physique check-ins' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Open front view from physique check-in' }));
  expect(screen.getByRole('img', { name: 'Front physique check-in' })).toHaveAttribute('src', '/api/proofs/front/image');
  await userEvent.click(screen.getByRole('button', { name: 'Close Physique check-in' }));
  await userEvent.click(screen.getByRole('button', { name: 'Open side view from physique check-in' }));
  expect(screen.getByRole('img', { name: 'Side physique check-in' })).toHaveAttribute('src', '/api/proofs/side/image');
  await userEvent.click(screen.getByRole('button', { name: 'Close Physique check-in' }));
  await userEvent.click(screen.getByRole('button', { name: 'Open back view from physique check-in' }));
  expect(screen.getByRole('img', { name: 'Back physique check-in' })).toHaveAttribute('src', '/api/proofs/back/image');
});

test('confirms before deleting a workout through the Gym endpoint', async () => {
  const mutate = vi.fn().mockResolvedValue(undefined);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  const gymSnapshot = withPlan({});
  gymSnapshot.progressEntries = [workoutEntry([{ exercise: 'Squat', reps: 5, load: 70, warmup: false, rpe: null }])];
  render(<GymPage snapshot={gymSnapshot} mutate={mutate} today={new Date('2026-08-10T10:00:00+05:30')} />);

  await userEvent.click(screen.getByRole('button', { name: 'Delete Full body workout' }));
  expect(confirm).toHaveBeenCalledWith('Delete this workout and its proof?');
  expect(mutate).toHaveBeenCalledWith({ method: 'DELETE', path: '/gym/workouts/previous' });
  confirm.mockRestore();
});

test('summarises one measurement trend and saves metric value and unit details', async () => {
  const mutate = vi.fn().mockResolvedValue(undefined);
  const gymSnapshot = withPlan({ weightUnit: 'kg' });
  gymSnapshot.goals = [gymGoal('body_measurements', { metrics: ['weight', 'waist'], weightUnit: 'kg', measurementUnit: 'cm', checkinCadence: 'weekly' })];
  gymSnapshot.progressEntries = [measurementEntry('m1', 'weight', 80, 'kg', '2026-08-01T06:00:00Z'), measurementEntry('m2', 'weight', 78, 'kg', '2026-08-08T06:00:00Z')];
  render(<GymPage snapshot={gymSnapshot} mutate={mutate} today={new Date('2026-08-10T10:00:00+05:30')} />);

  expect(screen.getByText('First 80 kg · Latest 78 kg · Change -2 kg')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Log measurement' }));
  await userEvent.clear(screen.getByLabelText('Measurement value'));
  await userEvent.type(screen.getByLabelText('Measurement value'), '77');
  await userEvent.click(screen.getByRole('button', { name: 'Save measurement' }));

  expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', path: '/goals/goal-body_measurements/entries', body: expect.objectContaining({ id: expect.any(String), entryType: 'measurement', metric: 'weight', value: 77, details: { unit: 'kg' } }) }));
});

test('creates a physique entry before attaching sequential live-camera views to the same owner', async () => {
  installCameraMock();
  const calls: string[] = [];
  const mutate = vi.fn(async (_input: { body?: unknown }) => { calls.push('entry'); });
  const addProof = vi.fn(async (_input: { ownerId: string; filename?: string }) => { calls.push('proof'); });
  const gymSnapshot = withPlan({});
  gymSnapshot.goals = [gymGoal('physique', { direction: 'recomposition', checkinCadence: 'weekly' })];
  render(<GymPage snapshot={gymSnapshot} mutate={mutate} addProof={addProof} today={new Date('2026-08-10T10:00:00+05:30')} />);

  await userEvent.click(screen.getByRole('button', { name: 'Add physique check-in' }));
  expect(screen.getByRole('button', { name: 'Front view' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(await screen.findByRole('button', { name: 'Capture' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save photo' }));
  expect(screen.getByRole('button', { name: 'Side view' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(await screen.findByRole('button', { name: 'Capture' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save photo' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save physique check-in' }));

  await waitFor(() => expect(addProof).toHaveBeenCalledTimes(2));
  const entryId = (mutate.mock.calls[0]![0].body as { id: string }).id;
  expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ path: '/goals/goal-physique/entries', body: expect.objectContaining({ id: entryId, entryType: 'physique_checkin', details: { photoAngles: ['front', 'side'] } }) }));
  expect(addProof.mock.calls.map(call => ({ ownerId: call[0].ownerId, filename: call[0].filename }))).toEqual([{ ownerId: entryId, filename: 'front.webp' }, { ownerId: entryId, filename: 'side.webp' }]);
  expect(calls).toEqual(['entry', 'proof', 'proof']);
  expect(document.querySelector('input[type="file"]')).toBeNull();
});

test('does not create a physique entry when captured proof cannot be saved', async () => {
  installCameraMock();
  const mutate = vi.fn().mockResolvedValue(undefined);
  const gymSnapshot = withPlan({});
  gymSnapshot.goals = [gymGoal('physique', { direction: 'recomposition', checkinCadence: 'weekly' })];
  render(<GymPage snapshot={gymSnapshot} mutate={mutate} today={new Date('2026-08-10T10:00:00+05:30')} />);

  await userEvent.click(screen.getByRole('button', { name: 'Add physique check-in' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Capture' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save photo' }));

  expect(screen.getByText('Proof saving is unavailable.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Save physique check-in' })).toBeDisabled();
  expect(mutate).not.toHaveBeenCalled();
});

test('resumes a failed physique upload with one entry and only the unfinished angle', async () => {
  installCameraMock();
  const mutate = vi.fn().mockResolvedValue(undefined);
  const addProof = vi.fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('Proof storage failed'))
    .mockResolvedValueOnce(undefined);
  const gymSnapshot = withPlan({});
  gymSnapshot.goals = [gymGoal('physique', { direction: 'recomposition', checkinCadence: 'weekly' })];
  render(<GymPage snapshot={gymSnapshot} mutate={mutate} addProof={addProof} today={new Date('2026-08-10T10:00:00+05:30')} />);

  await userEvent.click(screen.getByRole('button', { name: 'Add physique check-in' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Capture' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save photo' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Capture' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save photo' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save physique check-in' }));

  expect(await screen.findByText('Proof storage failed')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Save physique check-in' }));
  await waitFor(() => expect(addProof).toHaveBeenCalledTimes(3));

  expect(mutate).toHaveBeenCalledOnce();
  const entryId = (mutate.mock.calls[0]![0].body as { id: string }).id;
  expect(addProof.mock.calls.map(call => ({ ownerId: call[0].ownerId, filename: call[0].filename }))).toEqual([
    { ownerId: entryId, filename: 'front.webp' },
    { ownerId: entryId, filename: 'side.webp' },
    { ownerId: entryId, filename: 'side.webp' },
  ]);
});

test('creates another guided goal from the progress harbor through the Gym endpoint', async () => {
  const mutate = vi.fn().mockResolvedValue(undefined);
  render(<GymPage snapshot={withPlan({})} mutate={mutate} today={new Date('2026-08-10T10:00:00+05:30')} />);
  await userEvent.click(screen.getByRole('button', { name: 'Add gym goal' }));
  await userEvent.click(screen.getByRole('radio', { name: 'Workout consistency' }));
  await userEvent.click(screen.getByRole('button', { name: 'Create gym goal' }));
  expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', path: '/gym/goals', body: expect.objectContaining({ id: expect.any(String), gymType: 'workout_consistency', settings: expect.objectContaining({ weeklySessionTarget: 3 }) }) }));
});

test('labels the plan goal and leaves it without a removal action', () => {
  const gymSnapshot = withPlan({});
  gymSnapshot.goals = [{ ...gymGoal('physique', { direction: 'recomposition', checkinCadence: 'weekly' }), id: 'g', title: 'Plan physique' }];

  render(<GymPage snapshot={gymSnapshot} mutate={vi.fn()} today={new Date('2026-08-10T10:00:00+05:30')} />);

  expect(screen.getByText('Gym plan goal')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Remove Plan physique' })).not.toBeInTheDocument();
});

test('removes an empty unprotected guided goal after confirmation', async () => {
  const mutate = vi.fn().mockResolvedValue(undefined);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  const gymSnapshot = withPlan({});
  gymSnapshot.goals = [{ ...gymGoal('physique', { direction: 'recomposition', checkinCadence: 'weekly' }), id: 'extra', title: 'Extra physique' }];

  render(<GymPage snapshot={gymSnapshot} mutate={mutate} today={new Date('2026-08-10T10:00:00+05:30')} />);
  await userEvent.click(screen.getByRole('button', { name: 'Remove Extra physique' }));

  expect(confirm).toHaveBeenCalledWith('Remove Extra physique?');
  expect(mutate).toHaveBeenCalledWith({ method: 'DELETE', path: '/goals/extra' });
  confirm.mockRestore();
});

test('submits an empty guided goal removal once and keeps it pending until sync removes it', async () => {
  let resolve!: () => void;
  const mutate = vi.fn(() => new Promise<void>(done => { resolve = done; }));
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  const gymSnapshot = withPlan({});
  gymSnapshot.goals = [{ ...gymGoal('physique', { direction: 'recomposition', checkinCadence: 'weekly' }), id: 'extra', title: 'Extra physique' }];

  render(<GymPage snapshot={gymSnapshot} mutate={mutate} today={new Date('2026-08-10T10:00:00+05:30')} />);
  const remove = screen.getByRole('button', { name: 'Remove Extra physique' });
  await userEvent.click(remove);
  await userEvent.click(remove);
  expect(mutate).toHaveBeenCalledOnce();
  expect(remove).toBeDisabled();

  resolve();
  await waitFor(() => expect(remove).toBeDisabled());
  confirm.mockRestore();
});

test('shows a guided goal removal error and allows a retry', async () => {
  const mutate = vi.fn().mockRejectedValueOnce(new Error('Goal cannot be removed')).mockResolvedValue(undefined);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  const gymSnapshot = withPlan({});
  gymSnapshot.goals = [{ ...gymGoal('physique', { direction: 'recomposition', checkinCadence: 'weekly' }), id: 'extra', title: 'Extra physique' }];

  render(<GymPage snapshot={gymSnapshot} mutate={mutate} today={new Date('2026-08-10T10:00:00+05:30')} />);
  const remove = screen.getByRole('button', { name: 'Remove Extra physique' });
  await userEvent.click(remove);
  expect(await screen.findByRole('alert')).toHaveTextContent('Goal cannot be removed');
  expect(remove).toBeEnabled();

  await userEvent.click(remove);
  expect(mutate).toHaveBeenCalledTimes(2);
  confirm.mockRestore();
});

test('marks already-added guided types unavailable in the add-goal form', async () => {
  const gymSnapshot = withPlan({});
  gymSnapshot.goals = [{ ...gymGoal('workout_consistency', { weeklySessionTarget: 3, scheduleMode: 'flexible', trainingWeekdays: [] }), id: 'g', title: 'Train steadily' }];

  render(<GymPage snapshot={gymSnapshot} mutate={vi.fn()} today={new Date('2026-08-10T10:00:00+05:30')} />);
  await userEvent.click(screen.getByRole('button', { name: 'Add gym goal' }));

  expect(screen.getByRole('radio', { name: 'Workout consistency' })).toBeDisabled();
  expect(screen.getByText('Already added')).toBeVisible();
});

function withPlan(overrides: Partial<GymPlan>): Snapshot {
  return {
    ...snapshot,
    gym: {
      plans: [{ id: 'p', primaryGoalId: 'g', restMode: 'fixed', fixedRestWeekdays: [], flexibleRestAllowance: 1, trainingWeekdays: [1, 3, 5], weeklySessionTarget: 3, weightUnit: 'kg', measurementUnit: 'cm', effectiveFrom: '2026-08-01', effectiveTo: null, ...overrides }],
      routines: [], restEvents: [], safe: { scope: 'gym', stored: 0, qualifyingCount: 0, lastProtectedDate: null },
    },
  };
}

function pendingSafeSnapshot(): Snapshot {
  const completedWorkout: ProgressEntry = { id: 'w', goalId: 'g', area: 'fitness', entryType: 'workout', metric: 'workout', value: 1, durationMinutes: 45, details: {}, note: '', occurrenceAt: '2026-08-06T06:45:00+05:30', status: 'complete', createdAt: '2026-08-06T06:45:00+05:30' };
  const safeSnapshot = withPlan({ trainingWeekdays: [0, 1, 2, 3, 4, 5, 6] });
  safeSnapshot.progressEntries = [completedWorkout];
  safeSnapshot.gym!.safe = { scope: 'gym', stored: 1, qualifyingCount: 0, lastProtectedDate: null };
  return safeSnapshot;
}

function withRoutine(warmup = false): Snapshot {
  const value = withPlan({});
  value.gym!.routines = [{ id: 'routine', name: 'Full body', template: 'full_body', position: 0, active: true, createdAt: '', updatedAt: '', exercises: [{ id: 'squat', name: 'Squat', sets: [{ reps: 5, load: 20, warmup, rpe: null }] }] }];
  return value;
}

function withUser(value: Snapshot, id: string): Snapshot {
  return { ...value, user: { ...value.user, id } };
}

function workoutEntry(sets: Array<{ exercise: string; reps: number; load: number; warmup: boolean; rpe: number | null }>): ProgressEntry {
  return { id: 'previous', goalId: 'g', area: 'fitness', entryType: 'workout', metric: 'workout', value: 1, durationMinutes: 40, details: { routineId: 'routine', routineName: 'Full body', sets, startedAt: '2026-08-08T06:00:00Z', plannedState: 'training' }, note: '', occurrenceAt: '2026-08-08T06:40:00Z', status: 'complete', createdAt: '2026-08-08T06:40:00Z' };
}

function gymGoal(type: GymGoalType, settings: Record<string, unknown>): Goal {
  return { id: `goal-${type}`, title: type, description: '', area: 'fitness', trackingType: 'count', targetValue: 1, currentValue: 0, unit: '', deadline: null, color: '#69C9A5', status: 'active', gymType: type, gymSettings: settings, createdAt: '', updatedAt: '' };
}

function measurementEntry(id: string, metric: string, value: number, unit: string, occurrenceAt: string): ProgressEntry {
  return { id, goalId: 'goal-body_measurements', area: 'fitness', entryType: 'measurement', metric, value, durationMinutes: null, details: { unit }, note: '', occurrenceAt, status: 'complete', createdAt: occurrenceAt };
}

function physiqueEntry(id: string): ProgressEntry {
  return { id, goalId: 'goal-physique', area: 'fitness', entryType: 'physique_checkin', metric: 'physique', value: 1, durationMinutes: null, details: { photoAngles: ['front', 'side', 'back'] }, note: '', occurrenceAt: '2026-08-08T06:04:00Z', status: 'complete', createdAt: '2026-08-08T06:04:00Z' };
}
