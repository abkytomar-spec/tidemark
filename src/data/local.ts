import { format, parseISO, startOfWeek, addDays, subDays } from 'date-fns';
import type {
  ActivityEvent, DailyCheckin, DailyMomentDay, DailyMomentSettings, DailyMomentSnapshot, Energy, Goal, GlobalSafe, GymGoalType, GymPlan,
  GymRoutine, GymSnapshot, LifeArea, Milestone, Priority, ProgressEntry, ProofPhoto, Recurrence, Snapshot, Task, TaskCompletion, User,
} from '../domain/types';
import { dateKey, occursOn } from '../domain/schedule';
import { ApiError, type ProofOwnerType, type Session, type TidemarkClient } from './api';
import type { QueuedMutation } from './offline';

// Browser-only port of api/ (PHP + MySQL): one Snapshot-shaped record plus the few hidden columns the PHP keeps, all in IndexedDB.
type Json = Record<string, unknown>;
type StoredCompletion = TaskCompletion & { status: 'complete' | 'pending_proof'; note?: string };
type StoredSnapshot = Omit<Snapshot, 'completions' | 'globalSafe' | 'gym' | 'dailyMoment'> & { completions: StoredCompletion[]; globalSafe: GlobalSafe; gym: GymSnapshot; dailyMoment: DailyMomentSnapshot };
type Extra = { globalIds: string[]; globalEarned: string[]; gymIds: string[]; gymEarned: string[]; receipts: Array<[string, unknown]>; seq: number };
type State = { version: 1; snapshot: StoredSnapshot; extra: Extra };
type StoredPhoto = { type: string; bytes: ArrayBuffer; name: string };
type Ctx = { snap: StoredSnapshot; extra: Extra; put: Array<[string, StoredPhoto]>; drop: string[] };
type Owner = { type: 'completion'; row: StoredCompletion; task: Task } | { type: 'progress'; row: ProgressEntry; goal: Goal } | { type: 'daily_moment'; row: DailyMomentDay };
type ProofInput = { ownerType: ProofOwnerType; ownerId: string; photo: Blob; mutationId: string; filename?: string; caption?: string };

const DB_NAME = 'tidemark-local';
const MAX_BYTES = 8 * 1024 * 1024;
const AREAS: LifeArea[] = ['fitness', 'learning', 'work', 'money', 'wellbeing', 'home'];
const LEVELS = ['low', 'medium', 'high'];
const DEFAULT_MOMENT: DailyMomentSettings = { enabled: false, windowStart: '12:00', windowEnd: '17:00', notifications: false };
const GOAL_FIELDS: Record<GymGoalType, string[]> = {
  physique: ['direction', 'targetWeight', 'targetBodyFat', 'targetWaist', 'cadence', 'checkinCadence', 'photos', 'photoAngles'],
  strength_pr: ['exercise', 'baselineLoad', 'baselineReps', 'targetLoad', 'targetReps', 'weightUnit', 'targetDate'],
  body_measurements: ['metrics', 'targets', 'weightUnit', 'measurementUnit', 'cadence', 'checkinCadence'],
  workout_consistency: ['weeklySessionTarget', 'minimumDurationMinutes', 'trainingWeekdays', 'scheduleMode'],
};

export class LocalClient implements TidemarkClient {
  readonly local = true;
  readonly exportUrl = '';
  private database: Promise<IDBDatabase> | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private urls = new Map<string, string>();

  constructor(private name = DB_NAME) {}

  setCsrf() { /* no server session */ }
  async getSetupStatus() { return { setupRequired: false }; }
  async getSession(): Promise<Session> { return { user: await this.run(c => clone(c.snap.user), false), csrfToken: 'local' }; }
  setup() { return this.getSession(); }
  login() { return this.getSession(); }
  async logout() { return { ok: true }; }
  async sync(): Promise<Snapshot> { return this.withImages(await this.run(snapshot)); }

  async exportBackup(): Promise<Blob> {
    const data = { schemaVersion: 1, exportedAt: now(), snapshot: await this.run(snapshot) };
    return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  }

  mutate(mutation: QueuedMutation): Promise<unknown> {
    if (mutation.kind === 'proof') return this.uploadProof({ ...(mutation.body as Omit<ProofInput, 'mutationId'>), mutationId: mutation.id });
    return this.run(c => dispatch(c, mutation));
  }

  async uploadProof(input: ProofInput): Promise<unknown> {
    const photo = input.photo;
    if (!photo || typeof photo.size !== 'number') fail(422, 'Choose a photo to upload.');
    if (photo.size < 1 || photo.size > MAX_BYTES) fail(422, 'Choose a photo smaller than 8 MB.');
    const bytes = await bytesOf(photo);
    const type = sniff(bytes);
    if (!type) fail(422, 'Choose a JPEG, PNG, or WebP image.');
    return this.run(c => once(c, input.mutationId, () => attachProof(c, input, { type, bytes, name: (input.filename ?? 'proof.webp').slice(0, 255) })));
  }

  /** Close the connection (tests reopen the same database from a fresh client). */
  async close() { await this.chain; (await this.database)?.close(); this.database = null; }

  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('state'); request.result.createObjectStore('photos'); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { this.database = null; reject(request.error); };
    });
    return this.database;
  }

  // Serialised load → change → save, so every handler sees the latest state and a thrown error saves nothing.
  private run<T>(work: (c: Ctx) => T, write = true): Promise<T> {
    const next = this.chain.then(async () => {
      const db = await this.open();
      const stored = await result<State | undefined>(db.transaction('state').objectStore('state').get('current'));
      const state = stored ?? initialState();
      const c: Ctx = { snap: state.snapshot, extra: state.extra, put: [], drop: [] };
      const value = work(c);
      if (write || !stored) {
        const tx = db.transaction(['state', 'photos'], 'readwrite');
        tx.objectStore('state').put(state, 'current');
        for (const [id, photo] of c.put) tx.objectStore('photos').put(photo, id);
        for (const id of c.drop) tx.objectStore('photos').delete(id);
        await finished(tx);
      }
      for (const id of c.drop) this.revoke(id);
      return value;
    });
    this.chain = next.catch(() => undefined);
    return next;
  }

  // Proof images live as bytes in IndexedDB; the UI gets object URLs in place of /api/proofs/{id}/image.
  private async withImages(next: Snapshot): Promise<Snapshot> {
    if (typeof URL.createObjectURL !== 'function') return next;
    const missing = next.proofs.filter(proof => !this.urls.has(proof.id));
    if (missing.length) {
      const store = (await this.open()).transaction('photos').objectStore('photos');
      const photos = await Promise.all(missing.map(proof => result<StoredPhoto | undefined>(store.get(proof.id))));
      missing.forEach((proof, index) => { const photo = photos[index]; if (photo) this.urls.set(proof.id, URL.createObjectURL(new Blob([photo.bytes], { type: photo.type }))); });
    }
    const live = new Set(next.proofs.map(proof => proof.id));
    for (const id of [...this.urls.keys()]) if (!live.has(id)) this.revoke(id);
    return { ...next, proofs: next.proofs.map(proof => ({ ...proof, imageUrl: this.urls.get(proof.id) ?? proof.imageUrl })) };
  }

  private revoke(id: string) { const url = this.urls.get(id); if (url) { URL.revokeObjectURL?.(url); this.urls.delete(id); } }
}

