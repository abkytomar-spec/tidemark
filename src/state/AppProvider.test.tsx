import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { AppProvider, useApp } from './AppProvider';
import { queuedMutations, resetOfflineForTests } from '../data/offline';
import type { Snapshot } from '../domain/types';

beforeEach(async () => {
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  await resetOfflineForTests();
});
afterEach(() => Object.defineProperty(navigator, 'onLine', { value: true, configurable: true }));

test('authenticated startup loads and caches the authoritative snapshot', async () => {
  const snapshot = sampleSnapshot();
  const client = {
    getSetupStatus: vi.fn().mockResolvedValue({ setupRequired: false }),
    getSession: vi.fn().mockResolvedValue({ user: snapshot.user, csrfToken: 'csrf' }),
    sync: vi.fn().mockResolvedValue(snapshot), setCsrf: vi.fn(), mutate: vi.fn(), uploadProof: vi.fn(),
    setup: vi.fn(), login: vi.fn(), logout: vi.fn(), exportUrl: '/api/export',
  };
  function Probe() { const app = useApp(); return <span>{app.snapshot?.user.email ?? app.syncState}</span>; }
  render(<AppProvider client={client}><Probe /></AppProvider>);
  await waitFor(() => expect(screen.getByText('owner@example.com')).toBeVisible());
  expect(client.setCsrf).toHaveBeenCalledWith('csrf');
  expect(client.sync).toHaveBeenCalledOnce();
});

