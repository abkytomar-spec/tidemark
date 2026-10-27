import { LocalClient } from './local';
import type { QueuedMutation } from './offline';
import { dateKey } from '../domain/schedule';

const today = dateKey(new Date());
let name: string;
let client: LocalClient;

beforeEach(() => { name = `tidemark-local-test-${crypto.randomUUID()}`; client = new LocalClient(name); });
afterEach(async () => client.close());

function send(method: QueuedMutation['method'], path: string, body?: unknown, id: string = crypto.randomUUID(), target = client) {
  return target.mutate({ id, method, path, body, createdAt: new Date().toISOString() }) as Promise<Record<string, unknown>>;
}
const webp = () => new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46, 6, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0])], { type: 'image/webp' });
const proof = (ownerType: 'task_occurrence' | 'progress' | 'daily_moment', ownerId: string, caption?: string) => client.uploadProof({ ownerType, ownerId, photo: webp(), mutationId: crypto.randomUUID(), caption });
const task = (extra: Record<string, unknown> = {}) => ({ id: crypto.randomUUID(), title: 'Read 10 pages', scheduleDate: today, priority: 'high', recurrence: { type: 'one_time' }, ...extra });

test('a new visitor gets one local owner who starts onboarding', async () => {
  expect(await client.getSetupStatus()).toEqual({ setupRequired: false });
  const first = await client.getSession();
  expect(first.user).toEqual(expect.objectContaining({ onboardingStep: 'areas', enabledAreas: ['fitness', 'learning', 'work', 'wellbeing'], appearance: 'system' }));
  expect((await client.getSession()).user.id).toBe(first.user.id);
  expect(await client.logout()).toEqual({ ok: true });
});

test('a task completes for points, qualifies the Streak Anchor, and reopens', async () => {
  const body = task();
  expect(await send('POST', '/tasks', body)).toEqual(expect.objectContaining({ id: body.id, title: 'Read 10 pages', color: '#5B8DEF', proofRequired: false }));
  expect(await send('POST', `/tasks/${body.id}/complete`, { date: today })).toEqual(expect.objectContaining({ status: 'complete', points: 20 }));
  let snapshot = await client.sync();
  expect(snapshot.completions).toEqual([expect.objectContaining({ taskId: body.id, occurrenceDate: today, status: 'complete' })]);
  expect(snapshot.globalSafe?.qualifyingCount).toBe(1);
  expect(snapshot.activities.map(item => item.type)).toEqual(['task_completed', 'task_created']);

  await send('DELETE', `/tasks/${body.id}/completions/${today}`);
  snapshot = await client.sync();
  expect(snapshot.completions).toEqual([]);
  expect(snapshot.globalSafe?.qualifyingCount).toBe(0);
  await expect(send('DELETE', `/tasks/${body.id}/completions/${today}`)).rejects.toMatchObject({ status: 404, message: 'Completion not found.' });
  await expect(send('POST', `/tasks/${body.id}/complete`, { date: '2001-01-01' })).rejects.toMatchObject({ status: 422, message: 'This task is not scheduled for that date.' });
});

test('a proof-required completion stays pending until its photo arrives', async () => {
  const body = task({ proofRequired: true });
  await send('POST', '/tasks', body);
  expect(await send('POST', `/tasks/${body.id}/complete`, { date: today })).toEqual(expect.objectContaining({ status: 'pending_proof' }));
  expect((await client.sync()).globalSafe?.qualifyingCount).toBe(0);

  expect(await proof('task_occurrence', `${body.id}:${today}`)).toEqual(expect.objectContaining({ ownerType: 'completion', category: 'tasks' }));
  let snapshot = await client.sync();
  expect(snapshot.completions[0]).toEqual(expect.objectContaining({ status: 'complete', hasProof: true }));
  expect(snapshot.globalSafe?.qualifyingCount).toBe(1);
  expect(snapshot.proofs).toHaveLength(1);

  await send('DELETE', `/proofs/${snapshot.proofs[0].id}`);
  snapshot = await client.sync();
  expect(snapshot.completions[0].status).toBe('pending_proof');
  expect(snapshot.proofs).toEqual([]);
  await expect(client.uploadProof({ ownerType: 'task_occurrence', ownerId: `${body.id}:${today}`, photo: new Blob(['not an image']), mutationId: crypto.randomUUID() })).rejects.toMatchObject({ status: 422, message: 'Choose a JPEG, PNG, or WebP image.' });
});

test('goal entries move currentValue and workouts wait for proof', async () => {
  const goal = await send('POST', '/goals', { id: crypto.randomUUID(), title: 'Run 50 km', area: 'fitness', targetValue: 50, unit: 'km' });
  await send('POST', `/goals/${goal.id}/entries`, { value: 5, entryType: 'distance' });
  await send('POST', `/goals/${goal.id}/entries`, { value: 2.5 });
  expect((await client.sync()).goals[0].currentValue).toBe(7.5);
  await expect(send('POST', `/goals/${goal.id}/entries`, { value: -1 })).rejects.toMatchObject({ status: 422, message: 'Enter valid progress.' });

  const workout = await send('POST', `/goals/${goal.id}/entries`, { id: crypto.randomUUID(), entryType: 'workout', value: 1 });
  expect(workout.status).toBe('pending_proof');
  expect((await client.sync()).goals[0].currentValue).toBe(7.5);
  await proof('progress', String(workout.id));
  const snapshot = await client.sync();
  expect(snapshot.goals[0].currentValue).toBe(8.5);
  expect(snapshot.progressEntries.map(entry => entry.status)).toEqual(['complete', 'complete', 'complete']);
  expect(snapshot.proofs[0].category).toBe('gym');
});