function dispatch(c: Ctx, mutation: QueuedMutation): unknown {
  const { method, path, id } = mutation;
  const body = () => jsonBody(mutation.body);
  const at = (verb: QueuedMutation['method'], pattern: RegExp) => method === verb ? pattern.exec(path) : null;
  const run = <T>(work: () => T) => once(c, id, work);
  let m: RegExpExecArray | null;
  if (at('POST', /^\/tasks$/)) return run(() => createTask(c, body()));
  if (at('POST', /^\/goals$/)) return run(() => createGoal(c, body()));
  if (at('POST', /^\/daily-moment\/settings$/)) return run(() => saveMomentSettings(c, body()));
  if ((m = at('POST', /^\/daily-moment\/(\d{4}-\d{2}-\d{2})\/skip$/))) { const date = m[1]; return run(() => skipMoment(c, date)); }
  if ((m = at('POST', /^\/daily-moment\/(\d{4}-\d{2}-\d{2})\/capture$/))) { const date = m[1], input = body(); return run(() => captureMoment(c, date, str(input.caption))); }
  if ((m = at('DELETE', /^\/daily-moment\/(\d{4}-\d{2}-\d{2})$/))) { const date = validDate(m[1]); return run(() => deleteMoment(c, date)); }
  if ((m = at('DELETE', /^\/goals\/([A-Za-z0-9-]+)$/))) { const goalId = m[1]; return run(() => deleteGoal(c, goalId)); }
  if (at('POST', /^\/checkins$/)) return run(() => checkin(c, body()));
  if (at('POST', /^\/focus$/)) return run(() => focus(c, body()));
  if (at('PATCH', /^\/preferences$/)) return run(() => updatePreferences(c, body()));
  if (at('POST', /^\/gym\/plans$/)) return run(() => savePlan(c, body()));
  if (at('POST', /^\/gym\/routines$/)) return run(() => saveRoutine(c, body()));
  if ((m = at('DELETE', /^\/gym\/routines\/([A-Za-z0-9-]+)$/))) { const routineId = m[1]; return run(() => deleteRoutine(c, routineId)); }
  if (at('POST', /^\/gym\/rest$/)) return run(() => setRest(c, body()));
  if ((m = at('DELETE', /^\/gym\/rest\/(\d{4}-\d{2}-\d{2})$/))) { const date = m[1]; return run(() => clearRest(c, date)); }
  if (at('POST', /^\/gym\/goals$/)) return run(() => insertGymGoal(c, body()));
  if (at('POST', /^\/gym\/workouts$/)) return run(() => addWorkout(c, body()));
  if ((m = at('DELETE', /^\/gym\/workouts\/([A-Za-z0-9-]+)$/))) { const entryId = m[1]; return run(() => deleteWorkout(c, entryId)); }
  if (at('POST', /^\/gym\/streak\/settle$/)) return run(() => settleGymSafe(c, body()));
  if ((m = at('DELETE', /^\/proofs\/([A-Za-z0-9-]+)$/))) { const proofId = m[1]; return run(() => deleteProof(c, proofRow(c, proofId))); }
  if ((m = /^\/tasks\/([A-Za-z0-9-]+)$/.exec(path))) {
    const taskId = m[1];
    if (method === 'PATCH') { const input = body(); return run(() => updateTask(c, taskId, input)); }
    if (method === 'DELETE') return run(() => deleteTask(c, taskId));
  }
  if ((m = at('POST', /^\/tasks\/([A-Za-z0-9-]+)\/complete$/))) { const taskId = m[1], input = body(); return run(() => completeTask(c, taskId, input)); }
  if ((m = at('DELETE', /^\/tasks\/([A-Za-z0-9-]+)\/completions\/(\d{4}-\d{2}-\d{2})$/))) { const [, taskId, date] = m; return run(() => reopenTask(c, taskId, date)); }
  if ((m = at('POST', /^\/goals\/([A-Za-z0-9-]+)\/milestones$/))) { const goalId = m[1], input = body(); return run(() => addMilestone(c, goalId, input)); }
  if ((m = at('POST', /^\/goals\/([A-Za-z0-9-]+)\/entries$/))) { const goalId = m[1], input = body(); return run(() => insertEntry(c, goalId, input)); }
  fail(404, 'Not found.');
}

// ---- Sync.php
function snapshot(c: Ctx): Snapshot {
  const s = c.snap;
  const globalSafe = globalSafeSnapshot(c);
  const dailyMoment = momentSnapshot(c);
  const proven = new Set(s.proofs.filter(proof => proof.ownerType === 'completion').map(proof => proof.ownerId));
  const statusOrder = { active: 0, completed: 1, archived: 2 };
  return clone({
    serverTime: now(),
    user: s.user,
    tasks: [...s.tasks].sort((a, b) => a.scheduleDate.localeCompare(b.scheduleDate) || (a.scheduleTime ?? '').localeCompare(b.scheduleTime ?? '') || a.createdAt.localeCompare(b.createdAt)),
    completions: [...s.completions].sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate) || a.completedAt.localeCompare(b.completedAt)).map(({ note: _note, ...row }) => ({ ...row, hasProof: proven.has(row.id) })),
    goals: [...s.goals].sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.createdAt.localeCompare(b.createdAt)),
    milestones: [...s.milestones].sort((a, b) => a.goalId.localeCompare(b.goalId) || a.position - b.position),
    progressEntries: [...s.progressEntries].sort((a, b) => a.occurrenceAt.localeCompare(b.occurrenceAt)),
    checkins: [...s.checkins].sort((a, b) => a.date.localeCompare(b.date)),
    activities: s.activities.slice(0, 500),
    proofs: [...s.proofs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(proof => proofMeta(c, proof)),
    globalSafe,
    gym: {
      plans: [...s.gym.plans].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)),
      routines: s.gym.routines.filter(routine => routine.active).sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)),
      restEvents: [...s.gym.restEvents].sort((a, b) => a.date.localeCompare(b.date)),
      safe: s.gym.safe,
    },
    dailyMoment,
  });
}

// ---- Tasks.php
function createTask(c: Ctx, input: Json): Task {
  const data = validateTask(c, input);
  const id = uuid(input.id);
  if (c.snap.tasks.some(task => task.id === id)) fail(409, 'This task already exists.');
  const stamp = now();
  const task: Task = { id, ...data, archived: false, createdAt: stamp, updatedAt: stamp };
  c.snap.tasks.push(task);
  activity(c, 'task_created', 'Added ' + data.title, 'task', id);
  return task;
}

function updateTask(c: Ctx, id: string, input: Json): Task {
  const task = taskRow(c, id);
  const data = validateTask(c, { ...task, ...input });
  Object.assign(task, data, { updatedAt: now() });
  activity(c, 'task_updated', 'Updated ' + data.title, 'task', id);
  return task;
}

function deleteTask(c: Ctx, id: string) {
  const task = taskRow(c, id);
  const completions = new Set(c.snap.completions.filter(row => row.taskId === id).map(row => row.id));
  c.snap.tasks = c.snap.tasks.filter(row => row.id !== id);
  c.snap.completions = c.snap.completions.filter(row => !completions.has(row.id));
  removeProofs(c, proof => proof.ownerType === 'completion' && completions.has(proof.ownerId));
  activity(c, 'task_deleted', 'Deleted ' + task.title, 'task', id);
  return { deleted: true, id };
}

