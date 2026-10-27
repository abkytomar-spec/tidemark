import { useState, type FormEvent } from 'react';
import type { GymGoalType } from '../domain/types';

export type GymSetupDraft = {
  goalType: GymGoalType;
  restMode: 'fixed' | 'flexible';
  fixedRestWeekdays: number[];
  flexibleRestAllowance: 1 | 2;
  trainingWeekdays: number[];
  weightUnit: 'kg' | 'lb';
  measurementUnit: 'cm' | 'in';
};

const goals: Array<{ value: GymGoalType; label: string; copy: string; icon: string }> = [
  { value: 'physique', label: 'Physique', copy: 'Notice steady visual change', icon: '◇' },
  { value: 'strength_pr', label: 'Strength PR', copy: 'Build toward a personal best', icon: '↗' },
  { value: 'body_measurements', label: 'Body measurements', copy: 'Follow meaningful measurements', icon: '○' },
  { value: 'workout_consistency', label: 'Workout consistency', copy: 'Keep a rhythm you can live with', icon: '✦' },
];
const weekdays = [['Sunday', 0], ['Monday', 1], ['Tuesday', 2], ['Wednesday', 3], ['Thursday', 4], ['Friday', 5], ['Saturday', 6]] as const;

export function GymSetup({ onSubmit, onSkip }: { onSubmit(draft: GymSetupDraft): Promise<void>; onSkip(): void }) {
  const [goalType, setGoalType] = useState<GymGoalType | null>(null);
  const [restMode, setRestMode] = useState<'fixed' | 'flexible'>('flexible');
  const [fixedRestWeekdays, setFixedRestWeekdays] = useState<number[]>([]);
  const [trainingWeekdays, setTrainingWeekdays] = useState<number[]>([]);
  const [flexibleRestAllowance, setFlexibleRestAllowance] = useState<1 | 2>(1);
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg');
  const [measurementUnit, setMeasurementUnit] = useState<'cm' | 'in'>('cm');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!goalType || trainingWeekdays.length === 0 || restMode === 'fixed' && fixedRestWeekdays.length === 0) return;
    setSaving(true);
    try { await onSubmit({ goalType, restMode, fixedRestWeekdays: restMode === 'fixed' ? fixedRestWeekdays : [], flexibleRestAllowance, trainingWeekdays, weightUnit, measurementUnit }); }
    finally { setSaving(false); }
  }

  return <form className="gym-setup" onSubmit={submit}>
    <fieldset className="gym-goal-grid">
      <legend>Where are you heading?</legend>
      {goals.map(goal => <label className="gym-goal-card" key={goal.value}>
        <input type="radio" name="gym-goal" value={goal.value} aria-label={goal.label} checked={goalType === goal.value} onChange={() => setGoalType(goal.value)} />
        <span aria-hidden="true">{goal.icon}</span><strong>{goal.label}</strong><small>{goal.copy}</small>
      </label>)}
    </fieldset>
    <fieldset className="gym-rest-modes">
      <legend>How should rest work?</legend>
      <label><input type="radio" name="rest-mode" checked={restMode === 'fixed'} onChange={() => setRestMode('fixed')} /> Fixed rest</label>
      <label><input type="radio" name="rest-mode" checked={restMode === 'flexible'} onChange={() => setRestMode('flexible')} /> Flexible rest</label>
    </fieldset>
    {restMode === 'fixed' ? <WeekdayPicker title="Rest days" prefix="Rest" selected={fixedRestWeekdays} onChange={setFixedRestWeekdays} /> : <label className="field">Flexible rest days each week<select value={flexibleRestAllowance} onChange={event => setFlexibleRestAllowance(Number(event.target.value) as 1 | 2)}><option value="1">One</option><option value="2">Two</option></select></label>}
    <WeekdayPicker title="Training days" prefix="Train" selected={trainingWeekdays} onChange={setTrainingWeekdays} />
    <div className="gym-unit-grid">
      <label className="field">Weight unit<select value={weightUnit} onChange={event => setWeightUnit(event.target.value as 'kg' | 'lb')}><option value="kg">Kilograms</option><option value="lb">Pounds</option></select></label>
      <label className="field">Measurement unit<select value={measurementUnit} onChange={event => setMeasurementUnit(event.target.value as 'cm' | 'in')}><option value="cm">Centimetres</option><option value="in">Inches</option></select></label>
    </div>
    <button className="primary-button" type="submit" disabled={saving || !goalType || trainingWeekdays.length === 0 || restMode === 'fixed' && fixedRestWeekdays.length === 0}>{saving ? 'Creating…' : 'Create gym plan'}</button>
    <button className="text-button" type="button" onClick={onSkip}>Skip for now</button>
  </form>;
}

function WeekdayPicker({ title, prefix, selected, onChange }: { title: string; prefix: string; selected: number[]; onChange(days: number[]): void }) {
  return <fieldset className="gym-weekday-picker"><legend>{title}</legend>{weekdays.map(([name, value]) => <label key={value} title={name}>
    <input type="checkbox" aria-label={`${prefix} ${name}`} checked={selected.includes(value)} onChange={() => onChange(selected.includes(value) ? selected.filter(day => day !== value) : [...selected, value].sort((a, b) => a - b))} />
    {name.slice(0, 2)}
  </label>)}</fieldset>;
}
