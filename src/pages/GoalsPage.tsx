import { useMemo, useState } from 'react';
import { CameraCapture } from '../components/CameraCapture';
import { Field } from '../components/Field';
import { Sheet } from '../components/Sheet';
import type { Goal, LifeArea, Milestone, ProgressEntry } from '../domain/types';

const areaMeta: Record<LifeArea, { label: string; icon: string }> = {
  fitness: { label: 'Fitness', icon: '◒' }, learning: { label: 'Learning', icon: '✦' }, work: { label: 'Work', icon: '◇' },
  money: { label: 'Money', icon: '◌' }, wellbeing: { label: 'Wellbeing', icon: '≈' }, home: { label: 'Home', icon: '⌂' },
};

export type LegacyGoalDraft = Pick<Goal, 'title' | 'description' | 'area' | 'trackingType' | 'targetValue' | 'unit' | 'deadline' | 'color'>;
export type GoalDraft = LegacyGoalDraft;
export type ProgressDraft = Pick<ProgressEntry, 'entryType' | 'metric' | 'value' | 'durationMinutes' | 'details' | 'note' | 'occurrenceAt'>;

export function GoalsPage({ goals, milestones, progressEntries, enabledAreas, onCreateGoal, onAddProgress }: {
  goals: Goal[]; milestones: Milestone[]; progressEntries: ProgressEntry[]; enabledAreas: LifeArea[];
  onCreateGoal(value: GoalDraft): Promise<void>; onAddProgress(goal: Goal, value: ProgressDraft, proof?: File): Promise<void>;
}) {
  const [area, setArea] = useState<LifeArea | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [logging, setLogging] = useState<'progress' | 'workout' | null>(null);
  const selected = goals.find(goal => goal.id === selectedId) ?? null;
  const visible = goals.filter(goal => goal.status === 'active' && (!area || goal.area === area));

  if (selected) return <GoalDetail goal={selected} milestones={milestones.filter(item => item.goalId === selected.id)} entries={progressEntries.filter(item => item.goalId === selected.id)} onBack={() => setSelectedId(null)} onLog={setLogging}>
    <Sheet open={!!logging} title={logging === 'workout' ? 'Workout proof' : 'Log progress'} onClose={() => setLogging(null)}>
      {logging && <ProgressForm goal={selected} workout={logging === 'workout'} onCancel={() => setLogging(null)} onSave={async (value, proof) => { await onAddProgress(selected, value, proof); setLogging(null); }} />}
    </Sheet>
  </GoalDetail>;

  return <section className="goals-page">
    <header className="goals-header"><div><p className="eyebrow">Life in motion</p><h1>Goals</h1></div><button className="small-add" onClick={() => setAdding(true)} aria-label="Add goal">＋</button></header>
    <section className="life-map" aria-label="Life balance"><div><strong>Life balance</strong><small>Choose an area to focus the view</small></div><div className="life-orbit">
      {(Object.keys(areaMeta) as LifeArea[]).map(item => <button key={item} className={enabledAreas.includes(item) ? 'enabled' : ''} aria-label={areaMeta[item].label} aria-pressed={area === item} onClick={() => setArea(area === item ? null : item)}><span>{areaMeta[item].icon}</span></button>)}
    </div></section>
    <div className="goal-list">{visible.map(goal => <GoalCard key={goal.id} goal={goal} onOpen={() => setSelectedId(goal.id)} />)}</div>
    {visible.length === 0 && <div className="calm-empty"><span>◎</span><h2>{area ? `No ${areaMeta[area].label.toLowerCase()} goal yet` : 'A clear horizon'}</h2><p>Pick one meaningful direction. You can add the rest later.</p></div>}
    <Sheet open={adding} title="New goal" onClose={() => setAdding(false)}><GoalForm initialArea={area ?? enabledAreas[0] ?? 'wellbeing'} onCancel={() => setAdding(false)} onSave={async value => { await onCreateGoal(value); setAdding(false); }} /></Sheet>
  </section>;
}

