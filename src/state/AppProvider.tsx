import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Snapshot } from '../domain/types';
import { ApiError, type TidemarkClient, type ProofOwnerType, type Session } from '../data/api';
import { api } from '../data/client';
import { enqueue, flushQueue, loadSnapshot, queuedMutations, saveSnapshot, type QueuedMutation } from '../data/offline';

export type SyncState = 'starting' | 'offline' | 'syncing' | 'synced' | 'error';
type OptimisticUpdate = (snapshot: Snapshot) => Snapshot;

type AppContextValue = {
  session: Session | null;
  snapshot: Snapshot | null;
  setupRequired: boolean | null;
  syncState: SyncState;
  pendingCount: number;
  error: string | null;
  localOnly: boolean;
  exportBackup?(): Promise<Blob>;
  login(input: { email: string; password: string }): Promise<void>;
  setup(input: { email: string; password: string; timezone: string }): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
  mutate(input: Omit<QueuedMutation, 'id' | 'createdAt'>, optimistic?: OptimisticUpdate): Promise<unknown>;
  addProof(input: { ownerType: ProofOwnerType; ownerId: string; photo: Blob; filename?: string; caption?: string }): Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children, client = api }: { children: ReactNode; client?: TidemarkClient }) {
  const [session, setSession] = useState<Session | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('starting');
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Local mode never waits on the network.
  const online = useCallback(() => client.local === true || navigator.onLine, [client]);

  const countPending = useCallback(async () => setPendingCount((await queuedMutations()).length), []);
  const refresh = useCallback(async () => {
    setSyncState(online() ? 'syncing' : 'offline');
    if (!online()) return;
    const next = await client.sync();
    snapshotRef.current = next;
    setSnapshot(next);
    await saveSnapshot(next);
    setSyncState('synced');
    setError(null);
  }, [client, online]);

  const acceptSession = useCallback(async (next: Session) => {
    client.setCsrf(next.csrfToken);
    setSession(next);
    setSetupRequired(false);
    await refresh();
  }, [client, refresh]);

  const refreshAfterWrite = useCallback(async () => {
    try { await refresh(); }
    catch (caught) {
      setSyncState(online() ? 'error' : 'offline');
      setError(caught instanceof Error ? caught.message : 'Saved, but could not refresh Tidemark.');
    }
  }, [online, refresh]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const cached = await loadSnapshot();
      if (active && cached) { snapshotRef.current = cached; setSnapshot(cached); }
      await countPending();
      try {
        const status = await client.getSetupStatus();
        if (!active) return;
        setSetupRequired(status.setupRequired);
        if (status.setupRequired) { setSyncState(online() ? 'synced' : 'offline'); return; }
        await acceptSession(await client.getSession());
      } catch (caught) {
        if (!active) return;
        if (caught instanceof ApiError && caught.status === 401) { setSession(null); setSyncState('synced'); }
        else { setSyncState(online() ? 'error' : 'offline'); setError(caught instanceof Error ? caught.message : 'Could not start Tidemark.'); }
      }
    })();
    return () => { active = false; };
  }, [acceptSession, client, countPending, online]);

  const replay = useCallback(async () => {
    if (!session || !online()) return;
    setSyncState('syncing');
    try {
      await flushQueue(item => client.mutate(item));
      await countPending();
      await refresh();
    } catch (caught) {
      setSyncState(caught instanceof ApiError && caught.status === 401 ? 'error' : 'offline');
      if (!(caught instanceof TypeError)) setError(caught instanceof Error ? caught.message : 'Sync paused.');
    }
  }, [client, countPending, online, refresh, session]);

  useEffect(() => {
    const online = () => void replay();
    const focus = () => { if (document.visibilityState === 'visible' && session) void refresh(); };
    window.addEventListener('online', online);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    const interval = window.setInterval(focus, 60_000);
    return () => { window.removeEventListener('online', online); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); window.clearInterval(interval); };
  }, [refresh, replay, session]);

  const mutate = useCallback(async (input: Omit<QueuedMutation, 'id' | 'createdAt'>, optimistic?: OptimisticUpdate) => {
    const item: QueuedMutation = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    if (optimistic && snapshotRef.current) { const next = optimistic(snapshotRef.current); snapshotRef.current = next; setSnapshot(next); await saveSnapshot(next); }
    if (!online()) {
      await enqueue(item); await countPending(); setSyncState('offline'); return undefined;
    }
    let result: unknown;
    try { result = await client.mutate(item); }
    catch (caught) {
      if (caught instanceof TypeError) { await enqueue(item); await countPending(); setSyncState('offline'); return undefined; }
      throw caught;
    }
    await refreshAfterWrite();
    return result;
  }, [client, countPending, online, refreshAfterWrite]);

  const addProof = useCallback(async (input: { ownerType: ProofOwnerType; ownerId: string; photo: Blob; filename?: string; caption?: string }) => {
    const item: QueuedMutation = { id: crypto.randomUUID(), kind: 'proof', method: 'POST', path: '/proofs', body: input, createdAt: new Date().toISOString() };
    if (!online() || (await queuedMutations()).length > 0) { await enqueue(item); await countPending(); setSyncState('offline'); return; }
    try { await client.mutate(item); }
    catch (caught) {
      if (caught instanceof TypeError) { await enqueue(item); await countPending(); setSyncState('offline'); return; }
      throw caught;
    }
    await refreshAfterWrite();
  }, [client, countPending, online, refreshAfterWrite]);

  const value = useMemo<AppContextValue>(() => ({
    session, snapshot, setupRequired, syncState, pendingCount, error,
    localOnly: client.local === true, exportBackup: client.exportBackup?.bind(client),
    login: async input => acceptSession(await client.login(input)),
    setup: async input => acceptSession(await client.setup(input)),
    logout: async () => { await client.logout(); setSession(null); snapshotRef.current = null; setSnapshot(null); },
    refresh, mutate, addProof,
  }), [acceptSession, addProof, client, error, mutate, pendingCount, refresh, session, setupRequired, snapshot, syncState]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be inside AppProvider');
  return value;
}