test('preferences patch validates like the API and finishes onboarding', async () => {
  const user = await send('PATCH', '/preferences', { displayName: '  Sam ', onboardingStep: null, gardenSeason: 'moon', enabledAreas: ['money', 'money', 'nope'] });
  expect(user).toEqual(expect.objectContaining({ displayName: 'Sam', onboardingStep: null, gardenSeason: 'moon', enabledAreas: ['money'] }));
  await expect(send('PATCH', '/preferences', { appearance: 'neon' })).rejects.toMatchObject({ status: 422, message: 'Choose a valid appearance.' });
  await expect(send('PATCH', '/preferences', { gardenSeason: 5 })).rejects.toMatchObject({ status: 422, message: 'Choose a valid garden Season.' });
  expect((await client.sync()).user).toEqual(expect.objectContaining({ displayName: 'Sam', gardenSeason: 'moon', onboardingStep: null }));
});

test('a gym plan, routine, rest day, and proven workout follow the gym rules', async () => {
  const plan = await send('POST', '/gym/plans', { restMode: 'flexible', fixedRestWeekdays: [], flexibleRestAllowance: 1, trainingWeekdays: [1, 3, 5], weeklySessionTarget: 3, weightUnit: 'kg', measurementUnit: 'cm', effectiveFrom: today, goalType: 'workout_consistency', goalTitle: 'Train three times a week', goalSettings: {} });
  const routine = await send('POST', '/gym/routines', { id: crypto.randomUUID(), name: 'Legs', position: 0, exercises: [{ name: 'Squat', sets: [{ reps: 5, load: 100, warmup: false, rpe: null }] }] });
  await send('POST', '/gym/rest', { date: today });
  await send('DELETE', `/gym/rest/${today}`);
  await expect(send('POST', '/gym/plans', { ...plan, restMode: 'fixed', effectiveFrom: today })).rejects.toMatchObject({ status: 422 });
  await expect(send('POST', '/gym/workouts', { goalId: plan.primaryGoalId, date: today, durationMinutes: 30, sets: [{ exercise: 'Squat', reps: 5, load: 60, warmup: true }] })).rejects.toMatchObject({ status: 422, message: 'Add at least one working set.' });

  const id = crypto.randomUUID();
  await send('POST', '/gym/workouts', { id, goalId: plan.primaryGoalId, date: today, durationMinutes: 45, routineId: routine.id, routineName: 'Legs', plannedState: 'training', occurrenceAt: new Date().toISOString(), sets: [{ exercise: 'Squat', reps: 5, load: 100, warmup: false, rpe: 8 }] });
  await proof('progress', id);
  let snapshot = await client.sync();
  expect(snapshot.gym?.plans).toHaveLength(1);
  expect(snapshot.gym?.routines.map(item => item.name)).toEqual(['Legs']);
  expect(snapshot.gym?.restEvents).toEqual([]);
  expect(snapshot.gym?.safe.qualifyingCount).toBe(1);
  expect(snapshot.goals[0]).toEqual(expect.objectContaining({ gymType: 'workout_consistency', currentValue: 1 }));
  expect(snapshot.progressEntries[0].details).toEqual(expect.objectContaining({ routineId: routine.id, sets: [{ exercise: 'Squat', reps: 5, load: 100, warmup: false, rpe: 8 }] }));

  await send('DELETE', `/gym/workouts/${id}`);
  snapshot = await client.sync();
  expect(snapshot.goals[0].currentValue).toBe(0);
  expect(snapshot.gym?.safe.qualifyingCount).toBe(0);
  expect(snapshot.proofs).toEqual([]);
});

test('a Daily Snapshot is scheduled, captured with a photo, and deleted', async () => {
  await send('POST', '/daily-moment/settings', { enabled: true, windowStart: '09:00', windowEnd: '10:00', notifications: false });
  const day = (await client.sync()).dailyMoment!.today!;
  expect(day).toEqual(expect.objectContaining({ localDate: today, status: 'scheduled' }));
  await send('POST', `/daily-moment/${today}/capture`, { caption: 'Sunlight' });
  await proof('daily_moment', day.id, ' Sunlight ');
  expect((await client.sync()).proofs).toEqual([expect.objectContaining({ ownerType: 'daily_moment', category: 'daily', caption: 'Sunlight' })]);
  await send('DELETE', `/daily-moment/${today}`);
  expect((await client.sync()).proofs).toEqual([]);
});

test('data persists across clients and mutation ids are idempotent', async () => {
  const body = task();
  const mutationId = crypto.randomUUID();
  const created = await send('POST', '/tasks', body, mutationId);
  await client.close();

  const reopened = new LocalClient(name);
  expect(await send('POST', '/tasks', body, mutationId, reopened)).toEqual(created);
  const snapshot = await reopened.sync();
  expect(snapshot.tasks.map(item => item.id)).toEqual([body.id]);
  expect(snapshot.activities).toHaveLength(1);
  const backup = JSON.parse(await (await reopened.exportBackup()).text());
  expect(backup).toEqual(expect.objectContaining({ schemaVersion: 1, snapshot: expect.objectContaining({ tasks: [expect.objectContaining({ id: body.id })] }) }));
  await reopened.close();
});

test('unknown routes and invalid input fail like the API', async () => {
  await expect(send('POST', '/nowhere')).rejects.toMatchObject({ status: 404, message: 'Not found.' });
  await expect(send('POST', '/tasks', task({ scheduleDate: '2026-02-30' }))).rejects.toMatchObject({ status: 422, message: 'Choose a valid date.' });
  await expect(send('POST', '/tasks', task(), 'bad')).rejects.toMatchObject({ status: 400, message: 'A valid mutation ID is required.' });
  expect((await client.sync()).tasks).toEqual([]);
});