function completeTask(c: Ctx, id: string, input: Json) {
  const task = taskRow(c, id);
  const date = validDate(input.date);
  if (!occursOn({ ...task, archived: false }, parseISO(date))) fail(422, 'This task is not scheduled for that date.');
  const existing = c.snap.completions.find(row => row.taskId === id && row.occurrenceDate === date);
  if (existing) return completionRow(c, existing);
  const points = ({ low: 5, medium: 10, high: 20 } as Record<Priority, number>)[task.priority];
  const status = task.proofRequired ? 'pending_proof' : 'complete';
  const completion: StoredCompletion = { id: uuid(), taskId: id, occurrenceDate: date, completedAt: now(), points, status, hasProof: false, note: str(input.note).trim() };
  c.snap.completions.push(completion);
  if (status === 'complete') qualifyGlobal(c, date);
  activity(c, status === 'complete' ? 'task_completed' : 'proof_requested', (status === 'complete' ? 'Completed ' : 'Proof needed for ') + task.title, 'completion', completion.id, { points });
  return completionRow(c, completion);
}

function reopenTask(c: Ctx, id: string, date: string) {
  taskRow(c, id);
  validDate(date);
  const removed = new Set(c.snap.completions.filter(row => row.taskId === id && row.occurrenceDate === date).map(row => row.id));
  if (!removed.size) fail(404, 'Completion not found.');
  c.snap.completions = c.snap.completions.filter(row => !removed.has(row.id));
  removeProofs(c, proof => proof.ownerType === 'completion' && removed.has(proof.ownerId));
  recalculateGlobal(c);
  activity(c, 'task_reopened', 'Reopened a task', 'task', id, { date });
  return { reopened: true, taskId: id, occurrenceDate: date };
}

function taskRow(c: Ctx, id: string): Task { return c.snap.tasks.find(task => task.id === id) ?? fail(404, 'Task not found.'); }

function completionRow(c: Ctx, row: StoredCompletion): TaskCompletion {
  const { note: _note, ...completion } = row;
  return { ...completion, hasProof: row.status === 'complete' && c.snap.proofs.some(proof => proof.ownerType === 'completion' && proof.ownerId === row.id) };
}

function validateTask(c: Ctx, input: Json): Omit<Task, 'id' | 'archived' | 'createdAt' | 'updatedAt'> {
  const title = str(input.title).trim();
  if (!title || length(title) > 160) fail(422, 'Enter a task title up to 160 characters.', { field: 'title' });
  const priority = str(input.priority ?? 'medium'), energy = str(input.energy ?? 'medium');
  if (!LEVELS.includes(priority) || !LEVELS.includes(energy)) fail(422, 'Choose valid task settings.');
  const estimatedMinutes = int(input.estimatedMinutes ?? 15);
  if (estimatedMinutes < 1 || estimatedMinutes > 1440) fail(422, 'Estimate between 1 minute and 24 hours.');
  const color = str(input.color ?? '#5B8DEF');
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) fail(422, 'Choose a valid color.');
  const scheduleDate = validDate(input.scheduleDate);
  const time = input.scheduleTime ?? null;
  if (time !== null && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(str(time))) fail(422, 'Choose a valid time.');
  const raw: Json = isRecord(input.recurrence) ? input.recurrence : { type: 'one_time' };
  const type = str(raw.type ?? 'one_time');
  let recurrence: Recurrence;
  if (type === 'one_time' || type === 'daily') recurrence = { type };
  else if (type === 'weekly') {
    const weekdays = [...new Set((list(raw.weekdays) ?? []).map(int))];
    if (!weekdays.length || weekdays.some(day => day < 0 || day > 6)) fail(422, 'Choose at least one weekday.');
    recurrence = { type, weekdays };
  } else if (type === 'monthly') {
    const dayOfMonth = int(raw.dayOfMonth ?? scheduleDate.slice(8, 10));
    if (dayOfMonth < 1 || dayOfMonth > 31) fail(422, 'Choose a monthly day from 1 to 31.');
    recurrence = { type, dayOfMonth };
  } else fail(422, 'Choose a valid recurrence.');
  const goalId = input.goalId ?? null;
  if (truthy(goalId) && !c.snap.goals.some(goal => goal.id === goalId)) fail(422, 'Choose one of your goals.');
  return {
    title, notes: str(input.notes).trim(), priority: priority as Priority, color: color.toUpperCase(), estimatedMinutes, energy: energy as Energy,
    scheduleDate, scheduleTime: time === null ? null : str(time), recurrence, goalId: truthy(goalId) ? str(goalId) : null, proofRequired: truthy(input.proofRequired),
  };
}

// ---- GlobalSafe.php
function qualifyGlobal(c: Ctx, date: string) {
  const safe = c.snap.globalSafe, extra = c.extra;
  if (extra.globalIds.includes(date)) return;
  extra.globalIds.push(date);
  const count = safe.stored ? safe.qualifyingCount : safe.qualifyingCount + 1;
  const earned = !safe.stored && count >= 7;
  if (earned) extra.globalEarned = extra.globalIds.slice(-7);
  safe.stored = earned || safe.stored ? 1 : 0;
  safe.qualifyingCount = earned ? 0 : count;
}

function recalculateGlobal(c: Ctx) {
  const safe = c.snap.globalSafe, extra = c.extra;
  const complete = new Set(c.snap.completions.filter(row => row.status === 'complete').map(row => row.occurrenceDate));
  if (safe.stored) {
    const kept = extra.globalEarned.filter(date => complete.has(date));
    const stored = kept.length === extra.globalEarned.length;
    safe.qualifyingCount = stored ? safe.qualifyingCount : kept.length;
    safe.stored = stored ? 1 : 0;
    extra.globalEarned = kept;
  } else {
    const candidates = safe.qualifyingCount ? extra.globalIds.slice(-safe.qualifyingCount) : [];
    safe.qualifyingCount = candidates.filter(date => complete.has(date)).length;
  }
  extra.globalIds = extra.globalIds.filter(date => complete.has(date));
}

function globalSafeSnapshot(c: Ctx): GlobalSafe {
  recalculateGlobal(c);
  const safe = c.snap.globalSafe;
  if (safe.stored) {
    const today = new Date();
    const yesterday = dateKey(subDays(today, 1)), dayBefore = dateKey(subDays(today, 2));
    const done = (date: string) => c.snap.completions.some(row => row.status === 'complete' && row.occurrenceDate === date);
    if (!done(yesterday) && done(dayBefore)) {
      Object.assign(safe, { stored: 0, qualifyingCount: 0, lastProtectedDate: yesterday });
      c.extra.globalEarned = [];
      activity(c, 'global_safe_used', 'Streak Anchor protected a quiet day', 'global_safe', c.snap.user.id, { date: yesterday });
    }
  }
  return { ...safe };
}

