import { useMemo, useState } from 'react';
import { addDays } from 'date-fns';
import { learnedFocusWindow, lightenCandidates, parseMindSweep } from '../domain/garden';
import { dateKey } from '../domain/schedule';
import type { DailyCheckin, Energy, Task, TaskCompletion, User } from '../domain/types';
import { Sheet } from './Sheet';
import { WellnessTools } from './WellnessTools';

type Preferences = Pick<User, 'focusWindow'>;
type PlantedTask = { title: string; scheduleDate: string };

export function DailyRituals({ today, scheduled, completions, checkin, preferences, onCheckin, onSaveMorning, onCreateTasks, onMoveTasks, onSaveEvening }: {
  today: Date; scheduled: Task[]; completions: TaskCompletion[]; checkin: DailyCheckin | null; preferences: Preferences;
  onCheckin(energy: Energy): Promise<void>; onSaveMorning(value: { intention: string; energy: Energy; mood: 2 | 3 | 5 }): Promise<void>;
  onCreateTasks(tasks: PlantedTask[]): Promise<void>; onMoveTasks(tasks: Task[], date: string): Promise<void>; onSaveEvening(value: { win: string; gratitude: string }): Promise<void>;
}) {
  const [morningOpen, setMorningOpen] = useState(false);
  const [energy, setEnergy] = useState<Energy>(checkin?.energy ?? 'medium');
  const [sweepOpen, setSweepOpen] = useState(false);
  const [sweep, setSweep] = useState('');
  const [targetDate, setTargetDate] = useState(dateKey(today));
  const [lightenOpen, setLightenOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [eveningOpen, setEveningOpen] = useState(false);
  const [wellnessOpen, setWellnessOpen] = useState(false);
  const [seedAdded, setSeedAdded] = useState(false);
  const tomorrow = dateKey(addDays(today, 1));
  const planted = useMemo(() => parseMindSweep(sweep, targetDate), [sweep, targetDate]);
  const candidates = useMemo(() => lightenCandidates(scheduled, completions, dateKey(today)), [completions, scheduled, today]);
  const completed = scheduled.filter(task => completions.some(item => item.taskId === task.id && item.occurrenceDate === dateKey(today) && item.status !== 'pending_proof')).length;
  const canLighten = candidates.length > 0 && (checkin?.energy === 'low' || scheduled.length >= 6);
  const canClose = today.getHours() >= 18 || (scheduled.length > 0 && completed === scheduled.length);
  const rhythm = preferences.focusWindow === 'learn' ? learnedFocusWindow(completions, today) : preferences.focusWindow;
  const seedIsTask = !!checkin?.intention && (seedAdded || scheduled.some(task => task.title.trim().toLowerCase() === checkin.intention.trim().toLowerCase()));
  const chooseEnergy = (next: Energy) => { setEnergy(next); if (checkin?.intention) void onCheckin(next); };

  return <section className="daily-rituals">
    {!checkin?.intention ? <div className={`morning-seed ${morningOpen ? 'open' : ''}`}>{!morningOpen ? <button aria-label="Set morning heading" onClick={() => setMorningOpen(true)}><span aria-hidden="true">✦</span><span><strong>Set morning heading</strong><small>Choose how today should feel.</small></span><b aria-hidden="true">＋</b></button> : <form onSubmit={async event => { event.preventDefault(); const data = new FormData(event.currentTarget); const intention = String(data.get('intention')).trim(); await onSaveMorning({ intention, energy, mood: energy === 'high' ? 5 : energy === 'medium' ? 3 : 2 }); await onCreateTasks([{ title: intention, scheduleDate: dateKey(today) }]); setSeedAdded(true); setMorningOpen(false); }}><label><span>Today I want to</span><input name="intention" required maxLength={280} autoFocus placeholder="Protect one meaningful thing" /></label><EnergyButtons value={energy} onChoose={chooseEnergy} /><button className="ritual-save">Add as today’s task</button></form>}</div> : <div className="saved-seed"><span aria-hidden="true">✦</span><p><small>Today’s heading</small>{checkin.intention}</p>{!seedIsTask && <button className="seed-task-button" type="button" onClick={async () => { await onCreateTasks([{ title: checkin.intention, scheduleDate: dateKey(today) }]); setSeedAdded(true); }}>Add as task</button>}<EnergyButtons value={energy} onChoose={chooseEnergy} /></div>}
    <div className="ritual-tools"><button onClick={() => setSweepOpen(true)}><span aria-hidden="true">⌁</span>Mind sweep</button><button onClick={() => setWellnessOpen(true)}><span aria-hidden="true">◌</span>Focus & calm</button>{canLighten && <button onClick={() => setLightenOpen(true)}><span aria-hidden="true">↗</span>Lighten my day</button>}{canClose && !checkin?.win && !checkin?.gratitude && <button onClick={() => setEveningOpen(true)}><span aria-hidden="true">◇</span>Log evening watch</button>}</div>
    {rhythm && <p className="rhythm-note"><span aria-hidden="true">◌</span>You often finish best in the {rhythm}.</p>}

    <Sheet open={sweepOpen} title="Mind sweep" onClose={() => setSweepOpen(false)}><form className="ritual-form" onSubmit={async event => { event.preventDefault(); if (!planted.length) return; await onCreateTasks(planted); setSweep(''); setSweepOpen(false); }}><p>One thought per line. We’ll turn the noise into tiny tasks.</p><label><span>What is on your mind?</span><textarea value={sweep} onChange={event => setSweep(event.target.value)} maxLength={2200} autoFocus /></label><fieldset><legend>Add for</legend><label><input type="radio" name="sweep-day" checked={targetDate === dateKey(today)} onChange={() => setTargetDate(dateKey(today))} />Today</label><label><input type="radio" name="sweep-day" checked={targetDate === tomorrow} onChange={() => setTargetDate(tomorrow)} />Tomorrow</label></fieldset><button className="primary-button" disabled={!planted.length}>Add {planted.length} task{planted.length === 1 ? '' : 's'}</button></form></Sheet>
    <Sheet open={lightenOpen} title="Lighten my day" onClose={() => setLightenOpen(false)}><form className="ritual-form" onSubmit={async event => { event.preventDefault(); const moving = candidates.filter(task => selected.includes(task.id)); if (!moving.length) return; await onMoveTasks(moving, tomorrow); setSelected([]); setLightenOpen(false); }}><p>Move only what can wait. Timed, repeating, and important tasks stay put.</p><div className="lighten-list">{candidates.map(task => <label key={task.id}><input type="checkbox" checked={selected.includes(task.id)} onChange={() => setSelected(value => value.includes(task.id) ? value.filter(id => id !== task.id) : [...value, task.id])} />{task.title}</label>)}</div><button className="primary-button" disabled={!selected.length}>Move {selected.length} to tomorrow</button></form></Sheet>
    <Sheet open={eveningOpen} title="Evening watch" onClose={() => setEveningOpen(false)}><form className="ritual-form" onSubmit={async event => { event.preventDefault(); const data = new FormData(event.currentTarget); await onSaveEvening({ win: String(data.get('win')).trim(), gratitude: String(data.get('gratitude')).trim() }); setEveningOpen(false); }}><p>Close the day with two small lights.</p><label><span>A win from today</span><input name="win" required maxLength={280} /></label><label><span>Something I appreciate</span><input name="gratitude" required maxLength={280} /></label><button className="primary-button">Save evening watch</button></form></Sheet>
    <Sheet open={wellnessOpen} title="Focus & calm" onClose={() => setWellnessOpen(false)}><WellnessTools /></Sheet>
  </section>;
}

function EnergyButtons({ value, onChoose }: { value: Energy; onChoose(value: Energy): void }) {
  return <div className="energy-strip"><span>Energy</span>{(['low', 'medium', 'high'] as const).map(item => <button type="button" className={value === item ? 'selected' : ''} aria-pressed={value === item} key={item} onClick={() => onChoose(item)}>{item === 'low' ? 'Soft' : item === 'medium' ? 'Steady' : 'Bright'}</button>)}</div>;
}
