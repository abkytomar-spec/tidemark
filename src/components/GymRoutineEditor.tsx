import { useState } from 'react';
import type { GymRoutine, RoutineExercise } from '../domain/types';

export type GymRoutineDraft = Pick<GymRoutine, 'id' | 'name' | 'template' | 'exercises' | 'position' | 'active'>;
type BuiltInTemplate = { name: string; template: string; exercises: string[] };

export const FULL_BODY: BuiltInTemplate = { name: 'Full body', template: 'full_body', exercises: ['Squat', 'Bench press', 'Row'] };
export const UPPER: BuiltInTemplate = { name: 'Upper', template: 'upper', exercises: ['Bench press', 'Row', 'Shoulder press'] };
export const LOWER: BuiltInTemplate = { name: 'Lower', template: 'lower', exercises: ['Squat', 'Romanian deadlift', 'Calf raise'] };
export const PUSH: BuiltInTemplate = { name: 'Push', template: 'push', exercises: ['Bench press', 'Shoulder press', 'Triceps pressdown'] };
export const PULL: BuiltInTemplate = { name: 'Pull', template: 'pull', exercises: ['Row', 'Lat pulldown', 'Curl'] };
export const LEGS: BuiltInTemplate = { name: 'Legs', template: 'legs', exercises: ['Squat', 'Romanian deadlift', 'Leg press'] };
export const GYM_ROUTINE_TEMPLATES = [FULL_BODY, UPPER, LOWER, PUSH, PULL, LEGS] as const;