// ---- Goals.php
function createGoal(c: Ctx, input: Json): Goal {
  const title = str(input.title).trim();
  const area = str(input.area) as LifeArea;
  const target = float(input.targetValue ?? 0);
  if (!title || length(title) > 160) fail(422, 'Enter a goal title.');
  if (!AREAS.includes(area)) fail(422, 'Choose a life area.');
  if (target <= 0) fail(422, 'Enter a target greater than zero.');
  const id = uuid(input.id);
  const deadline = truthy(input.deadline) ? validDate(input.deadline) : null;
  const color = str(input.color ?? '#69C9A5');
  return addGoal(c, {
    id, title, description: str(input.description).trim(), area, trackingType: str(input.trackingType ?? 'count').trim(), targetValue: round2(target),
    unit: str(input.unit).trim(), deadline, color: (/^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#69C9A5').toUpperCase(), gymType: null,
  });
}

function addGoal(c: Ctx, data: Omit<Goal, 'currentValue' | 'status' | 'createdAt' | 'updatedAt'>): Goal {
  if (c.snap.goals.some(goal => goal.id === data.id)) fail(409, 'This goal already exists.');
  const stamp = now();
  const goal: Goal = { ...data, currentValue: 0, status: 'active', createdAt: stamp, updatedAt: stamp };
  c.snap.goals.push(goal);
  activity(c, 'goal_created', 'Started ' + data.title, 'goal', data.id);
  return goal;
}

function deleteGoal(c: Ctx, id: string) {
  const goal = goalRow(c, id);
  if (!goal.gymType) fail(422, 'Only guided gym goals can be removed here.');
  if (c.snap.gym.plans.some(plan => plan.primaryGoalId === id)) fail(422, 'Gym plan goals cannot be removed.');
  if (c.snap.progressEntries.some(entry => entry.goalId === id)) fail(422, 'Goals with progress cannot be removed.');
  c.snap.goals = c.snap.goals.filter(row => row.id !== id);
  c.snap.milestones = c.snap.milestones.filter(row => row.goalId !== id);
  for (const task of c.snap.tasks) if (task.goalId === id) task.goalId = null;
  activity(c, 'goal_deleted', 'Removed a goal', 'goal', id);
  return { deleted: true, id };
}

function addMilestone(c: Ctx, goalId: string, input: Json): Milestone {
  goalRow(c, goalId);
  const label = str(input.label).trim();
  const target = float(input.targetValue ?? 0);
  if (!label || target <= 0) fail(422, 'Enter a milestone and target.');
  const milestone: Milestone = { id: uuid(), goalId, label, targetValue: round2(target), completedAt: null, position: c.snap.milestones.filter(row => row.goalId === goalId).length };
  c.snap.milestones.push(milestone);
  activity(c, 'milestone_created', 'Added ' + label, 'goal', goalId);
  return milestone;
}

function insertEntry(c: Ctx, goalId: string, input: Json): ProgressEntry {
  const goal = goalRow(c, goalId);
  const entryType = str(input.entryType ?? 'progress').trim();
  const rawMetric = input.metric ?? goal.unit;
  const metric = (truthy(rawMetric) ? str(rawMetric) : 'progress').trim();
  const value = float(input.value ?? 0);
  const durationMinutes = input.durationMinutes === undefined || input.durationMinutes === null ? null : int(input.durationMinutes);
  if (!entryType || !metric || value < 0 || (durationMinutes !== null && (durationMinutes < 0 || durationMinutes > 1440))) fail(422, 'Enter valid progress.');
  const id = uuid(input.id);
  if (c.snap.progressEntries.some(entry => entry.id === id)) fail(409, 'This progress already exists.');
  const status = entryType === 'workout' ? 'pending_proof' : 'complete';
  const occurrenceAt = validDateTime(input.occurrenceAt ?? 'now');
  const details = isRecord(input.details) ? input.details : {};
  const entry: ProgressEntry = { id, goalId, area: goal.area, entryType, metric, value: round2(value), durationMinutes, details, note: str(input.note).trim(), occurrenceAt, status, createdAt: now() };
  c.snap.progressEntries.push(entry);
  if (status === 'complete') adjustGoal(goal, value);
  activity(c, status === 'complete' ? 'progress_added' : 'proof_requested', status === 'complete' ? 'Added progress to ' + goal.title : 'Proof needed for workout', 'progress', id, { value: entry.value, metric });
  return entry;
}

function checkin(c: Ctx, input: Json): DailyCheckin {
  const date = validDate(input.date);
  const energy = str(input.energy);
  const mood = int(input.mood ?? 0);
  if (!LEVELS.includes(energy) || mood < 1 || mood > 5) fail(422, 'Choose your energy and mood.');
  const reflections: Partial<Record<'intention' | 'win' | 'gratitude', string>> = {};
  for (const field of ['intention', 'win', 'gratitude'] as const) {
    if (!has(input, field)) continue;
    if (typeof input[field] !== 'string') fail(422, 'Enter reflection text.', { field });
    const value = (input[field] as string).trim();
    if (length(value) > 280) fail(422, 'Keep each reflection under 280 characters.', { field });
    reflections[field] = value;
  }
  const id = uuid();
  const values = { energy: energy as Energy, mood: mood as DailyCheckin['mood'], note: str(input.note).trim() };
  let row = c.snap.checkins.find(item => item.date === date);
  if (row) Object.assign(row, values, reflections);
  else c.snap.checkins.push(row = { id, date, ...values, intention: '', win: '', gratitude: '', ...reflections });
  activity(c, 'checkin_saved', "Saved today's check-in", 'checkin', id);
  return row;
}

function updatePreferences(c: Ctx, input: Json): User {
  const user = c.snap.user;
  const raw = input.enabledAreas ?? user.enabledAreas;
  const enabledAreas = [...new Set((list(raw) ?? [raw]).filter((value): value is LifeArea => AREAS.includes(value as LifeArea)))];
  const step = has(input, 'onboardingStep') ? input.onboardingStep : user.onboardingStep;
  if (step !== null && !['areas', 'first-item', 'first-win', 'install'].includes(step as string)) fail(422, 'Choose a valid onboarding step.');
  if (has(input, 'displayName') && typeof input.displayName !== 'string') fail(422, 'Enter a valid name.', { field: 'displayName' });
  const displayName = has(input, 'displayName') ? (input.displayName as string).trim() : user.displayName;
  if (length(displayName) > 80) fail(422, 'Keep your name under 80 characters.', { field: 'displayName' });
  const choices = { appearance: ['system', 'light', 'dark'], gardenSeason: ['dawn', 'rain', 'moon'], voice: ['gentle', 'focused', 'cheerful'], focusWindow: ['learn', 'morning', 'afternoon', 'evening'], celebration: ['quiet', 'full'] };
  const picked: Json = {};
  for (const [field, allowed] of Object.entries(choices)) {
    const message = 'Choose a valid ' + field.replace(/([A-Z])/g, ' $1') + '.';
    if (has(input, field) && typeof input[field] !== 'string') fail(422, message, { field });
    const value = str(input[field] ?? user[field as keyof User]);
    if (!allowed.includes(value)) fail(422, message, { field });
    picked[field] = value;
  }
  if (has(input, 'contextualAmbience') && typeof input.contextualAmbience !== 'boolean') fail(422, 'Choose whether to use local ambience.', { field: 'contextualAmbience' });
  const contextualAmbience = (input.contextualAmbience ?? user.contextualAmbience ?? false) as boolean;
  const places = list(input.gymPlaces ?? user.gymPlaces ?? []);
  if (!places || places.length > 8) fail(422, 'Save up to eight workout places.', { field: 'gymPlaces' });
  const seen = new Set<string>();
  const gymPlaces = places.map(place => {
    const invalid = () => fail(422, 'Enter a valid workout place.', { field: 'gymPlaces' });
    if (!isRecord(place) || typeof place.id !== 'string' || typeof place.name !== 'string') return invalid();
    const id = uuid(place.id), name = place.name.trim();
    const { latitude, longitude, radiusMeters } = place;
    if (!name || length(name) > 60 || !isNum(latitude) || !isNum(longitude) || !isInt(radiusMeters) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || radiusMeters < 100 || radiusMeters > 1000 || seen.has(id)) return invalid();
    seen.add(id);
    return { id, name, latitude, longitude, radiusMeters };
  });
  Object.assign(user, { enabledAreas, onboardingStep: step as string | null, displayName, ...picked, contextualAmbience, gymPlaces });
  return user;
}

function focus(c: Ctx, input: Json) {
  const minutes = int(input.minutes ?? 0);
  if (minutes < 1 || minutes > 1440) fail(422, 'Focus time must be between 1 minute and 24 hours.');
  let goalId = input.goalId ?? null;
  const taskId = input.taskId ?? null;
  if (truthy(taskId)) goalId = taskRow(c, str(taskId)).goalId || goalId;
  if (truthy(goalId)) return insertEntry(c, str(goalId), { entryType: 'focus', metric: 'focus-minutes', value: minutes, durationMinutes: minutes, details: { taskId }, occurrenceAt: now() });
  const id = uuid();
  activity(c, 'focus_completed', `Focused for ${minutes} minutes`, 'focus', id, { taskId, minutes });
  return { id, taskId, minutes };
}

function goalRow(c: Ctx, id: string): Goal { return c.snap.goals.find(goal => goal.id === id) ?? fail(404, 'Goal not found.'); }
function adjustGoal(goal: Goal, delta: number) { goal.currentValue = round2(delta < 0 ? Math.max(0, goal.currentValue + delta) : goal.currentValue + delta); goal.updatedAt = now(); }

// ---- DailyMoments.php
function momentSnapshot(c: Ctx): DailyMomentSnapshot {
  const moment = c.snap.dailyMoment;
  const today = moment.settings.enabled ? momentDay(c, dateKey(new Date())) : null;
  moment.today = today && dayRow(today);
  moment.eligiblePrompt = !!today && ['scheduled', 'sent'].includes(today.status) && format(new Date(), 'HH:mm') >= today.scheduledTime;
  return { settings: { ...moment.settings }, today: moment.today, days: [...moment.days].sort((a, b) => b.localDate.localeCompare(a.localDate)).map(dayRow), eligiblePrompt: moment.eligiblePrompt };
}

function saveMomentSettings(c: Ctx, input: Json): DailyMomentSettings {
  if (typeof input.enabled !== 'boolean') fail(422, 'Choose whether Daily Snapshot is enabled.');
  if (typeof input.notifications !== 'boolean') fail(422, 'Choose whether Daily Snapshot notifications are enabled.');
  const windowStart = clock(input.windowStart), windowEnd = clock(input.windowEnd);
  if (minutes(windowEnd) <= minutes(windowStart)) fail(422, 'Choose an end time after the start time.');
  c.snap.dailyMoment.settings = { enabled: input.enabled, windowStart, windowEnd, notifications: input.notifications };
  return { ...c.snap.dailyMoment.settings };
}

function skipMoment(c: Ctx, date: string) {
  const day = scheduledDay(c, validDate(date));
  if (day.status === 'captured') fail(409, 'This Daily Snapshot is already captured.');
  if (day.status === 'scheduled' || day.status === 'sent') day.status = 'skipped';
  return dayRow(day);
}

function captureMoment(c: Ctx, date: string, caption: string) {
  validDate(date);
  if (length(caption.trim()) > 240) fail(422, 'Keep the Daily Snapshot caption under 240 characters.');
  const day = scheduledDay(c, date);
  if (day.status !== 'scheduled' && day.status !== 'sent') fail(409, 'This Daily Snapshot is already finished.');
  return dayRow(day);
}

function deleteMoment(c: Ctx, date: string) {
  const day = c.snap.dailyMoment.days.find(row => row.localDate === date);
  const proof = day && [...c.snap.proofs].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).find(row => row.ownerType === 'daily_moment' && row.ownerId === day.id);
  if (!day || !proof) fail(404, 'Daily Snapshot photo not found.');
  deleteProof(c, proof);
  return dayRow(day);
}

