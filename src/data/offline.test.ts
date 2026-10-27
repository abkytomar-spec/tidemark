import * as offline from './offline';
import { enqueue, flushQueue, queuedMutations, resetOfflineForTests } from './offline';
import type { QueuedMutation } from './offline';

beforeEach(async () => resetOfflineForTests());

test('queue replay preserves order and stops at the first network failure', async () => {
  await enqueue(mutation('first'));
  await enqueue(mutation('second'));
  const sent: string[] = [];
  await expect(flushQueue(async item => {
    sent.push(item.id);
    if (item.id === 'second') throw new TypeError('offline');
  })).rejects.toThrow('offline');
  expect(sent).toEqual(['first', 'second']);
  expect((await queuedMutations()).map(item => item.id)).toEqual(['second']);
});

test('a successful replay empties the durable queue', async () => {
  await enqueue(mutation('only'));
  await flushQueue(async () => undefined);
  expect(await queuedMutations()).toEqual([]);
});

test('an offline workout entry replays before proof for its client id', async () => {
  const ownerId = 'workout-entry-id';
  await enqueue({ id: 'entry-mutation', method: 'POST', path: '/gym/workouts', body: { id: ownerId }, createdAt: '2026-08-09T00:00:01Z' });
  await enqueue({ id: 'proof-mutation', kind: 'proof', method: 'POST', path: '/proofs', body: { ownerType: 'progress', ownerId, photo: new Blob(['proof']) }, createdAt: '2026-08-09T00:00:01Z' });
  expect((await queuedMutations()).map(item => item.id)).toEqual(['entry-mutation', 'proof-mutation']);
});

test('Daily Snapshot capture queues its record first and retains a failed proof', async () => {
  const enqueueCapture = (offline as typeof offline & { enqueueDailyMomentCapture?: (input: Record<string, unknown>) => Promise<void> }).enqueueDailyMomentCapture ?? (async () => undefined);
  await enqueueCapture({
    date: '2026-08-11', dayId: 'moment-day-id', caption: 'A small day', photo: new Blob(['proof']),
    captureMutationId: 'moment-capture', proofMutationId: 'moment-proof', createdAt: '2026-08-11T12:00:00Z',
  });

  const sent: string[] = [];
  await expect(flushQueue(async item => {
    sent.push(item.id);
    if (item.kind === 'proof') throw new TypeError('offline');
  })).rejects.toThrow('offline');

  expect(sent).toEqual(['moment-capture', 'moment-proof']);
  expect(await queuedMutations()).toEqual([expect.objectContaining({ id: 'moment-proof', kind: 'proof', body: expect.objectContaining({ ownerType: 'daily_moment', ownerId: 'moment-day-id', caption: 'A small day' }) })]);
});

function mutation(id: string): QueuedMutation {
  return { id, method: 'POST', path: '/tasks', body: { title: id }, createdAt: `2026-08-09T00:00:0${id === 'first' ? 1 : 2}Z` };
}
