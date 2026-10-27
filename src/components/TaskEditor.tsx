import { useState, type FormEvent } from 'react';
import type { Energy, Goal, Priority, Recurrence } from '../domain/types';
import { Field } from './Field';

export type TaskDraft = { title: string; notes: string; priority: Priority; color: string; estimatedMinutes: number; energy: Energy; scheduleDate: string; scheduleTime: string | null; recurrence: Recurrence; goalId: string | null; proofRequired: boolean };

export function TaskEditor({ date, goals, onSave, onCancel }: { date: string; goals: Goal[]; onSave(value: TaskDraft): Promise<void>; onCancel(): void }) {
  const [more, setMore] = useState(false);
  const [recurrence, setRecurrence] = useState<Recurrence['type']>('one_time');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget);
    const scheduleDate = String(form.get('date'));
    const rule: Recurrence = recurrence === 'weekly' ? { type: 'weekly', weekdays: form.getAll('weekday').map(Number) } : recurrence === 'monthly' ? { type: 'monthly', dayOfMonth: Number(form.get('monthDay') || scheduleDate.slice(-2)) } : { type: recurrence };
    try { await onSave({ title: String(form.get('title')), notes: String(form.get('notes') ?? ''), priority: String(form.get('priority') ?? 'medium') as Priority, color: '#2F7FD1', estimatedMinutes: Number(form.get('minutes') ?? 20), energy: String(form.get('energy') ?? 'medium') as Energy, scheduleDate, scheduleTime: form.get('time') ? String(form.get('time')) : null, recurrence: rule, goalId: form.get('goal') ? String(form.get('goal')) : null, proofRequired: form.get('proof') === 'on' }); }
    finally { setBusy(false); }
  };
  return <form className="task-editor" onSubmit={submit}><Field label="Title"><input name="title" autoFocus required maxLength={160} /></Field><Field label="Date"><input name="date" type="date" defaultValue={date} required /></Field>
    <button className="more-button" type="button" onClick={() => setMore(value => !value)}>{more ? 'Fewer options' : 'More options'}</button>
    {more && <div className="advanced-fields"><Field label="Time"><input name="time" type="time" /></Field><Field label="Repeat"><select name="recurrence" value={recurrence} onChange={event => setRecurrence(event.target.value as Recurrence['type'])}><option value="one_time">One time</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></Field>
      {recurrence === 'weekly' && <fieldset className="weekday-picker"><legend>Days</legend>{['S','M','T','W','T','F','S'].map((day, index) => <label key={index}><input type="checkbox" name="weekday" value={index} defaultChecked={index === new Date(date + 'T12:00:00').getDay()} />{day}</label>)}</fieldset>}
      {recurrence === 'monthly' && <Field label="Day of month"><input name="monthDay" type="number" min="1" max="31" defaultValue={Number(date.slice(-2))} /></Field>}
      <div className="split-fields"><Field label="Minutes"><input name="minutes" type="number" min="1" max="1440" defaultValue="20" /></Field><Field label="Energy"><select name="energy" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field></div>
      <Field label="Priority"><select name="priority" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
      {goals.length > 0 && <Field label="Goal"><select name="goal"><option value="">None</option>{goals.map(goal => <option value={goal.id} key={goal.id}>{goal.title}</option>)}</select></Field>}
      <Field label="Notes"><textarea name="notes" /></Field><label className="proof-toggle"><input aria-label="Proof required" name="proof" type="checkbox" /> <span><strong>Proof required</strong><small>Ask for a photo before this counts</small></span></label>
    </div>}
    <div className="form-actions"><button type="button" className="text-button" onClick={onCancel}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Adding…' : 'Add task'}</button></div>
  </form>;
}
