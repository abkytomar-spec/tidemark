import { addDays, format, parseISO, startOfWeek } from 'date-fns';
import { useEffect, useState } from 'react';
import { GymRoutineEditor, type GymRoutineDraft } from '../components/GymRoutineEditor';
import { GymProgress, type GymGoalDraft, type GymProgressDraft, type GymProgressProof } from '../components/GymProgress';
import { GymSetup, type GymSetupDraft } from '../components/GymSetup';
import { GymPlaces, type GymContextValue } from '../components/GymPlaces';
import { ACTIVE_WORKOUT_KEY, GymWorkout, readActiveWorkout, type GymWorkoutEntry } from '../components/GymWorkout';
import { Sheet } from '../components/Sheet';
import { prepareProof } from '../data/images';
import type { QueuedMutation } from '../data/offline';
import { activeGymPlan, EMPTY_GYM_SNAPSHOT, gymDayState, gymStreak, gymWeekSummary } from '../domain/gym';
import { dateKey } from '../domain/schedule';
import type { Goal, GymDayState, GymRoutine, Snapshot } from '../domain/types';

type GymMutate = (input: Omit<QueuedMutation, 'id' | 'createdAt'>) => Promise<unknown>;
type GymAddProof = (input: { ownerType: 'progress'; ownerId: string; photo: Blob; filename?: string }) => Promise<void>;
type Props = { snapshot: Snapshot; mutate: GymMutate; addProof?: GymAddProof; userId?: string; today?: Date; onStartWorkout?: (state: GymDayState) => void; startRequested?: boolean; onStartRequestHandled?: () => void; onSaveContext?: (value: GymContextValue) => Promise<void> };

const goalTitles = { physique: 'Shape my physique', strength_pr: 'Build lasting strength', body_measurements: 'Track body change', workout_consistency: 'Train steadily' } as const;
const safeSettlementKeyPrefix = 'tidemark-gym-settled-safe-date';
let safeSettlementFallback: { key: string; date: string } | null = null;

