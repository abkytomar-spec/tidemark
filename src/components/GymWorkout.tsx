import { useEffect, useState } from 'react';
import { gymPersonalRecords } from '../domain/gym';
import type { GymDayState, GymRoutine, ProgressEntry, WorkoutDetails, WorkoutSet } from '../domain/types';
import { CameraCapture } from './CameraCapture';

const restPresets = [60, 90, 120];

export const ACTIVE_WORKOUT_KEY = 'tidemark-active-workout';
export const activeWorkoutKey = (userId: string) => `${ACTIVE_WORKOUT_KEY}:${userId}`;
export type GymWorkoutDraft = Omit<WorkoutDetails, 'startedAt'> & { id: string; entrySaved: boolean; note: string };
export type GymWorkoutEntry = { id: string; body: Omit<GymWorkoutDraft, 'id' | 'entrySaved'> & { id: string; goalId: string; date: string; durationMinutes: number; occurrenceAt: string; startedAt: string } };

export function GymWorkout({ userId, routine, entries, goalId, date, plannedState, weightUnit = 'kg', onSaveEntry, onSaveProof, onClose }: { userId: string; routine: GymRoutine | null; entries: ProgressEntry[]; goalId: string; date: string; plannedState: GymDayState['kind']; weightUnit?: 'kg' | 'lb'; onSaveEntry(value: GymWorkoutEntry): Promise<void>; onSaveProof(value: { id: string; photo: File }): Promise<void>; onClose(): void }) {
  const storageKey = activeWorkoutKey(userId);
  const [{ draft, startedAt }, setWorkout] = useState(() => readActiveWorkout(userId) ?? createWorkout(routine, entries, plannedState));
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const workingSet = draft.sets.some(set => !set.warmup);
  const records = gymPersonalRecords(entries);
  const volume = draft.sets.reduce((total, set) => set.warmup ? total : total + set.load * set.reps, 0);

  useEffect(() => { writeActiveWorkout(storageKey, { draft, startedAt }); }, [draft, startedAt, storageKey]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // The rest bell fires from a timeout against wall-clock, not from counting ticks: a backgrounded
  // tab throttles intervals, and a rest timer that finishes late is worse than none.
  useEffect(() => {
    if (restEndsAt === null) return;
    const timer = window.setTimeout(() => { setRestEndsAt(null); navigator.vibrate?.([120, 90, 160]); }, Math.max(0, restEndsAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [restEndsAt]);

  function updateSet(index: number, patch: Partial<WorkoutSet>) {
    setWorkout(value => ({ ...value, draft: { ...value.draft, sets: value.draft.sets.map((set, item) => item === index ? { ...set, ...patch } : set) } }));
  }

  function addSet(index: number) {
    setWorkout(value => ({ ...value, draft: { ...value.draft, sets: value.draft.sets.flatMap((set, item) => item === index ? [set, { ...set, warmup: false, rpe: null }] : [set]) } }));
    setRestEndsAt(Date.now() + restPresets[0] * 1000);
  }

  function removeSet(index: number) {
    setWorkout(value => ({ ...value, draft: { ...value.draft, sets: value.draft.sets.filter((_, item) => item !== index) } }));
  }

  function addExercise() {
    setWorkout(value => ({ ...value, draft: { ...value.draft, sets: [...value.draft.sets, { exercise: '', reps: 8, load: 0, warmup: false, rpe: null }] } }));
  }

  async function finish() {
    if (!photo || !workingSet) return;
    const id = draft.id;
    const occurrenceAt = new Date().toISOString();
    const durationMinutes = Math.max(1, Math.ceil((Date.now() - Date.parse(startedAt)) / 60_000));
    setBusy(true);
    setError(null);
    try {
      if (!draft.entrySaved) {
        const { id: _id, entrySaved: _entrySaved, ...details } = draft;
        await onSaveEntry({ id, body: { ...details, id, goalId, date, durationMinutes, occurrenceAt, startedAt } });
        const saved = { ...draft, entrySaved: true };
        setWorkout(value => ({ ...value, draft: saved }));
        writeActiveWorkout(storageKey, { draft: saved, startedAt });
      }
      await onSaveProof({ id, photo });
      removeActiveWorkout(storageKey);
      onClose();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The workout could not be saved.'); }
    finally { setBusy(false); }
  }

  const restLeft = restEndsAt === null ? 0 : Math.max(0, Math.ceil((restEndsAt - now) / 1000));
  return <section className="gym-workout">
    <header><button className="back-button" type="button" onClick={onClose}>‹ Back to gym</button><p className="eyebrow">Active workout</p><h1>{draft.routineName || 'Open'} workout</h1></header>
    <div className="workout-hud">
      <div><small>Elapsed</small><strong>{clock(Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000)))}</strong></div>
      <div><small>Volume</small><strong>{Math.round(volume).toLocaleString()} {weightUnit}</strong></div>
      <div className={`workout-rest${restEndsAt === null ? '' : ' resting'}`}>
        <small>{restEndsAt === null ? 'Rest timer' : 'Resting'}</small>
        <div>{restEndsAt === null
          ? restPresets.map(seconds => <button type="button" key={seconds} onClick={() => setRestEndsAt(Date.now() + seconds * 1000)}>{clock(seconds)}</button>)
          : <><strong aria-live="polite">{clock(restLeft)}</strong><button type="button" onClick={() => setRestEndsAt(null)}>Skip</button></>}</div>
      </div>
    </div>
    <div className="workout-sets">{draft.sets.map((set, index) => {
      const setNumber = draft.sets.slice(0, index + 1).filter(item => item.exercise === set.exercise && item.warmup === set.warmup).length;
      const best = records[set.exercise.trim().toLowerCase()];
      const beatsBest = !set.warmup && !!best && (set.load > best.load || set.load === best.load && set.reps > best.reps);
      return <article key={index}><header><input className="set-exercise" placeholder="Exercise" aria-label={`Set ${index + 1} exercise`} value={set.exercise} onChange={event => updateSet(index, { exercise: event.target.value })} /><span>{set.warmup ? 'Warm-up' : `Set ${setNumber}`}</span></header>
        {best && <p className={`set-best${beatsBest ? ' pr' : ''}`}>{beatsBest ? `New record · past best ${best.load} ${weightUnit} × ${best.reps}` : `Best ${best.load} ${weightUnit} × ${best.reps}`}</p>}
        <div className="workout-set-fields">
        <label>Reps<input aria-label={`${set.exercise} set ${setNumber} reps`} type="number" min="1" value={set.reps} onChange={event => updateSet(index, { reps: Number(event.target.value) })} /></label>
        <label>Load<input aria-label={`${set.exercise} set ${setNumber} load`} type="number" min="0" step="0.1" value={set.load} onChange={event => updateSet(index, { load: Number(event.target.value) })} /></label>
        <label>RPE<input aria-label={`${set.exercise} set ${setNumber} RPE`} type="number" min="1" max="10" value={set.rpe ?? ''} onChange={event => updateSet(index, { rpe: event.target.value ? Number(event.target.value) : null })} /></label>
      </div><div className="set-row"><label className="working-toggle"><input aria-label="Working set" type="checkbox" checked={!set.warmup} onChange={event => updateSet(index, { warmup: !event.target.checked })} /> Count as working set</label>
        <button className="text-button" type="button" aria-label={`Add another ${set.exercise} set`} onClick={() => addSet(index)}>+ Set</button>
        {draft.sets.length > 1 && <button className="text-button danger" type="button" aria-label={`Remove ${set.exercise} set ${setNumber}`} onClick={() => removeSet(index)}>Remove</button>}
      </div></article>;
    })}</div>
    <button className="workout-button add-exercise" type="button" onClick={addExercise}>Add exercise</button>
    <label className="field"><span>Notes</span><textarea value={draft.note} onChange={event => setWorkout(value => ({ ...value, draft: { ...value.draft, note: event.target.value } }))} /></label>
    <section className="workout-proof"><h2>Workout proof</h2><p>Capture one private live photo. The workout counts after it is stored.</p><CameraCapture onSave={setPhoto} onDiscard={() => setPhoto(null)} /></section>
    {error && <p className="form-error">{error}</p>}
    <button className="primary-button finish-workout" type="button" disabled={!workingSet || !photo || busy} onClick={() => void finish()}>{busy ? 'Saving workout…' : 'Finish with proof'}</button>
  </section>;
}

function clock(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const rest = `${String(minutes).padStart(hours ? 2 : 1, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return hours ? `${hours}:${rest}` : rest;
}

function createWorkout(routine: GymRoutine | null, entries: ProgressEntry[], plannedState: GymDayState['kind']): { draft: GymWorkoutDraft; startedAt: string } {
  const previous = [...entries].filter(entry => entry.entryType === 'workout' && entry.status === 'complete' && (!routine || entry.details.routineId === routine.id)).sort((a, b) => b.occurrenceAt.localeCompare(a.occurrenceAt))[0];
  const previousSets = Array.isArray(previous?.details.sets) ? previous.details.sets as WorkoutSet[] : [];
  const sets = routine ? routine.exercises.flatMap(exercise => {
    const performed = previousSets.filter(set => set.exercise.trim().toLowerCase() === exercise.name.trim().toLowerCase());
    return (performed.length ? performed : exercise.sets.map(set => ({ ...set, exercise: exercise.name }))).map(set => ({ ...set }));
  }) : [{ exercise: 'Exercise', reps: 8, load: 0, warmup: true, rpe: null }];
  return { startedAt: new Date().toISOString(), draft: { id: crypto.randomUUID(), entrySaved: false, routineId: routine?.id ?? null, routineName: routine?.name ?? 'Open', sets, plannedState: plannedState === 'training' || plannedState === 'rest' || plannedState === 'open' ? plannedState : 'open', note: '' } };
}

// A draft left open is not a live workout — resuming one claims a 14-hour session and logs that
// duration. Anything older than a plausible session is dropped, so both this screen and the gym page
// (which decides whether to reopen the tracker at all) agree there is nothing to resume.
const staleAfterMs = 6 * 60 * 60 * 1000;

export function readActiveWorkout(userId: string): { draft: GymWorkoutDraft; startedAt: string } | null {
  try {
    const value = JSON.parse(localStorage.getItem(activeWorkoutKey(userId)) ?? 'null') as { draft?: GymWorkoutDraft; startedAt?: string } | null;
    if (!value?.draft || !Array.isArray(value.draft.sets) || typeof value.startedAt !== 'string') return null;
    const elapsed = Date.now() - Date.parse(value.startedAt);
    if (!Number.isFinite(elapsed) || elapsed > staleAfterMs) return null;
    return { draft: { ...value.draft, id: value.draft.id || crypto.randomUUID(), entrySaved: value.draft.entrySaved === true }, startedAt: value.startedAt };
  } catch { return null; }
}

function writeActiveWorkout(key: string, value: { draft: GymWorkoutDraft; startedAt: string }) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private browsing can deny storage */ }
}

function removeActiveWorkout(key: string) {
  try { localStorage.removeItem(key); } catch { /* private browsing can deny storage */ }
}