export function GymRoutineEditor({ routine, position = 0, onSave, onCancel }: { routine?: GymRoutine; position?: number; onSave(draft: GymRoutineDraft): Promise<void>; onCancel(): void }) {
  const [draft, setDraft] = useState<GymRoutineDraft>(() => routine ? pickRoutine(routine) : { id: crypto.randomUUID(), name: '', template: null, exercises: [], position, active: true });
  const [busy, setBusy] = useState(false);

  function choose(template: BuiltInTemplate) {
    setDraft(value => ({ ...value, name: template.name, template: template.template, exercises: template.exercises.map(templateExercise) }));
  }
  function updateExercise(index: number, patch: Partial<RoutineExercise>) {
    setDraft(value => ({ ...value, exercises: value.exercises.map((exercise, item) => item === index ? { ...exercise, ...patch } : exercise) }));
  }
  function addExercise() {
    setDraft(value => ({ ...value, exercises: [...value.exercises, { id: crypto.randomUUID(), name: 'Exercise', sets: [workingSet()] }] }));
  }
  function removeExercise(index: number) {
    setDraft(value => ({ ...value, exercises: value.exercises.filter((_, item) => item !== index) }));
  }
  function updateSet(exerciseIndex: number, setIndex: number, patch: Partial<RoutineExercise['sets'][number]>) {
    setDraft(value => ({ ...value, exercises: value.exercises.map((exercise, item) => item === exerciseIndex ? { ...exercise, sets: exercise.sets.map((set, index) => index === setIndex ? { ...set, ...patch } : set) } : exercise) }));
  }
  function addSet(exerciseIndex: number) {
    setDraft(value => ({ ...value, exercises: value.exercises.map((exercise, item) => item === exerciseIndex ? { ...exercise, sets: [...exercise.sets, workingSet()] } : exercise) }));
  }
  function removeSet(exerciseIndex: number, setIndex: number) {
    setDraft(value => ({ ...value, exercises: value.exercises.map((exercise, item) => item === exerciseIndex && exercise.sets.length > 1 ? { ...exercise, sets: exercise.sets.filter((_, index) => index !== setIndex) } : exercise) }));
  }
  function moveExercise(index: number, offset: number) {
    setDraft(value => ({ ...value, exercises: move(value.exercises, index, index + offset) }));
  }
  function moveSet(exerciseIndex: number, setIndex: number, offset: number) {
    const exercise = draft.exercises[exerciseIndex];
    updateExercise(exerciseIndex, { sets: move(exercise.sets, setIndex, setIndex + offset) });
  }

  return <form className="gym-routine-editor" onSubmit={async event => { event.preventDefault(); setBusy(true); try { await onSave(draft); } finally { setBusy(false); } }}>
    <div className="routine-templates" aria-label="Routine templates">{GYM_ROUTINE_TEMPLATES.map(template => <button type="button" aria-pressed={draft.template === template.template} key={template.template} onClick={() => choose(template)}>{template.name}</button>)}</div>
    <label className="field"><span>Routine name</span><input value={draft.name} maxLength={120} required onChange={event => setDraft(value => ({ ...value, name: event.target.value }))} /></label>
    <div className="routine-exercises">{draft.exercises.map((exercise, exerciseIndex) => <article className="routine-exercise" key={exercise.id}>
      <header><input aria-label="Exercise name" value={exercise.name} onChange={event => updateExercise(exerciseIndex, { name: event.target.value })} /><span className="move-buttons"><button type="button" aria-label={`Move ${exercise.name} up`} disabled={exerciseIndex === 0} onClick={() => moveExercise(exerciseIndex, -1)}>↑</button><button type="button" aria-label={`Move ${exercise.name} down`} disabled={exerciseIndex === draft.exercises.length - 1} onClick={() => moveExercise(exerciseIndex, 1)}>↓</button><button type="button" aria-label={`Remove ${exercise.name}`} onClick={() => removeExercise(exerciseIndex)}>×</button></span></header>
      <ol aria-label={`${exercise.name} sets`}>{exercise.sets.map((set, setIndex) => <li key={`${exercise.id}-${setIndex}`}>
        <span className="routine-set-kind">{set.warmup ? 'Warm-up' : 'Working set'}</span>
        <label>Classification<select aria-label={`${exercise.name} set ${setIndex + 1} classification`} value={set.warmup ? 'warmup' : 'working'} onChange={event => updateSet(exerciseIndex, setIndex, { warmup: event.target.value === 'warmup' })}><option value="warmup">Warm-up</option><option value="working">Working set</option></select></label>
        <label>Reps<input aria-label={`${exercise.name} set ${setIndex + 1} reps`} type="number" min="1" value={set.reps} onChange={event => updateSet(exerciseIndex, setIndex, { reps: Number(event.target.value) })} /></label>
        <label>Load<input aria-label={`${exercise.name} set ${setIndex + 1} load`} type="number" min="0" step="0.1" value={set.load} onChange={event => updateSet(exerciseIndex, setIndex, { load: Number(event.target.value) })} /></label>
        <label>RPE<input aria-label={`${exercise.name} set ${setIndex + 1} RPE`} type="number" min="1" max="10" value={set.rpe ?? ''} onChange={event => updateSet(exerciseIndex, setIndex, { rpe: event.target.value ? Number(event.target.value) : null })} /></label>
        <span className="move-buttons"><button type="button" aria-label={`Move ${exercise.name} ${set.warmup ? 'warm-up' : 'working set'} up`} disabled={setIndex === 0} onClick={() => moveSet(exerciseIndex, setIndex, -1)}>↑</button><button type="button" aria-label={`Move ${exercise.name} ${set.warmup ? 'warm-up' : 'working set'} down`} disabled={setIndex === exercise.sets.length - 1} onClick={() => moveSet(exerciseIndex, setIndex, 1)}>↓</button><button type="button" aria-label={`Remove ${exercise.name} set ${setIndex + 1}`} disabled={exercise.sets.length === 1} onClick={() => removeSet(exerciseIndex, setIndex)}>×</button></span>
      </li>)}</ol>
      <button className="text-button" type="button" onClick={() => addSet(exerciseIndex)}>Add {exercise.name} set</button>
    </article>)}<button className="text-button" type="button" onClick={addExercise}>Add exercise</button></div>
    <div className="form-actions"><button className="text-button" type="button" onClick={onCancel}>Cancel</button><button className="primary-button" disabled={busy || !draft.name.trim() || draft.exercises.length === 0 || draft.exercises.some(exercise => !exercise.name.trim() || exercise.sets.length === 0)}>{busy ? 'Saving…' : 'Save routine'}</button></div>
  </form>;
}

function templateExercise(name: string): RoutineExercise {
  return { id: crypto.randomUUID(), name, sets: [{ reps: 8, load: 0, warmup: true, rpe: null }, { reps: 8, load: 0, warmup: false, rpe: null }] };
}

function workingSet(): RoutineExercise['sets'][number] {
  return { reps: 8, load: 0, warmup: false, rpe: null };
}

function pickRoutine(routine: GymRoutine): GymRoutineDraft {
  return { id: routine.id, name: routine.name, template: routine.template, exercises: routine.exercises, position: routine.position, active: routine.active };
}

function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
