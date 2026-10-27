import type { Snapshot, User } from '../domain/types';
import type { QueuedMutation } from './offline';

export class ApiError extends Error {
  constructor(public status: number, message: string, public details: Record<string, unknown> = {}) { super(message); }
}

type Fetcher = typeof fetch;
export type Session = { user: User; csrfToken: string };
export type ProofOwnerType = 'completion' | 'progress' | 'task_occurrence' | 'progress_mutation' | 'daily_moment';

export interface TidemarkClient {
  getSetupStatus(): Promise<{ setupRequired: boolean }>;
  getSession(): Promise<Session>;
  setup(input: { email: string; password: string; timezone: string }): Promise<Session>;
  login(input: { email: string; password: string }): Promise<Session>;
  logout(): Promise<{ ok: boolean }>;
  sync(): Promise<Snapshot>;
  mutate(mutation: QueuedMutation): Promise<unknown>;
  uploadProof(input: { ownerType: ProofOwnerType; ownerId: string; photo: Blob; mutationId: string; filename?: string; caption?: string }): Promise<unknown>;
  setCsrf(token: string | null): void;
  exportUrl: string;
  /** Data lives only in this browser: no network, no sign-in. */
  local?: boolean;
  exportBackup?(): Promise<Blob>;
}

export class ApiClient implements TidemarkClient {
  private csrf: string | null = null;
  readonly exportUrl = '/api/export';

  constructor(private fetcher: Fetcher = fetch) {}
  setCsrf(token: string | null) { this.csrf = token; }
  getSetupStatus() { return this.request<{ setupRequired: boolean }>('/setup/status'); }
  getSession() { return this.request<Session>('/session').then(session => this.keepSession(session)); }
  setup(input: { email: string; password: string; timezone: string }) { return this.request<Session>('/setup', { method: 'POST', body: JSON.stringify(input) }).then(session => this.keepSession(session)); }
  login(input: { email: string; password: string }) { return this.request<Session>('/login', { method: 'POST', body: JSON.stringify(input) }).then(session => this.keepSession(session)); }
  logout() { return this.request<{ ok: boolean }>('/logout', { method: 'POST', headers: this.csrfHeaders() }).finally(() => this.setCsrf(null)); }
  sync() { return this.request<Snapshot>('/sync'); }

  mutate(mutation: QueuedMutation) {
    if (mutation.kind === 'proof') {
      const body = mutation.body as { ownerType: ProofOwnerType; ownerId: string; photo: Blob; filename?: string; caption?: string };
      return this.uploadProof({ ...body, mutationId: mutation.id });
    }
    return this.request(mutation.path, {
      method: mutation.method,
      headers: { ...this.csrfHeaders(), 'X-Mutation-ID': mutation.id, 'Content-Type': 'application/json' },
      body: mutation.body === undefined ? undefined : JSON.stringify(mutation.body),
    });
  }

  uploadProof(input: { ownerType: ProofOwnerType; ownerId: string; photo: Blob; mutationId: string; filename?: string; caption?: string }) {
    const body = new FormData();
    body.set('ownerType', input.ownerType);
    body.set('ownerId', input.ownerId);
    if (input.caption !== undefined) body.set('caption', input.caption);
    body.set('photo', input.photo, input.filename ?? 'proof.webp');
    return this.request('/proofs', { method: 'POST', headers: { ...this.csrfHeaders(), 'X-Mutation-ID': input.mutationId }, body });
  }

  private keepSession(session: Session) { this.setCsrf(session.csrfToken); return session; }
  private csrfHeaders(): Record<string, string> { return this.csrf ? { 'X-CSRF-Token': this.csrf } : {}; }

  private async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const fetcher = this.fetcher;
    const response = await fetcher('/api' + path, { credentials: 'same-origin', ...init });
    const payload = response.headers.get('Content-Type')?.includes('application/json') ? await response.json() : {};
    if (!response.ok) throw new ApiError(response.status, payload.error ?? 'Tidemark could not complete that request.', payload.details ?? {});
    return payload as T;
  }
}