function scheduledDay(c: Ctx, date: string): DailyMomentDay {
  if (!c.snap.dailyMoment.settings.enabled) fail(422, 'Enable Daily Snapshot before updating a day.');
  return momentDay(c, date);
}

function momentDay(c: Ctx, date: string): DailyMomentDay {
  const moment = c.snap.dailyMoment;
  let day = moment.days.find(row => row.localDate === date);
  if (!day) {
    const start = minutes(moment.settings.windowStart), end = minutes(moment.settings.windowEnd);
    const minute = start + Math.floor(Math.random() * (end - start + 1));
    moment.days.push(day = { id: uuid(), localDate: date, scheduledTime: `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`, status: 'scheduled', capturedAt: null, caption: '' });
  }
  return day;
}

function dayRow(day: DailyMomentDay): DailyMomentDay { const { id, localDate, scheduledTime, status, capturedAt, caption } = day; return { id, localDate, date: localDate, scheduledTime, status, capturedAt, caption } as DailyMomentDay; }

// ---- Photos.php
function attachProof(c: Ctx, input: ProofInput, photo: StoredPhoto): ProofPhoto {
  const owner = proofOwner(c, str(input.ownerType), str(input.ownerId));
  if (owner.type === 'progress' && owner.row.entryType === 'workout' && c.snap.proofs.some(proof => proof.ownerType === 'progress' && proof.ownerId === owner.row.id)) fail(409, 'This workout already has a proof photo.');
  const caption = str(input.caption).trim();
  if (owner.type === 'daily_moment') {
    if (owner.row.status !== 'scheduled' && owner.row.status !== 'sent') fail(409, 'This Daily Snapshot is already finished.');
    if (length(caption) > 240) fail(422, 'Keep the Daily Snapshot caption under 240 characters.');
  }
  const id = uuid();
  const proof: ProofPhoto = { id, ownerType: owner.type, ownerId: owner.row.id, caption: owner.type === 'daily_moment' ? caption : '', imageUrl: imagePath(id), createdAt: now(), selectedForRecap: false };
  c.snap.proofs.push(proof);
  c.put.push([id, photo]);
  if (owner.type === 'completion' && owner.row.status === 'pending_proof') { owner.row.status = 'complete'; qualifyGlobal(c, owner.row.occurrenceDate); }
  if (owner.type === 'progress' && owner.row.status === 'pending_proof') {
    owner.row.status = 'complete';
    adjustGoal(owner.goal, owner.row.value);
    if (owner.row.entryType === 'workout') qualifyWorkout(c, owner.row.id);
  }
  activity(c, 'proof_added', 'Added proof photo', 'proof', id, { ownerType: owner.type, ownerId: owner.row.id });
  return proofMeta(c, proof);
}

