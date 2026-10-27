import { format, parseISO } from 'date-fns';
import { useEffect, useRef, useState } from 'react';
import { gymPersonalRecords } from '../domain/gym';
import type { Goal, GymGoalType, ProgressEntry, ProofPhoto } from '../domain/types';
import { CameraCapture } from './CameraCapture';
import { Field } from './Field';
import { Sheet } from './Sheet';

type Cadence = 'weekly' | 'biweekly' | 'monthly';
type WeightUnit = 'kg' | 'lb';
type MeasurementUnit = 'cm' | 'in';
type Direction = 'build_muscle' | 'lose_fat' | 'recomposition' | 'definition';
type PhysiqueAngle = 'front' | 'side' | 'back';

export type GymGoalDraft =
  | { title: string; gymType: 'physique'; targetValue: number; unit: string; deadline: null; settings: { direction: Direction; checkinCadence: Cadence; targetWeight?: number; targetBodyFat?: number; targetWaist?: number } }
  | { title: string; gymType: 'strength_pr'; targetValue: number; unit: WeightUnit; deadline: string | null; settings: { exercise: string; baselineLoad: number; baselineReps: number; targetLoad: number; targetReps: number; weightUnit: WeightUnit; targetDate?: string } }
  | { title: string; gymType: 'body_measurements'; targetValue: number; unit: MeasurementUnit; deadline: null; settings: { metrics: string[]; targets: Record<string, number>; weightUnit: WeightUnit; measurementUnit: MeasurementUnit; checkinCadence: Cadence } }
  | { title: string; gymType: 'workout_consistency'; targetValue: number; unit: 'sessions/week'; deadline: null; settings: { weeklySessionTarget: number; minimumDurationMinutes?: number; trainingWeekdays: number[]; scheduleMode: 'fixed' | 'flexible' } };
export type GymProgressDraft = Pick<ProgressEntry, 'entryType' | 'metric' | 'value' | 'durationMinutes' | 'details' | 'note' | 'occurrenceAt'>;
export type GymProgressProof = { angle: PhysiqueAngle; photo: File };

const cards: Array<{ type: GymGoalType; title: string; hint: string }> = [
  { type: 'physique', title: 'Physique', hint: 'Private check-ins, never appearance scores' },
  { type: 'strength_pr', title: 'Strength / PR', hint: 'A clear lift and working-set target' },
  { type: 'body_measurements', title: 'Body measurements', hint: 'Track only the measurements you choose' },
  { type: 'workout_consistency', title: 'Workout consistency', hint: 'A weekly rhythm that fits real life' },
];
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const measurements = [['weight', 'Weight'], ['body_fat', 'Body fat'], ['waist', 'Waist'], ['chest', 'Chest'], ['arms', 'Arms'], ['hips', 'Hips'], ['thighs', 'Thighs'], ['custom', 'Custom']] as const;