function GoalCard({ goal, onOpen }: { goal: Goal; onOpen(): void }) {
  const percent = Math.min(100, Math.round(goal.currentValue / goal.targetValue * 100));
  return <button className="goal-card" onClick={onOpen} aria-label={`${goal.title}, ${percent}% complete`} style={{ '--goal-color': goal.color } as React.CSSProperties}>
    <span className="goal-area">{areaMeta[goal.area].icon}</span><div><small>{areaMeta[goal.area].label}</small><h2>{goal.title}</h2><div className="goal-progress"><i style={{ width: `${percent}%` }} /></div></div><strong>{percent}%</strong>
  </button>;
}

function GoalDetail({ goal, milestones, entries, onBack, onLog, children }: { goal: Goal; milestones: Milestone[]; entries: ProgressEntry[]; onBack(): void; onLog(value: 'progress' | 'workout'): void; children: React.ReactNode }) {
  const percent = Math.min(100, Math.round(goal.currentValue / goal.targetValue * 100));
  const weights = entries.map(entry => Number(entry.details.weight ?? 0)).filter(Boolean);
  const record = Math.max(0, ...weights);
  return <section className="goal-detail">
    <button className="back-button" onClick={onBack}>‹ All goals</button>
    <p className="eyebrow">{areaMeta[goal.area].label}</p><h1>{goal.title}</h1>{goal.description && <p className="goal-description">{goal.description}</p>}
    <div className="goal-meter"><div><strong>{goal.currentValue}</strong><span> / {goal.targetValue} {goal.unit}</span></div><em>{percent}%</em><i><span style={{ width: `${percent}%`, background: goal.color }} /></i></div>
    {goal.area === 'fitness' && <section className="strength-bloom"><div className="bloom" aria-hidden="true">{[0, 1, 2, 3, 4, 5].map(petal => <i key={petal} style={{ transform: `rotate(${petal * 60}deg) translateY(-12px)` }} />)}<span>↗</span></div><div><small>Strength swell</small><strong>{record ? `${record} kg best` : 'Ready for your first lift'}</strong><p>Each proof raises this record.</p></div></section>}
    <div className="progress-actions"><button className="primary-button" onClick={() => onLog('progress')}>Log progress</button>{goal.area === 'fitness' && <button className="workout-button" onClick={() => onLog('workout')}>Log workout</button>}</div>
    {entries.length > 0 && <section className="progress-history"><h2>Recent momentum</h2><div className="mini-chart" aria-label="Recent progress">{entries.slice(-8).map(entry => <i key={entry.id} title={`${entry.value} ${goal.unit}`} style={{ height: `${Math.max(12, Math.min(100, entry.value / Math.max(...entries.map(item => item.value), 1) * 100))}%` }} />)}</div></section>}
    {milestones.length > 0 && <section className="milestone-list"><h2>Milestones</h2>{milestones.map(item => <p key={item.id}><span>{item.completedAt ? '✓' : '○'}</span>{item.label}<small>{item.targetValue} {goal.unit}</small></p>)}</section>}
    {children}
  </section>;
}

function GoalForm({ initialArea, onSave, onCancel }: { initialArea: LifeArea; onSave(value: LegacyGoalDraft): Promise<void>; onCancel(): void }) {
  const [busy, setBusy] = useState(false);
  return <form className="goal-form" onSubmit={async event => { event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); try { await onSave({ title: String(data.get('title')), description: String(data.get('description') ?? ''), area: String(data.get('area')) as LifeArea, trackingType: 'count', targetValue: Number(data.get('target')), unit: String(data.get('unit') || 'times'), deadline: data.get('deadline') ? String(data.get('deadline')) : null, color: '#1FA3A0' }); } finally { setBusy(false); } }}>
    <Field label="Goal title"><input name="title" required maxLength={160} autoFocus /></Field>
    <Field label="Life area"><select name="area" defaultValue={initialArea}>{(Object.keys(areaMeta) as LifeArea[]).map(item => <option key={item} value={item}>{areaMeta[item].label}</option>)}</select></Field>
    <div className="split-fields"><Field label="Target"><input name="target" type="number" min="0.01" step="any" defaultValue="10" required /></Field><Field label="Unit"><input name="unit" defaultValue="times" /></Field></div>
    <Field label="Why it matters"><textarea name="description" maxLength={1000} /></Field><Field label="Target date"><input name="deadline" type="date" /></Field>
    <div className="form-actions"><button className="text-button" type="button" onClick={onCancel}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Creating…' : 'Create goal'}</button></div>
  </form>;
}

