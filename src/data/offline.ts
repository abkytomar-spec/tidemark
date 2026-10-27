import type { Snapshot } from '../domain/types';

export type QueuedMutation = {
  id: string;
  kind?: 'json' | 'proof';
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  createdAt: string;
  order?: number;
};

const NAME = 'tidemark-v1';
let database: IDBDatabase | null = null;
let opening: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (database) return Promise.resolve(database);
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('snapshot');
      request.result.createObjectStore('mutations', { keyPath: 'id' });
    };
    request.onsuccess = () => { database = request.result; opening = null; resolve(request.result); };
    request.onerror = () => { opening = null; reject(request.error); };
  });
  return opening;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadSnapshot(): Promise<Snapshot | null> {
  const db = await openDatabase();
  return (await requestResult(db.transaction('snapshot').objectStore('snapshot').get('current'))) ?? null;
}

export async function saveSnapshot(snapshot: Snapshot): Promise<void> {
  const db = await openDatabase();
  await requestResult(db.transaction('snapshot', 'readwrite').objectStore('snapshot').put(snapshot, 'current'));
}

export async function enqueue(mutation: QueuedMutation): Promise<void> {
  const db = await openDatabase();
  const existing = await queuedMutations();
  const order = mutation.order ?? Math.max(Date.now() * 1000, ...existing.map(item => (item.order ?? 0) + 1));
  await requestResult(db.transaction('mutations', 'readwrite').objectStore('mutations').put({ ...mutation, order }));
}

export async function enqueueDailyMomentCapture(input: { date: string; dayId: string; caption: string; photo: Blob; captureMutationId: string; proofMutationId: string; createdAt: string }): Promise<void> {
  await enqueue({ id: input.captureMutationId, method: 'POST', path: `/daily-moment/${input.date}/capture`, body: { caption: input.caption }, createdAt: input.createdAt });
  await enqueue({ id: input.proofMutationId, kind: 'proof', method: 'POST', path: '/proofs', body: { ownerType: 'daily_moment', ownerId: input.dayId, caption: input.caption, photo: input.photo }, createdAt: input.createdAt });
}

export async function queuedMutations(): Promise<QueuedMutation[]> {
  const db = await openDatabase();
  const items = await requestResult(db.transaction('mutations').objectStore('mutations').getAll()) as QueuedMutation[];
  return items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt.localeCompare(b.createdAt));
}

export async function flushQueue(sender: (mutation: QueuedMutation) => Promise<unknown>): Promise<void> {
  for (const mutation of await queuedMutations()) {
    await sender(mutation);
    const db = await openDatabase();
    await requestResult(db.transaction('mutations', 'readwrite').objectStore('mutations').delete(mutation.id));
  }
}

export async function resetOfflineForTests(): Promise<void> {
  if (opening) await opening;
  database?.close();
  database = null;
  opening = null;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB reset was blocked'));
  });
}