export function GymProgress({ goals, entries, proofs, weightUnit, protectedGoalIds, onCreateGoal, onCreateEntry, onAddProof, onDeleteGoal, onDeleteWorkout }: { goals: Goal[]; entries: ProgressEntry[]; proofs: ProofPhoto[]; weightUnit: WeightUnit; protectedGoalIds: string[]; onCreateGoal(value: GymGoalDraft): Promise<void>; onCreateEntry(goal: Goal, id: string, value: GymProgressDraft): Promise<void>; onAddProof?(id: string, proof: GymProgressProof): Promise<void>; onDeleteGoal(goal: Goal): Promise<void>; onDeleteWorkout(entry: ProgressEntry): Promise<void> }) {
  const [selectedProof, setSelectedProof] = useState<{ proof: ProofPhoto; title: string; alt: string } | null>(null);
  const [logging, setLogging] = useState<Goal | null>(null);
  const [creating, setCreating] = useState(false);
  const [trendMetric, setTrendMetric] = useState('');
  const submittedGoalIds = useRef(new Set<string>());
  const [deletingGoalIds, setDeletingGoalIds] = useState(new Set<string>());
  const [goalErrors, setGoalErrors] = useState<Record<string, string>>({});
  const records = gymPersonalRecords(entries);
  const workouts = entries.filter(entry => entry.entryType === 'workout').sort((a, b) => b.occurrenceAt.localeCompare(a.occurrenceAt));
  const physiqueCheckins = entries.filter(entry => entry.entryType === 'physique_checkin').sort((a, b) => b.occurrenceAt.localeCompare(a.occurrenceAt));
  const guidedGoals = goals.filter(goal => goal.status === 'active' && goal.gymType);
  const measurementEntries = entries.filter(entry => entry.entryType === 'measurement').sort((a, b) => a.occurrenceAt.localeCompare(b.occurrenceAt));
  const trendMetrics = [...new Set(measurementEntries.map(entry => entry.metric))];
  const selectedMetric = trendMetrics.includes(trendMetric) ? trendMetric : trendMetrics[0];
  const trend = measurementEntries.filter(entry => entry.metric === selectedMetric);
  useEffect(() => {
    const present = new Set(goals.map(goal => goal.id));
    const retained = new Set([...submittedGoalIds.current].filter(id => present.has(id)));
    if (retained.size === submittedGoalIds.current.size) return;
    submittedGoalIds.current = retained;
    setDeletingGoalIds(retained);
    setGoalErrors(current => Object.fromEntries(Object.entries(current).filter(([id]) => present.has(id))));
  }, [goals]);

  async function removeGoal(goal: Goal) {
    if (submittedGoalIds.current.has(goal.id) || !window.confirm(`Remove ${goal.title}?`)) return;
    submittedGoalIds.current.add(goal.id);
    setDeletingGoalIds(current => new Set(current).add(goal.id));
    setGoalErrors(current => { const next = { ...current }; delete next[goal.id]; return next; });
    try {
      await onDeleteGoal(goal);
    } catch (caught) {
      submittedGoalIds.current.delete(goal.id);
      setDeletingGoalIds(current => { const next = new Set(current); next.delete(goal.id); return next; });
      setGoalErrors(current => ({ ...current, [goal.id]: caught instanceof Error ? caught.message : 'Could not remove this goal.' }));
    }
  }

  return <section className="gym-progress" aria-label="Progress harbor">
    <header><div><p className="eyebrow">Progress harbor</p><h2>What is rising</h2></div><button type="button" onClick={() => setCreating(true)}>Add gym goal</button></header>
    {guidedGoals.length > 0 && <div className="gym-guided-goals">{guidedGoals.map(goal => {
      const protectedGoal = protectedGoalIds.includes(goal.id);
      const empty = !entries.some(entry => entry.goalId === goal.id);
      const deleting = deletingGoalIds.has(goal.id);
      return <article key={goal.id}><div><small>{protectedGoal ? 'Gym plan goal' : 'Guided goal'}</small><strong>{goal.title}</strong></div>{goal.gymType === 'body_measurements' && <button type="button" onClick={() => setLogging(goal)}>Log measurement</button>}{goal.gymType === 'physique' && <button type="button" onClick={() => setLogging(goal)}>Add physique check-in</button>}{!protectedGoal && empty && <>{goalErrors[goal.id] && <p className="form-error" role="alert">{goalErrors[goal.id]}</p>}<button className="text-button danger" type="button" aria-label={`Remove ${goal.title}`} disabled={deleting} onClick={() => void removeGoal(goal)}>{deleting ? 'Removing…' : 'Remove'}</button></>}</article>;
    })}</div>}
    <div className="gym-records">{Object.entries(records).map(([exercise, record]) => <article key={exercise}><small>Personal record</small><strong>{titleCase(exercise)}</strong><span>{record.load} {weightUnit} × {record.reps}</span></article>)}{Object.keys(records).length === 0 && <p className="gym-progress-empty">Working-set records will surface here.</p>}</div>
    {trend.length > 0 && <section className="gym-metric-trend"><Field label="Trend metric"><select value={selectedMetric} onChange={event => setTrendMetric(event.target.value)}>{trendMetrics.map(metric => <option key={metric} value={metric}>{titleCase(metric.replaceAll('_', ' '))}</option>)}</select></Field><p>{trendSummary(trend)}</p></section>}
    {workouts.length > 0 && <div className="gym-workout-history"><h3>Recent workouts</h3>{workouts.map(entry => {
      const routineName = String(entry.details.routineName || 'Open');
      const proof = proofs.find(item => item.ownerType === 'progress' && item.ownerId === entry.id);
      return <article key={entry.id}><div><strong>{routineName} workout</strong><small>{entryDate(entry)}{entry.durationMinutes ? ` · ${entry.durationMinutes} min` : ''}{setSummary(entry)}</small></div>{proof && <button type="button" aria-label={`Open proof from ${routineName} workout`} onClick={() => setSelectedProof({ proof, title: 'Workout proof', alt: 'Workout proof' })}><img src={proof.imageUrl} alt="" /></button>}<button className="text-button danger" type="button" aria-label={`Delete ${routineName} workout`} onClick={() => { if (window.confirm('Delete this workout and its proof?')) void onDeleteWorkout(entry); }}>Delete</button></article>;
    })}</div>}
    {physiqueCheckins.length > 0 && <div className="gym-physique-history"><h3>Physique check-ins</h3>{physiqueCheckins.map(entry => {
      const angles = Array.isArray(entry.details.photoAngles) ? entry.details.photoAngles.filter(isPhysiqueAngle) : [];
      const savedProofs = proofs.filter(proof => proof.ownerType === 'progress' && proof.ownerId === entry.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return <article key={entry.id}><div><strong>{entryDate(entry)}</strong><small>{savedProofs.length} private view{savedProofs.length === 1 ? '' : 's'}</small></div><div className="gym-physique-photos">{savedProofs.map((proof, index) => {
        const angle = angles[index];
        const view = angle ? `${angle} view` : `view ${index + 1}`;
        const alt = angle ? `${titleCase(angle)} physique check-in` : `Physique check-in view ${index + 1}`;
        return <button type="button" key={proof.id} aria-label={`Open ${view} from physique check-in`} onClick={() => setSelectedProof({ proof, title: 'Physique check-in', alt })}><img src={proof.imageUrl} alt="" /></button>;
      })}</div></article>;
    })}</div>}
    <Sheet open={creating} title="New gym goal" onClose={() => setCreating(false)}><GymGoalForm unavailableTypes={guidedGoals.map(goal => goal.gymType!)} onCancel={() => setCreating(false)} onSave={async value => { await onCreateGoal(value); setCreating(false); }} /></Sheet>
    <Sheet open={!!logging} title={logging?.gymType === 'physique' ? 'Physique check-in' : 'Log measurement'} onClose={() => setLogging(null)}>{logging?.gymType === 'body_measurements' ? <MeasurementForm goal={logging} onCancel={() => setLogging(null)} onSave={async value => { await onCreateEntry(logging, crypto.randomUUID(), value); setLogging(null); }} /> : logging?.gymType === 'physique' ? <PhysiqueCheckinForm onCancel={() => setLogging(null)} onCreateEntry={(id, value) => onCreateEntry(logging, id, value)} onAddProof={onAddProof} onComplete={() => setLogging(null)} /> : null}</Sheet>
    <Sheet open={!!selectedProof} title={selectedProof?.title ?? 'Proof'} onClose={() => setSelectedProof(null)}>{selectedProof && <div className="proof-memory"><img src={selectedProof.proof.imageUrl} alt={selectedProof.alt} /></div>}</Sheet>
  </section>;
}

function MeasurementForm({ goal, onSave, onCancel }: { goal: Goal; onSave(value: GymProgressDraft): Promise<void>; onCancel(): void }) {
  const settings = goal.gymSettings ?? {};
  const metrics = Array.isArray(settings.metrics) ? settings.metrics.map(String) : ['weight'];
  const [metric, setMetric] = useState(metrics[0] ?? 'weight');
  const [busy, setBusy] = useState(false);
  const unit = metric === 'weight' ? String(settings.weightUnit ?? 'kg') : metric === 'body_fat' ? '%' : String(settings.measurementUnit ?? 'cm');
  return <form className="gym-progress-entry" onSubmit={async event => { event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); try { await onSave({ entryType: 'measurement', metric, value: Number(data.get('value')), durationMinutes: null, details: { unit }, note: String(data.get('note') ?? ''), occurrenceAt: new Date().toISOString() }); } finally { setBusy(false); } }}>
    <Field label="Measurement"><select value={metric} onChange={event => setMetric(event.target.value)}>{metrics.map(value => <option value={value} key={value}>{titleCase(value.replaceAll('_', ' '))}</option>)}</select></Field><Field label="Measurement value"><input name="value" type="number" min="0" step="any" required autoFocus /></Field><p className="gym-entry-unit">Unit: {unit}</p><Field label="Note"><textarea name="note" /></Field><div className="form-actions"><button className="text-button" type="button" onClick={onCancel}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save measurement'}</button></div>
  </form>;
}