export function GymPage({ snapshot, mutate, addProof, userId, today = new Date(), onStartWorkout, startRequested = false, onStartRequestHandled, onSaveContext }: Props) {
  const workoutOwnerId = userId ?? snapshot.user.id;
  const [setupOpen, setSetupOpen] = useState(false);
  const [routineOpen, setRoutineOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<GymRoutine | undefined>();
  const [workoutOpen, setWorkoutOpen] = useState(() => hasActiveWorkout(workoutOwnerId));
  const [workoutRoutineId, setWorkoutRoutineId] = useState<string | null>(() => activeWorkoutRoutineId(workoutOwnerId));
  const gym = snapshot.gym ?? EMPTY_GYM_SNAPSHOT;
  const todayKey = dateKey(today);
  const safeSettlementKey = `${safeSettlementKeyPrefix}:${snapshot.user.id}`;
  const week = Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(today, { weekStartsOn: 1 }), index));
  const weekKeys = week.map(dateKey);
  const completed = snapshot.progressEntries.filter(entry => entry.entryType === 'workout' && entry.status === 'complete').map(entry => dateKey(parseISO(entry.occurrenceAt)));
  const ruleInput = { plans: gym.plans, restEvents: gym.restEvents, entries: snapshot.progressEntries, safe: gym.safe, completed, today: todayKey };
  const summary = gymWeekSummary(ruleInput, weekKeys);
  const states = summary.states;
  const todayState = gymDayState(ruleInput);
  const streak = gymStreak(ruleInput);

  useEffect(() => {
    discardLegacyActiveWorkout();
    setWorkoutOpen(hasActiveWorkout(workoutOwnerId));
    setWorkoutRoutineId(activeWorkoutRoutineId(workoutOwnerId));
  }, [workoutOwnerId]);

  useEffect(() => {
    if (!streak.pendingSafeDate) { clearSafeSettlement(safeSettlementKey); return; }
    const missedDate = streak.pendingSafeDate;
    if (readSafeSettlement(safeSettlementKey) === missedDate) return;
    writeSafeSettlement(safeSettlementKey, missedDate);
    void mutate({ method: 'POST', path: '/gym/streak/settle', body: { missedDate } }).catch(() => clearSafeSettlement(safeSettlementKey, missedDate));
  }, [mutate, safeSettlementKey, streak.pendingSafeDate]);

  useEffect(() => {
    if (!startRequested) return;
    onStartRequestHandled?.();
    if (gym.plans.length === 0) return;
    setWorkoutRoutineId(gym.routines[0]?.id ?? null);
    setWorkoutOpen(true);
  }, [startRequested]);

  async function saveSetup(draft: GymSetupDraft) {
    await mutate({ method: 'POST', path: '/gym/plans', body: { ...draft, goalTitle: goalTitles[draft.goalType], goalSettings: {}, weeklySessionTarget: draft.trainingWeekdays.length, effectiveFrom: todayKey } });
    setSetupOpen(false);
  }

  async function saveRoutine(draft: GymRoutineDraft) {
    await mutate({ method: 'POST', path: '/gym/routines', body: draft });
    setRoutineOpen(false);
    setEditingRoutine(undefined);
  }

  async function saveWorkoutEntry(value: GymWorkoutEntry) {
    await mutate({ method: 'POST', path: '/gym/workouts', body: value.body });
  }

  async function saveWorkoutProof(value: { id: string; photo: File }) {
    if (!addProof) throw new Error('Proof saving is unavailable.');
    const photo = await prepareProof(value.photo);
    await addProof({ ownerType: 'progress', ownerId: value.id, photo });
  }

  async function saveProgressEntry(goal: Goal, id: string, value: GymProgressDraft) {
    await mutate({ method: 'POST', path: `/goals/${goal.id}/entries`, body: { id, ...value } });
  }

  async function saveProgressProof(id: string, proof: GymProgressProof) {
    if (!addProof) throw new Error('Proof saving is unavailable.');
    await addProof({ ownerType: 'progress', ownerId: id, photo: await prepareProof(proof.photo), filename: `${proof.angle}.webp` });
  }

  async function createGymGoal(value: GymGoalDraft) {
    await mutate({ method: 'POST', path: '/gym/goals', body: { id: crypto.randomUUID(), ...value } });
  }

  if (gym.plans.length === 0) return <>
    <section className="gym-empty empty-page"><p className="eyebrow">Your gym</p><h1>Get stronger</h1><p>Build a steady rhythm around training, rest, and the progress that matters to you.</p><button className="primary-button" type="button" onClick={() => setSetupOpen(true)}>Set up my gym</button></section>
    {onSaveContext && <GymPlaces places={snapshot.user.gymPlaces ?? []} contextualAmbience={snapshot.user.contextualAmbience ?? false} onSave={onSaveContext} />}
    <Sheet open={setupOpen} title="Your gym rhythm" onClose={() => setSetupOpen(false)}><GymSetup onSubmit={saveSetup} onSkip={() => setSetupOpen(false)} /></Sheet>
  </>;

  const weightUnit = gym.plans[gym.plans.length - 1].weightUnit;
  const startWorkout = (routine: GymRoutine | null = gym.routines[0] ?? null) => {
    onStartWorkout?.(todayState);
    setWorkoutRoutineId(routine?.id ?? null);
    setWorkoutOpen(true);
  };
  if (workoutOpen) {
    const plan = activeGymPlan(gym.plans, todayKey) ?? gym.plans[gym.plans.length - 1];
    return <GymWorkout key={workoutOwnerId} userId={workoutOwnerId} routine={gym.routines.find(routine => routine.id === workoutRoutineId) ?? null} entries={snapshot.progressEntries} goalId={plan.primaryGoalId} date={todayKey} plannedState={todayState.kind} weightUnit={weightUnit} onSaveEntry={saveWorkoutEntry} onSaveProof={saveWorkoutProof} onClose={() => setWorkoutOpen(false)} />;
  }
  return <section className="gym-page">
    <header className="gym-header"><div><p className="eyebrow">Your gym</p><h1>Get stronger</h1></div><div className="gym-momentum"><span>{streak.current}</span><small>momentum</small></div></header>
    <ul className="gym-week" aria-label="This week">{week.map((day, index) => <li className={`gym-stone ${states[index].kind}${weekKeys[index] === todayKey ? ' today' : ''}`} aria-label={`${format(day, 'EEEE')}: ${dayLabel(states[index])}`} key={weekKeys[index]}><small>{format(day, 'EEEEE')}</small><strong>{format(day, 'd')}</strong><b aria-hidden="true">{stoneMark(states[index])}</b></li>)}</ul>
    <p className="gym-legend" aria-hidden="true"><span className="complete">✓ done</span><span className="training">● training</span><span className="rest">◡ rest</span><span className="open">· open</span></p>
    <article className="gym-week-card">
      <div className="gym-week-ring" style={{ '--ring': summary.target ? Math.min(1, summary.done / summary.target) : 0 } as React.CSSProperties}><strong>{summary.done}</strong><small>of {summary.target || '—'}</small></div>
      <div>
        <p className="eyebrow">This week</p>
        <h2>{summary.target === 0 ? `${summary.done} session${summary.done === 1 ? '' : 's'} logged` : summary.done >= summary.target ? 'Week complete' : `${summary.target - summary.done} session${summary.target - summary.done === 1 ? '' : 's'} to go`}</h2>
        <ul><li><strong>{summary.rest}</strong><small>rest day{summary.rest === 1 ? '' : 's'}</small></li><li><strong>{summary.volume.toLocaleString()}</strong><small>{weightUnit} lifted</small></li><li><strong>{streak.current}</strong><small>session streak</small></li></ul>
      </div>
    </article>
    <article className="gym-today-card">
      <p className="eyebrow">Today · {format(today, 'EEEE')}</p>
      {todayState.kind === 'rest' ? <><h2>Planned rest</h2><p>Rest is part of the work. Let your body catch up.</p>{todayState.canUndoRest && <p>{todayState.remainingFlexibleRest} flexible rest{todayState.remainingFlexibleRest === 1 ? '' : 's'} left</p>}<button className="text-button" type="button" onClick={() => startWorkout()}>Train anyway</button></> : todayState.kind === 'complete' ? <><h2>Workout complete</h2><p>That session is safely in the harbor.</p></> : <><h2>{todayState.kind === 'training' ? 'Ready when you are' : 'An open day'}</h2><p>{todayState.kind === 'training' ? 'Your planned session is here.' : 'Move if it would feel good today.'}</p><button className="primary-button" type="button" onClick={() => startWorkout()}>Start workout</button>{todayState.remainingFlexibleRest > 0 && <button className="text-button" type="button" onClick={() => void mutate({ method: 'POST', path: '/gym/rest', body: { date: todayKey, kind: 'flexible' } })}>Make today a rest day</button>}</>}
    </article>
    <div className="gym-status-grid"><article><p className="eyebrow">Momentum</p><strong>{streak.current} session{streak.current === 1 ? '' : 's'}</strong><small>Best {streak.best}</small></article><article><p className="eyebrow">Streak Anchor</p><strong>{gym.safe.stored ? 'Anchor ready' : `${gym.safe.qualifyingCount}/7 grown`}</strong><small>{gym.safe.stored ? 'One missed session is protected' : 'Qualifying workouts set your Anchor'}</small></article></div>
    <GymProgress goals={snapshot.goals} entries={snapshot.progressEntries} proofs={snapshot.proofs} weightUnit={weightUnit} protectedGoalIds={gym.plans.map(plan => plan.primaryGoalId)} onCreateGoal={createGymGoal} onCreateEntry={saveProgressEntry} onAddProof={addProof ? saveProgressProof : undefined} onDeleteGoal={async goal => { await mutate({ method: 'DELETE', path: `/goals/${goal.id}` }); }} onDeleteWorkout={async entry => { await mutate({ method: 'DELETE', path: `/gym/workouts/${entry.id}` }); }} />
    <section className="gym-routines"><header><div><p className="eyebrow">Reusable training</p><h2>Routines</h2></div><button type="button" onClick={() => { setEditingRoutine(undefined); setRoutineOpen(true); }}>Create routine</button></header>
      {gym.routines.map(routine => <article key={routine.id}><div><strong>{routine.name}</strong><small>{routine.exercises.length} exercises</small></div><button type="button" onClick={() => startWorkout(routine)}>Start {routine.name}</button><button className="text-button" type="button" onClick={() => { setEditingRoutine(routine); setRoutineOpen(true); }}>Edit</button></article>)}
    </section>
    {onSaveContext && <GymPlaces places={snapshot.user.gymPlaces ?? []} contextualAmbience={snapshot.user.contextualAmbience ?? false} onSave={onSaveContext} />}
    <Sheet open={routineOpen} title={editingRoutine ? 'Edit routine' : 'New routine'} onClose={() => setRoutineOpen(false)}><GymRoutineEditor routine={editingRoutine} position={editingRoutine?.position ?? gym.routines.length} onSave={saveRoutine} onCancel={() => setRoutineOpen(false)} /></Sheet>
  </section>;
}