function proofOwner(c: Ctx, type: string, id: string): Owner {
  const missing = () => fail(404, 'Proof destination not found.');
  const completion = (row: StoredCompletion | undefined): Owner => row ? { type: 'completion', row, task: taskRow(c, row.taskId) } : missing();
  if (type === 'completion') return completion(c.snap.completions.find(row => row.id === id));
  if (type === 'progress') { const row = c.snap.progressEntries.find(entry => entry.id === id); return row ? { type, row, goal: goalRow(c, row.goalId) } : missing(); }
  if (type === 'daily_moment') { const row = c.snap.dailyMoment.days.find(day => day.id === id); return row ? { type, row } : missing(); }
  if (type === 'task_occurrence') {
    const match = /^([a-f0-9-]{36}):(\d{4}-\d{2}-\d{2})$/i.exec(id);
    if (!match) fail(422, 'Choose a valid task occurrence.');
    return completion(c.snap.completions.find(row => row.taskId.toLowerCase() === match[1].toLowerCase() && row.occurrenceDate === match[2]));
  }
  if (type === 'progress_mutation') {
    const receipt = c.extra.receipts.find(([key]) => key === id);
    if (!receipt) fail(409, 'Workout progress has not synced yet.');
    return proofOwner(c, 'progress', isRecord(receipt[1]) ? str(receipt[1].id) : '');
  }
  fail(422, 'Choose a valid proof destination.');
}

function proofRow(c: Ctx, id: string): ProofPhoto { return c.snap.proofs.find(proof => proof.id === id) ?? fail(404, 'Proof photo not found.'); }

function deleteProof(c: Ctx, proof: ProofPhoto) {
  let workoutProof = false;
  if (proof.ownerType === 'progress') {
    const owner = proofOwner(c, 'progress', proof.ownerId);
    if (owner.type === 'progress' && owner.row.entryType === 'workout') {
      workoutProof = true;
      if (owner.row.status === 'complete') { owner.row.status = 'pending_proof'; adjustGoal(owner.goal, -owner.row.value); }
    }
  }
  if (proof.ownerType === 'completion') {
    const owner = proofOwner(c, 'completion', proof.ownerId);
    if (owner.type === 'completion' && owner.task.proofRequired) owner.row.status = 'pending_proof';
  }
  removeProofs(c, row => row.id === proof.id);
  if (proof.ownerType === 'completion') recalculateGlobal(c);
  if (workoutProof) recalculateGymSafe(c);
  activity(c, 'proof_deleted', 'Removed proof photo', 'proof', proof.id);
  return { deleted: true, id: proof.id };
}

function removeProofs(c: Ctx, match: (proof: ProofPhoto) => boolean) {
  for (const proof of c.snap.proofs) if (match(proof)) c.drop.push(proof.id);
  c.snap.proofs = c.snap.proofs.filter(proof => !match(proof));
}

function proofMeta(c: Ctx, proof: ProofPhoto): ProofPhoto {
  const entry = proof.ownerType === 'progress' ? c.snap.progressEntries.find(row => row.id === proof.ownerId) : undefined;
  const gym = entry && (entry.entryType === 'workout' || !!c.snap.goals.find(goal => goal.id === entry.goalId)?.gymType);
  const category = proof.ownerType === 'completion' ? 'tasks' : proof.ownerType === 'daily_moment' ? 'daily' : gym ? 'gym' : 'goals';
  return { id: proof.id, ownerType: proof.ownerType, ownerId: proof.ownerId, category, caption: proof.caption ?? '', imageUrl: imagePath(proof.id), createdAt: proof.createdAt, selectedForRecap: proof.selectedForRecap };
}

// ---- Gym.php
function savePlan(c: Ctx, input: Json): GymPlan {
  const restMode = str(input.restMode);
  if (restMode !== 'fixed' && restMode !== 'flexible') fail(422, 'Choose fixed or flexible rest.');
  const fixedRestWeekdays = weekdays(input.fixedRestWeekdays ?? []);
  const trainingWeekdays = weekdays(input.trainingWeekdays ?? []);
  const flexibleRestAllowance = integer(input.flexibleRestAllowance ?? 1, 1, 2, 'Choose one or two flexible rest days.') as 1 | 2;
  const weeklySessionTarget = integer(input.weeklySessionTarget ?? 0, 1, 7, 'Choose between one and seven weekly sessions.');
  const weightUnit = str(input.weightUnit), measurementUnit = str(input.measurementUnit);
  if ((weightUnit !== 'kg' && weightUnit !== 'lb') || (measurementUnit !== 'cm' && measurementUnit !== 'in')) fail(422, 'Choose valid gym units.');
  const effectiveFrom = validDate(input.effectiveFrom);
  const latest = [...c.snap.gym.plans].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  if (latest && (effectiveFrom <= latest.effectiveFrom || effectiveFrom <= dateKey(new Date()))) fail(422, 'Schedule changes must start after today and the latest gym plan.');
  let primaryGoalId = input.primaryGoalId !== undefined && input.primaryGoalId !== null && input.primaryGoalId !== '' ? str(input.primaryGoalId) : null;
  if (primaryGoalId) goalRow(c, primaryGoalId);
  else primaryGoalId = (activeGuidedGoal(c, str(input.goalType)) ?? insertGymGoal(c, { title: input.goalTitle ?? '', gymType: input.goalType ?? '', targetValue: input.targetValue ?? weeklySessionTarget, unit: input.unit ?? 'workouts', settings: input.goalSettings ?? [] })).id;
  if (latest) latest.effectiveTo = effectiveFrom;
  const plan: GymPlan = { id: uuid(input.id), primaryGoalId, restMode, fixedRestWeekdays, flexibleRestAllowance, trainingWeekdays, weeklySessionTarget, weightUnit, measurementUnit, effectiveFrom, effectiveTo: null };
  if (c.snap.gym.plans.some(row => row.id === plan.id)) fail(409, 'This gym plan already exists.');
  c.snap.gym.plans.push(plan);
  activity(c, 'gym_plan_saved', 'Saved gym plan', 'gym_plan', plan.id);
  return plan;
}

function saveRoutine(c: Ctx, input: Json): GymRoutine {
  const name = str(input.name).trim();
  if (!name || length(name) > 120) fail(422, 'Keep the routine name between 1 and 120 characters.');
  const template = input.templateSource ?? input.template ?? null;
  if (template !== null && (typeof template !== 'string' || length(template) > 40)) fail(422, 'Choose a valid routine template.');
  const position = integer(input.position ?? 0, 0, 65535, 'Choose a valid routine position.');
  const exercisesInput = list(input.exercises);
  if (!exercisesInput) fail(422, 'Add valid routine exercises.');
  const exercises = exercisesInput.map(exercise => {
    if (!isRecord(exercise)) fail(422, 'Add valid routine exercises.');
    const exerciseName = exerciseLabel(exercise.name ?? '');
    const sets = list(exercise.sets);
    if (!sets) fail(422, 'Add valid routine sets.');
    return { id: uuid(exercise.id), name: exerciseName, sets: sets.map(set => workoutSet(set)) };
  });
  const id = uuid(input.id);
  const stamp = now();
  let routine = c.snap.gym.routines.find(row => row.id === id);
  if (routine) Object.assign(routine, { name, template, exercises, position, active: true, updatedAt: stamp });
  else c.snap.gym.routines.push(routine = { id, name, template: template as string | null, exercises, position, active: true, createdAt: stamp, updatedAt: stamp });
  activity(c, 'gym_routine_saved', 'Saved ' + name, 'gym_routine', id);
  return routine;
}

function deleteRoutine(c: Ctx, id: string) {
  routineRow(c, id).active = false;
  activity(c, 'gym_routine_deleted', 'Removed gym routine', 'gym_routine', id);
  return { deleted: true, id };
}