function ProgressForm({ goal, workout, onSave, onCancel }: { goal: Goal; workout: boolean; onSave(value: ProgressDraft, proof?: File): Promise<void>; onCancel(): void }) {
  const [busy, setBusy] = useState(false);
  const [proof, setProof] = useState<File>();
  const [proofError, setProofError] = useState(false);
  const defaultMetric = useMemo(() => goal.unit || 'progress', [goal.unit]);
  return <form className="goal-form" onSubmit={async event => { event.preventDefault(); const data = new FormData(event.currentTarget); if (workout && !proof) { setProofError(true); return; } setProofError(false); setBusy(true); try {
    const weight = Number(data.get('weight') ?? 0);
    await onSave({ entryType: workout ? 'workout' : areaEntryType(goal.area), metric: workout ? 'workout' : defaultMetric, value: workout ? 1 : Number(data.get('value')), durationMinutes: data.get('duration') ? Number(data.get('duration')) : null, details: workout ? { workout: String(data.get('workout')), exercise: String(data.get('exercise')), sets: Number(data.get('sets')), reps: Number(data.get('reps')), weight } : {}, note: String(data.get('note') ?? ''), occurrenceAt: new Date().toISOString() }, proof);
  } finally { setBusy(false); } }}>
    {workout ? <><Field label="Workout"><input name="workout" required autoFocus placeholder="Upper body" /></Field><Field label="Exercise"><input name="exercise" required placeholder="Bench press" /></Field><div className="set-grid"><Field label="Sets"><input name="sets" type="number" min="1" defaultValue="3" /></Field><Field label="Reps"><input name="reps" type="number" min="1" defaultValue="8" /></Field><Field label="Weight"><input name="weight" type="number" min="0" step="0.1" defaultValue="0" /></Field></div><Field label="Minutes"><input name="duration" type="number" min="1" max="1440" defaultValue="45" /></Field><section className="goal-camera"><strong>Workout proof photo</strong><small>Required — the workout counts after this is saved</small><CameraCapture busy={busy} onSave={setProof} onDiscard={() => setProof(undefined)} /></section>{proofError && <p className="form-error">Add a photo so this workout can count.</p>}</> : <><Field label={`Progress (${goal.unit || 'amount'})`}><input name="value" type="number" min="0" step="any" required autoFocus /></Field><Field label="Note"><textarea name="note" placeholder={areaPrompt(goal.area)} /></Field><section className="goal-camera"><strong>Memory photo</strong><small>Optional and private</small><CameraCapture busy={busy} onSave={setProof} onDiscard={() => setProof(undefined)} /></section></>}
    <div className="form-actions"><button className="text-button" type="button" onClick={onCancel}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : workout ? 'Save workout' : 'Save progress'}</button></div>
  </form>;
}

function areaEntryType(area: LifeArea) { return ({ fitness: 'fitness', learning: 'study', work: 'work', money: 'money', wellbeing: 'wellbeing', home: 'home' } as const)[area]; }
function areaPrompt(area: LifeArea) { return ({ fitness: 'What felt stronger?', learning: 'What did you learn?', work: 'What moved forward?', money: 'What changed?', wellbeing: 'How did it feel?', home: 'What became lighter?' } as const)[area]; }