function dayLabel(state: GymDayState) {
  return state.kind === 'complete' ? 'Workout complete' : state.kind === 'rest' ? 'Planned rest' : state.kind === 'training' ? 'Training day' : 'Open day';
}

function stoneMark(state: GymDayState) {
  return state.kind === 'complete' ? '✓' : state.kind === 'rest' ? '◡' : state.kind === 'training' ? '●' : '·';
}

function readSafeSettlement(key: string) {
  try { return sessionStorage.getItem(key); }
  catch { return safeSettlementFallback?.key === key ? safeSettlementFallback.date : null; }
}

function writeSafeSettlement(key: string, date: string) {
  try { sessionStorage.setItem(key, date); }
  catch { safeSettlementFallback = { key, date }; }
}

function clearSafeSettlement(key: string, expected?: string) {
  try {
    if (!expected || sessionStorage.getItem(key) === expected) sessionStorage.removeItem(key);
  } catch {
    if (safeSettlementFallback?.key === key && (!expected || safeSettlementFallback.date === expected)) safeSettlementFallback = null;
  }
}

function hasActiveWorkout(userId: string) {
  return readActiveWorkout(userId) !== null;
}

function activeWorkoutRoutineId(userId: string): string | null {
  return readActiveWorkout(userId)?.draft.routineId ?? null;
}

function discardLegacyActiveWorkout() {
  try { localStorage.removeItem(ACTIVE_WORKOUT_KEY); } catch { /* private browsing can deny storage */ }
}