function setRest(c: Ctx, input: Json) {
  const date = validDate(input.date);
  const plan = activePlan(c, date);
  if (!plan) fail(422, 'Create a gym plan before adding rest.');
  const kind = plan.restMode;
  if (kind === 'flexible') {
    const start = dateKey(startOfWeek(parseISO(date), { weekStartsOn: 1 })), end = dateKey(addDays(parseISO(start), 6));
    if (c.snap.gym.restEvents.filter(event => event.kind === 'flexible' && event.date >= start && event.date <= end).length >= plan.flexibleRestAllowance) fail(422, "This week's flexible rest allowance is already used.");
  }
  const id = uuid(input.id);
  if (c.snap.gym.restEvents.some(event => event.date === date)) fail(409, 'Rest is already planned for that day.');
  const event = { id, date, kind };
  c.snap.gym.restEvents.push(event);
  activity(c, 'gym_rest_set', 'Planned a gym rest day', 'gym_rest', id, { date });
  return event;
}

function clearRest(c: Ctx, date: string) {
  validDate(date);
  c.snap.gym.restEvents = c.snap.gym.restEvents.filter(event => event.date !== date);
  activity(c, 'gym_rest_cleared', 'Removed a gym rest day', 'gym_rest', uuid(), { date });
  return { deleted: true, date };
}

function insertGymGoal(c: Ctx, input: Json): Goal {
  const title = str(input.title).trim();
  if (!title || length(title) > 160) fail(422, 'Enter a goal title.');
  const type = str(input.gymType) as GymGoalType;
  if (!has(GOAL_FIELDS, type)) fail(422, 'Choose a guided gym goal type.');
  if (activeGuidedGoal(c, type)) fail(409, 'This guided gym goal is already active.');
  const settings = input.settings ?? [];
  if (!isRecord(settings) || (Array.isArray(settings) && settings.length > 0)) fail(422, 'Enter valid goal settings.');
  if (Object.keys(settings).some(key => !GOAL_FIELDS[type].includes(key))) fail(422, 'Remove settings that do not belong to this goal type.');
  const target = input.targetValue ?? 1;
  if (!isNum(target) || target <= 0) fail(422, 'Enter a target greater than zero.');
  const unit = str(input.unit ?? (type === 'workout_consistency' ? 'workouts' : '')).trim();
  if (length(unit) > 32) fail(422, 'Choose a valid goal unit.');
  const deadline = truthy(input.deadline) ? validDate(input.deadline) : null;
  const trackingType = ({ strength_pr: 'weight', body_measurements: 'measurement', physique: 'checkin', workout_consistency: 'count' } as const)[type];
  return addGoal(c, { id: uuid(input.id), title, description: str(input.description).trim(), area: 'fitness', trackingType, targetValue: round2(target), unit, deadline, color: '#69C9A5', gymType: type, gymSettings: Array.isArray(settings) ? {} : settings });
}

function addWorkout(c: Ctx, input: Json): ProgressEntry {
  const goalId = str(input.goalId);
  goalRow(c, goalId);
  const date = validDate(input.date);
  const durationMinutes = integer(input.durationMinutes ?? 0, 1, 1440, 'Workout duration must be between 1 minute and 24 hours.');
  const rawSets = list(input.sets);
  if (!rawSets || !rawSets.length) fail(422, 'Add at least one working set.');
  const sets = rawSets.map(set => workoutSet(set, true));
  if (!sets.some(set => !set.warmup)) fail(422, 'Add at least one working set.');
  const routineId = truthy(input.routineId) ? str(input.routineId) : null;
  if (routineId !== null) routineRow(c, routineId);
  const routineName = str(input.routineName).trim();
  if (length(routineName) > 120) fail(422, 'Keep the routine name under 120 characters.');
  const plannedState = str(input.plannedState ?? 'training');
  if (!['training', 'rest', 'open'].includes(plannedState)) fail(422, 'Choose a valid planned workout state.');
  const startedAt = validDateTime(input.startedAt ?? `${date}T00:00:00`);
  return insertEntry(c, goalId, {
    id: input.id ?? null, entryType: 'workout', metric: 'workout', value: 1, durationMinutes, note: input.note ?? '', occurrenceAt: input.occurrenceAt ?? `${date}T12:00:00`,
    details: { routineId, routineName, sets, startedAt, plannedState },
  });
}

function deleteWorkout(c: Ctx, id: string) {
  const entry = c.snap.progressEntries.find(row => row.id === id && row.entryType === 'workout');
  if (!entry) fail(404, 'Workout not found.');
  c.snap.progressEntries = c.snap.progressEntries.filter(row => row.id !== id);
  removeProofs(c, proof => proof.ownerType === 'progress' && proof.ownerId === id);
  if (entry.status === 'complete') adjustGoal(goalRow(c, entry.goalId), -entry.value);
  recalculateGymSafe(c);
  activity(c, 'gym_workout_deleted', 'Removed a gym workout', 'progress', id);
  return { deleted: true, id };
}

function settleGymSafe(c: Ctx, input: Json) {
  const date = validDate(input.missedDate ?? input.date ?? '');
  const plan = activePlan(c, date);
  const weekday = parseISO(date).getDay();
  if (!plan || !plan.trainingWeekdays.includes(weekday)) fail(422, 'Choose a missed scheduled workout.');
  const rested = c.snap.gym.restEvents.some(event => event.date === date);
  const trained = c.snap.progressEntries.some(entry => entry.entryType === 'workout' && entry.status === 'complete' && dateKey(parseISO(entry.occurrenceAt)) === date);
  if (plan.fixedRestWeekdays.includes(weekday) || rested || trained) fail(422, 'Choose a missed scheduled workout.');
  const safe = c.snap.gym.safe;
  if (safe.stored !== 1) fail(422, 'No Gym Streak Anchor is available.');
  Object.assign(safe, { stored: 0, lastProtectedDate: date });
  c.extra.gymEarned = [];
  activity(c, 'gym_safe_used', 'Gym Streak Anchor protected a missed day', 'gym_safe', c.snap.user.id, { date });
  return { ...safe };
}

function qualifyWorkout(c: Ctx, entryId: string) {
  if (!workoutQualifies(c, entryId)) fail(404, 'Completed workout not found.');
  const safe = c.snap.gym.safe, extra = c.extra;
  if (extra.gymIds.includes(entryId)) return;
  extra.gymIds.push(entryId);
  if (safe.stored) return;
  const count = safe.qualifyingCount + 1;
  const earned = count === 7;
  extra.gymEarned = earned ? extra.gymIds.slice(-7) : extra.gymEarned.length ? [...extra.gymEarned, entryId] : [];
  safe.stored = earned ? 1 : 0;
  safe.qualifyingCount = earned ? 0 : count;
}

function recalculateGymSafe(c: Ctx) {
  const safe = c.snap.gym.safe, extra = c.extra;
  if (safe.stored) {
    const kept = extra.gymEarned.filter(id => workoutQualifies(c, id));
    if (kept.length < extra.gymEarned.length) {
      const earned = new Set(extra.gymEarned);
      extra.gymIds = [...extra.gymIds.filter(id => !earned.has(id)), ...kept];
      Object.assign(safe, { stored: 0, qualifyingCount: kept.length });
      extra.gymEarned = kept;
    }
  } else if (safe.qualifyingCount > 0) {
    const ids = [...extra.gymIds];
    let count = safe.qualifyingCount;
    for (const id of extra.gymIds.slice(-count)) if (!workoutQualifies(c, id)) { ids.splice(ids.indexOf(id), 1); count--; }
    extra.gymIds = ids;
    extra.gymEarned = extra.gymEarned.filter(id => ids.includes(id));
    safe.qualifyingCount = count;
  }
}