function PhysiqueCheckinForm({ onCreateEntry, onAddProof, onComplete, onCancel }: { onCreateEntry(id: string, value: GymProgressDraft): Promise<void>; onAddProof?(id: string, proof: GymProgressProof): Promise<void>; onComplete(): void; onCancel(): void }) {
  const angles = ['front', 'side', 'back'] as const;
  const [angle, setAngle] = useState<(typeof angles)[number]>('front');
  const [photos, setPhotos] = useState<Partial<Record<(typeof angles)[number], File>>>({});
  const [entryId] = useState(() => crypto.randomUUID());
  const [occurrenceAt] = useState(() => new Date().toISOString());
  const [entrySaved, setEntrySaved] = useState(false);
  const [uploadedAngles, setUploadedAngles] = useState<PhysiqueAngle[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasPhotos = angles.some(value => !!photos[value]);
  const proofUnavailable = hasPhotos && !onAddProof;
  return <form className="gym-progress-entry" onSubmit={async event => {
    event.preventDefault();
    const saved = angles.flatMap(value => photos[value] ? [{ angle: value, photo: photos[value] }] : []);
    if (saved.length && !onAddProof) { setError('Proof saving is unavailable.'); return; }
    const value: GymProgressDraft = { entryType: 'physique_checkin', metric: 'physique', value: 1, durationMinutes: null, details: { photoAngles: saved.map(item => item.angle) }, note: String(new FormData(event.currentTarget).get('note') ?? ''), occurrenceAt };
    setBusy(true);
    setError(null);
    try {
      if (!entrySaved) { await onCreateEntry(entryId, value); setEntrySaved(true); }
      for (const proof of saved) {
        if (uploadedAngles.includes(proof.angle)) continue;
        await onAddProof!(entryId, proof);
        setUploadedAngles(current => current.includes(proof.angle) ? current : [...current, proof.angle]);
      }
      onComplete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The check-in could not be saved.');
    } finally { setBusy(false); }
  }}>
    <p>Optional private views. No appearance score is created.</p><div className="gym-photo-angles">{angles.map(value => <button type="button" key={value} aria-pressed={angle === value} onClick={() => setAngle(value)}>{titleCase(value)} view{photos[value] ? ' ✓' : ''}</button>)}</div><CameraCapture key={angle} busy={busy} onSave={photo => { setPhotos(current => ({ ...current, [angle]: photo })); const next = angles.find(value => value !== angle && !photos[value]); if (next) setAngle(next); }} onDiscard={() => setPhotos(current => { const next = { ...current }; delete next[angle]; return next; })} /><Field label="Note"><textarea name="note" /></Field>{(proofUnavailable || error) && <p className="form-error">{proofUnavailable ? 'Proof saving is unavailable.' : error}</p>}<div className="form-actions"><button className="text-button" type="button" onClick={onCancel}>Cancel</button><button className="primary-button" disabled={busy || proofUnavailable}>{busy ? 'Saving…' : 'Save physique check-in'}</button></div>
  </form>;
}

export function GymGoalForm({ unavailableTypes = [], onSave, onCancel }: { unavailableTypes?: GymGoalType[]; onSave(value: GymGoalDraft): Promise<void>; onCancel(): void }) {
  const firstAvailable = cards.find(card => !unavailableTypes.includes(card.type))?.type;
  const [type, setType] = useState<GymGoalType>(firstAvailable ?? 'physique');
  const [scheduleMode, setScheduleMode] = useState<'fixed' | 'flexible'>('flexible');
  const [busy, setBusy] = useState(false);

  return <form className="gym-progress-form" onSubmit={async event => {
    event.preventDefault();
    setBusy(true);
    try { await onSave(buildDraft(type, new FormData(event.currentTarget))); }
    finally { setBusy(false); }
  }}>
    <fieldset className="gym-goal-grid"><legend>Choose a guided Fitness goal</legend>{cards.map(card => <label className="gym-goal-card" key={card.type}>
      <input aria-label={card.title} type="radio" name="gymType" value={card.type} disabled={unavailableTypes.includes(card.type)} checked={type === card.type} onChange={() => setType(card.type)} />
      <span aria-hidden="true">{card.type === 'physique' ? '◒' : card.type === 'strength_pr' ? '↗' : card.type === 'body_measurements' ? '⌁' : '✓'}</span><strong>{card.title}</strong><small>{unavailableTypes.includes(card.type) ? 'Already added' : card.hint}</small>
    </label>)}</fieldset>
    {type === 'physique' && <PhysiqueFields />}
    {type === 'strength_pr' && <StrengthFields />}
    {type === 'body_measurements' && <MeasurementFields />}
    {type === 'workout_consistency' && <ConsistencyFields mode={scheduleMode} onMode={setScheduleMode} />}
    <div className="form-actions"><button className="text-button" type="button" onClick={onCancel}>Cancel</button><button className="primary-button" disabled={busy || !firstAvailable}>{busy ? 'Creating…' : 'Create gym goal'}</button></div>
  </form>;
}

function PhysiqueFields() {
  return <div className="gym-guided-fields"><Field label="Direction"><select name="direction" defaultValue="recomposition"><option value="build_muscle">Build muscle</option><option value="lose_fat">Lose fat</option><option value="recomposition">Recomposition</option><option value="definition">Improve definition</option></select></Field>
    <Field label="Check-in cadence"><select name="checkinCadence" defaultValue="weekly"><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="monthly">Monthly</option></select></Field>
    <div className="gym-target-grid"><Field label="Target weight"><input name="targetWeight" type="number" min="0.1" step="0.1" /></Field><Field label="Target body fat"><input name="targetBodyFat" type="number" min="0.1" max="100" step="0.1" /></Field><Field label="Target waist"><input name="targetWaist" type="number" min="0.1" step="0.1" /></Field></div>
  </div>;
}

function StrengthFields() {
  return <div className="gym-guided-fields"><Field label="Exercise"><input name="exercise" required /></Field><div className="gym-target-grid"><Field label="Baseline load"><input name="baselineLoad" type="number" min="0" step="0.1" required /></Field><Field label="Baseline reps"><input name="baselineReps" type="number" min="1" required /></Field><Field label="Target load"><input name="targetLoad" type="number" min="0" step="0.1" required /></Field><Field label="Target reps"><input name="targetReps" type="number" min="1" required /></Field></div><Field label="Weight unit"><select name="weightUnit" defaultValue="kg"><option value="kg">kg</option><option value="lb">lb</option></select></Field><Field label="Target date"><input name="targetDate" type="date" /></Field></div>;
}

function MeasurementFields() {
  const [selected, setSelected] = useState<string[]>(['weight']);
  return <div className="gym-guided-fields"><fieldset className="gym-measure-picker"><legend>Measurements</legend>{measurements.map(([value, label]) => <label key={value}><input type="checkbox" name="metrics" value={value} checked={selected.includes(value)} onChange={event => setSelected(current => event.target.checked ? [...current, value] : current.filter(metric => metric !== value))} /> {label}</label>)}</fieldset>{selected.includes('custom') && <Field label="Custom metric"><input name="customMetric" required /></Field>}<div className="gym-target-grid">{selected.map(metric => <Field key={metric} label={`${metric === 'custom' ? 'Custom' : titleCase(metric.replaceAll('_', ' '))} target`}><input name={`target:${metric}`} type="number" min="0.1" step="any" /></Field>)}</div><div className="gym-unit-grid"><Field label="Weight unit"><select name="weightUnit" defaultValue="kg"><option value="kg">kg</option><option value="lb">lb</option></select></Field><Field label="Measurement unit"><select name="measurementUnit" defaultValue="cm"><option value="cm">cm</option><option value="in">in</option></select></Field></div><Field label="Check-in cadence"><select name="checkinCadence" defaultValue="weekly"><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="monthly">Monthly</option></select></Field></div>;
}

function ConsistencyFields({ mode, onMode }: { mode: 'fixed' | 'flexible'; onMode(value: 'fixed' | 'flexible'): void }) {
  return <div className="gym-guided-fields"><div className="gym-target-grid"><Field label="Sessions per week"><input name="weeklySessionTarget" type="number" min="1" max="7" defaultValue="3" required /></Field><Field label="Minimum duration"><input name="minimumDurationMinutes" type="number" min="1" max="1440" /></Field></div><fieldset className="gym-rest-modes"><legend>Schedule</legend><label><input type="radio" name="scheduleMode" value="fixed" checked={mode === 'fixed'} onChange={() => onMode('fixed')} /> Fixed weekdays</label><label><input type="radio" name="scheduleMode" value="flexible" checked={mode === 'flexible'} onChange={() => onMode('flexible')} /> Flexible weekly target</label></fieldset>{mode === 'fixed' && <fieldset className="gym-weekday-picker"><legend>Training weekdays</legend>{weekdays.map((day, index) => <label key={day}><input type="checkbox" name="trainingWeekdays" value={index} aria-label={`Train ${day}`} />{day.slice(0, 3)}</label>)}</fieldset>}</div>;
}

function buildDraft(type: GymGoalType, data: FormData): GymGoalDraft {
  if (type === 'physique') {
    const optional = optionalNumbers(data, ['targetWeight', 'targetBodyFat', 'targetWaist']);
    return { title: 'Shape my physique', gymType: type, targetValue: optional.targetWeight ?? optional.targetBodyFat ?? optional.targetWaist ?? 1, unit: optional.targetWeight ? 'kg' : optional.targetBodyFat ? '%' : optional.targetWaist ? 'cm' : 'check-ins', deadline: null, settings: { direction: String(data.get('direction')) as Direction, checkinCadence: String(data.get('checkinCadence')) as Cadence, ...optional } };
  }
  if (type === 'strength_pr') {
    const targetLoad = Number(data.get('targetLoad'));
    const weightUnit = String(data.get('weightUnit')) as WeightUnit;
    const targetDate = String(data.get('targetDate') ?? '');
    return { title: 'Build lasting strength', gymType: type, targetValue: targetLoad, unit: weightUnit, deadline: targetDate || null, settings: { exercise: String(data.get('exercise')).trim(), baselineLoad: Number(data.get('baselineLoad')), baselineReps: Number(data.get('baselineReps')), targetLoad, targetReps: Number(data.get('targetReps')), weightUnit, ...(targetDate ? { targetDate } : {}) } };
  }
  if (type === 'body_measurements') {
    const measurementUnit = String(data.get('measurementUnit')) as MeasurementUnit;
    const metrics = data.getAll('metrics').map(String).map(metric => metric === 'custom' ? String(data.get('customMetric')).trim() : metric);
    const targets = Object.fromEntries(metrics.flatMap((metric, index) => data.get(`target:${data.getAll('metrics')[index]}`) ? [[metric, Number(data.get(`target:${data.getAll('metrics')[index]}`))]] : []));
    return { title: 'Track body change', gymType: type, targetValue: Object.values(targets)[0] ?? 1, unit: measurementUnit, deadline: null, settings: { metrics, targets, weightUnit: String(data.get('weightUnit')) as WeightUnit, measurementUnit, checkinCadence: String(data.get('checkinCadence')) as Cadence } };
  }
  const minimumDurationMinutes = Number(data.get('minimumDurationMinutes'));
  const weeklySessionTarget = Number(data.get('weeklySessionTarget'));
  const scheduleMode = String(data.get('scheduleMode')) as 'fixed' | 'flexible';
  return { title: 'Train steadily', gymType: type, targetValue: weeklySessionTarget, unit: 'sessions/week', deadline: null, settings: { weeklySessionTarget, ...(minimumDurationMinutes ? { minimumDurationMinutes } : {}), trainingWeekdays: scheduleMode === 'fixed' ? data.getAll('trainingWeekdays').map(Number) : [], scheduleMode } };
}

function optionalNumbers(data: FormData, names: string[]) {
  return Object.fromEntries(names.flatMap(name => data.get(name) ? [[name, Number(data.get(name))]] : [])) as Record<string, number>;
}

function titleCase(value: string) { return value[0]?.toUpperCase() + value.slice(1); }

function entryDate(entry: ProgressEntry) {
  return format(parseISO(entry.occurrenceAt), 'EEE d MMM');
}

function setSummary(entry: ProgressEntry) {
  const sets = Array.isArray(entry.details.sets) ? entry.details.sets.filter(set => !set.warmup) : [];
  return sets.length ? ` · ${sets.length} working set${sets.length === 1 ? '' : 's'}` : '';
}

function isPhysiqueAngle(value: unknown): value is PhysiqueAngle { return value === 'front' || value === 'side' || value === 'back'; }

function trendSummary(entries: ProgressEntry[]) {
  const first = entries[0];
  const latest = entries[entries.length - 1];
  const unit = String(latest.details.unit ?? first.details.unit ?? '');
  return `First ${first.value} ${unit} · Latest ${latest.value} ${unit} · Change ${latest.value - first.value} ${unit}`;
}