test('consecutive offline optimistic mutations compose on the latest snapshot', async () => {
  const snapshot = sampleSnapshot();
  const client = {
    getSetupStatus: vi.fn().mockResolvedValue({ setupRequired: false }), getSession: vi.fn().mockResolvedValue({ user: snapshot.user, csrfToken: 'csrf' }),
    sync: vi.fn().mockResolvedValue(snapshot), setCsrf: vi.fn(), mutate: vi.fn(), uploadProof: vi.fn(), setup: vi.fn(), login: vi.fn(), logout: vi.fn(), exportUrl: '/api/export',
  };
  function Probe() {
    const app = useApp();
    const add = (message: string) => app.mutate({ method: 'POST', path: '/focus', body: { message } }, current => ({ ...current, activities: [...current.activities, { id: message, type: 'test', message, relatedType: 'test', relatedId: message, createdAt: '' }] }));
    return <button onClick={async () => { Object.defineProperty(navigator, 'onLine', { value: false, configurable: true }); await add('first'); await add('second'); }}>{app.snapshot?.activities.length ?? 0} changes</button>;
  }
  render(<AppProvider client={client}><Probe /></AppProvider>);
  const button = await screen.findByRole('button', { name: '0 changes' });
  await waitFor(() => expect(client.sync).toHaveBeenCalled());
  await userEvent.click(button);
  expect(await screen.findByRole('button', { name: '2 changes' })).toBeVisible();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

test('a proof network failure is durably queued', async () => {
  const snapshot = sampleSnapshot();
  const client = {
    getSetupStatus: vi.fn().mockResolvedValue({ setupRequired: false }), getSession: vi.fn().mockResolvedValue({ user: snapshot.user, csrfToken: 'csrf' }),
    sync: vi.fn().mockResolvedValue(snapshot), setCsrf: vi.fn(), mutate: vi.fn().mockRejectedValue(new TypeError('offline')), uploadProof: vi.fn(), setup: vi.fn(), login: vi.fn(), logout: vi.fn(), exportUrl: '/api/export',
  };
  function Probe() {
    const app = useApp();
    return <button onClick={() => void app.addProof({ ownerType: 'progress', ownerId: 'workout-id', photo: new Blob(['proof']) })}>{app.pendingCount} {app.syncState}</button>;
  }
  render(<AppProvider client={client}><Probe /></AppProvider>);
  await userEvent.click(await screen.findByRole('button', { name: '0 synced' }));
  expect(await screen.findByRole('button', { name: '1 offline' })).toBeVisible();
  expect(await queuedMutations()).toEqual([expect.objectContaining({ kind: 'proof', body: expect.objectContaining({ ownerId: 'workout-id' }) })]);
});

test('a proof queues behind a failed entry and replays after it', async () => {
  const snapshot = sampleSnapshot();
  const sent: string[] = [];
  const client = clientFor(snapshot, {
    mutate: vi.fn(async mutation => {
      sent.push(mutation.path);
      if (sent.length === 1) throw new TypeError('offline');
    }),
  });
  function Probe() {
    const app = useApp();
    return <button onClick={async () => {
      await app.mutate({ method: 'POST', path: '/gym/workouts', body: { id: 'entry-id' } });
      await app.addProof({ ownerType: 'progress', ownerId: 'entry-id', photo: new Blob(['proof']) });
    }}>{app.pendingCount} pending</button>;
  }
  render(<AppProvider client={client}><Probe /></AppProvider>);
  await waitFor(() => expect(client.sync).toHaveBeenCalled());
  await userEvent.click(screen.getByRole('button', { name: '0 pending' }));
  await waitFor(async () => expect((await queuedMutations()).map(item => item.path)).toEqual(['/gym/workouts', '/proofs']));
  expect(sent).toEqual(['/gym/workouts']);

  window.dispatchEvent(new Event('online'));
  await waitFor(async () => expect(await queuedMutations()).toEqual([]));
  expect(sent).toEqual(['/gym/workouts', '/gym/workouts', '/proofs']);
});

test('an accepted entry is not rejected when its refresh fails', async () => {
  const snapshot = sampleSnapshot();
  const client = clientFor(snapshot, { sync: vi.fn().mockResolvedValueOnce(snapshot).mockRejectedValueOnce(new Error('refresh failed')) });
  function Probe() {
    const app = useApp();
    const [result, setResult] = useState('ready');
    return <button onClick={async () => { try { await app.mutate({ method: 'POST', path: '/gym/workouts', body: { id: 'entry-id' } }); setResult('accepted'); } catch { setResult('rejected'); } }}>{result} {app.syncState} {app.error}</button>;
  }
  render(<AppProvider client={client}><Probe /></AppProvider>);
  await waitFor(() => expect(client.sync).toHaveBeenCalledOnce());
  await userEvent.click(screen.getByRole('button', { name: 'ready synced' }));
  expect(await screen.findByRole('button', { name: 'accepted error refresh failed' })).toBeVisible();
  expect(client.mutate).toHaveBeenCalledOnce();
});

test('an accepted proof is not rejected when its refresh fails', async () => {
  const snapshot = sampleSnapshot();
  const client = clientFor(snapshot, { sync: vi.fn().mockResolvedValueOnce(snapshot).mockRejectedValueOnce(new Error('refresh failed')) });
  function Probe() {
    const app = useApp();
    const [result, setResult] = useState('ready');
    return <button onClick={async () => { try { await app.addProof({ ownerType: 'progress', ownerId: 'entry-id', photo: new Blob(['proof']) }); setResult('accepted'); } catch { setResult('rejected'); } }}>{result} {app.syncState} {app.error}</button>;
  }
  render(<AppProvider client={client}><Probe /></AppProvider>);
  await waitFor(() => expect(client.sync).toHaveBeenCalledOnce());
  await userEvent.click(screen.getByRole('button', { name: 'ready synced' }));
  expect(await screen.findByRole('button', { name: 'accepted error refresh failed' })).toBeVisible();
  expect(client.mutate).toHaveBeenCalledOnce();
});

function sampleSnapshot(): Snapshot {
  return { serverTime: '', user: { id: 'u', email: 'owner@example.com', timezone: 'Asia/Kolkata', enabledAreas: ['fitness'], onboardingStep: null, displayName: '', appearance: 'system', gardenSeason: 'dawn', voice: 'gentle', focusWindow: 'learn', celebration: 'full' }, tasks: [], completions: [], goals: [], milestones: [], progressEntries: [], checkins: [], activities: [], proofs: [] };
}

function clientFor(snapshot: Snapshot, overrides: Record<string, unknown> = {}) {
  return {
    getSetupStatus: vi.fn().mockResolvedValue({ setupRequired: false }), getSession: vi.fn().mockResolvedValue({ user: snapshot.user, csrfToken: 'csrf' }),
    sync: vi.fn().mockResolvedValue(snapshot), setCsrf: vi.fn(), mutate: vi.fn().mockResolvedValue(undefined), uploadProof: vi.fn(), setup: vi.fn(), login: vi.fn(), logout: vi.fn(), exportUrl: '/api/export',
    ...overrides,
  };
}