function workoutQualifies(c: Ctx, id: string) {
  return c.snap.progressEntries.some(entry => entry.id === id && entry.entryType === 'workout' && entry.status === 'complete') && c.snap.proofs.some(proof => proof.ownerType === 'progress' && proof.ownerId === id);
}

function activeGuidedGoal(c: Ctx, type: string): Goal | undefined {
  return c.snap.goals.filter(goal => goal.gymType === type && goal.status === 'active').sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0];
}

function activePlan(c: Ctx, date: string): GymPlan | undefined {
  return c.snap.gym.plans.filter(plan => plan.effectiveFrom <= date && (plan.effectiveTo === null || plan.effectiveTo > date)).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}

function routineRow(c: Ctx, id: string): GymRoutine { return c.snap.gym.routines.find(routine => routine.id === id) ?? fail(404, 'Routine not found.'); }

function weekdays(value: unknown): number[] {
  const days = list(value);
  if (!days || new Set(days).size !== days.length) fail(422, 'Choose unique weekdays.');
  for (const day of days) if (!isInt(day) || day < 0 || day > 6) fail(422, 'Choose valid weekdays.');
  return days as number[];
}

function workoutSet(value: unknown): { reps: number; load: number; warmup: boolean; rpe: number | null };
function workoutSet(value: unknown, withExercise: true): { exercise: string; reps: number; load: number; warmup: boolean; rpe: number | null };
function workoutSet(value: unknown, withExercise = false) {
  if (!isRecord(value)) fail(422, 'Add valid workout sets.');
  const reps = integer(value.reps ?? null, 1, 1000, 'Reps must be between 1 and 1000.');
  const load = value.load ?? null;
  if (!isNum(load) || load < 0 || load > 2000) fail(422, 'Load must be between 0 and 2000.');
  const rpe = value.rpe ?? null;
  if (rpe !== null && (!isNum(rpe) || rpe < 1 || rpe > 10)) fail(422, 'RPE must be between 1 and 10.');
  const set = { reps, load, warmup: truthy(value.warmup ?? false), rpe: rpe as number | null };
  return withExercise ? { exercise: exerciseLabel(value.exercise ?? ''), ...set } : set;
}

function exerciseLabel(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || length(name) > 100) fail(422, 'Keep exercise names between 1 and 100 characters.');
  return name;
}

function integer(value: unknown, min: number, max: number, message: string): number {
  if (!isInt(value) || value < min || value > max) fail(422, message);
  return value;
}

// ---- Domain.php + helpers
function once<T>(c: Ctx, mutationId: string, work: () => T): T {
  if (!/^[A-Za-z0-9-]{8,36}$/.test(mutationId)) fail(400, 'A valid mutation ID is required.');
  const receipt = c.extra.receipts.find(([id]) => id === mutationId);
  if (receipt) return clone(receipt[1]) as T;
  const value = clone(work());
  c.extra.receipts.push([mutationId, value]);
  if (c.extra.receipts.length > 1000) c.extra.receipts.splice(0, c.extra.receipts.length - 1000);
  return clone(value);
}

function activity(c: Ctx, type: string, message: string, relatedType: string, relatedId: string, data: Json = {}) {
  const event: ActivityEvent & { data: Json } = { id: String(++c.extra.seq), type, message, relatedType, relatedId, data, createdAt: now() };
  c.snap.activities.unshift(event);
  if (c.snap.activities.length > 500) c.snap.activities.length = 500;
}

function initialState(): State {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const user: User = {
    id: crypto.randomUUID(), email: '', timezone, enabledAreas: ['fitness', 'learning', 'work', 'wellbeing'], onboardingStep: 'areas',
    displayName: '', appearance: 'system', gardenSeason: 'dawn', voice: 'gentle', focusWindow: 'learn', celebration: 'full', contextualAmbience: false, gymPlaces: [],
  };
  return {
    version: 1,
    snapshot: {
      serverTime: now(), user, tasks: [], completions: [], goals: [], milestones: [], progressEntries: [], checkins: [], activities: [], proofs: [],
      globalSafe: { scope: 'global', stored: 0, qualifyingCount: 0, lastProtectedDate: null },
      gym: { plans: [], routines: [], restEvents: [], safe: { scope: 'gym', stored: 0, qualifyingCount: 0, lastProtectedDate: null } },
      dailyMoment: { settings: { ...DEFAULT_MOMENT }, today: null, days: [], eligiblePrompt: false },
    },
    extra: { globalIds: [], globalEarned: [], gymIds: [], gymEarned: [], receipts: [], seq: 0 },
  };
}

function fail(status: number, message: string, details: Record<string, unknown> = {}): never { throw new ApiError(status, message, details); }

function validDate(value: unknown): string {
  const date = str(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match || new Date(Date.UTC(+match[1], +match[2] - 1, +match[3])).toISOString().slice(0, 10) !== date) fail(422, 'Choose a valid date.');
  return date;
}

function validDateTime(value: unknown): string {
  const text = str(value);
  const date = text === '' || text === 'now' ? new Date() : new Date(text);
  if (Number.isNaN(date.getTime())) fail(422, 'Choose a valid date and time.');
  return date.toISOString();
}

function uuid(candidate?: unknown): string {
  if (candidate === undefined || candidate === null) return crypto.randomUUID();
  const value = str(candidate);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) fail(422, 'Choose a valid ID.');
  return value.toLowerCase();
}

function jsonBody(body: unknown): Json {
  if (body === undefined || body === null) return {};
  if (!isRecord(body)) fail(400, 'Send a valid JSON request.');
  return body;
}

function clock(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(value)) fail(422, 'Choose a valid time.');
  return value;
}

function sniff(bytes: ArrayBuffer): string | null {
  const b = new Uint8Array(bytes.slice(0, 12));
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function bytesOf(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(blob); });
}

function result<T>(request: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result as T); request.onerror = () => reject(request.error); });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error('Tidemark could not save on this device.')); });
}

const now = () => new Date().toISOString();
const imagePath = (id: string) => `/api/proofs/${id}/image`;
const clone = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
const pad = (value: number) => String(value).padStart(2, '0');
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const length = (value: string) => [...value].length;
const round2 = (value: number) => Math.round(value * 100) / 100;
const has = (input: object, key: string) => Object.prototype.hasOwnProperty.call(input, key);
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null;
const list = (value: unknown): unknown[] | null => Array.isArray(value) ? value : isRecord(value) ? Object.values(value) : null;
const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);
// PHP-style casts so validation matches the API.
const str = (value: unknown): string => value === undefined || value === null || value === false ? '' : value === true ? '1' : String(value);
const float = (value: unknown): number => { const n = typeof value === 'string' ? parseFloat(value) : typeof value === 'boolean' ? Number(value) : typeof value === 'number' ? value : 0; return Number.isFinite(n) ? n : 0; };
const int = (value: unknown): number => Math.trunc(float(value));
const truthy = (value: unknown) => !(value === undefined || value === null || value === false || value === 0 || value === '' || value === '0' || (Array.isArray(value) && value.length === 0));
