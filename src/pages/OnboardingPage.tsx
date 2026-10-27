import { useState, type FormEvent } from 'react';
import { Field } from '../components/Field';
import type { LifeArea, Task } from '../domain/types';

export const onboardingSteps = ['areas', 'first-item', 'first-win', 'install'] as const;
export type OnboardingStep = (typeof onboardingSteps)[number];
const areaOptions: Array<{ id: LifeArea; label: string; icon: string }> = [
  { id: 'fitness', label: 'Fitness', icon: '↗' }, { id: 'learning', label: 'Learning', icon: '◒' },
  { id: 'work', label: 'Work & creative', icon: '✦' }, { id: 'money', label: 'Money', icon: '◇' },
  { id: 'wellbeing', label: 'Wellbeing', icon: '≈' }, { id: 'home', label: 'Home', icon: '⌂' },
];

export function OnboardingPage({ initialStep, enabledAreas, tasks, savePreferences, createTask, completeTask }: {
  initialStep: OnboardingStep; enabledAreas: LifeArea[]; tasks: Task[];
  savePreferences(value: { enabledAreas: LifeArea[]; onboardingStep: OnboardingStep | null }): Promise<void>;
  createTask(value: { title: string; scheduleDate: string }): Promise<void>;
  completeTask(task: Task): Promise<void>;
}) {
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [areas, setAreas] = useState(enabledAreas);
  const move = async (next: OnboardingStep | null) => { await savePreferences({ enabledAreas: areas, onboardingStep: next }); if (next) setStep(next); };
  const toggle = (area: LifeArea) => setAreas(value => value.includes(area) ? value.filter(item => item !== area) : [...value, area]);
  const create = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); await createTask({ title: String(form.get('title')), scheduleDate: String(form.get('date')) }); await move('first-win'); };
  const firstTask = tasks[0];

  return <main className="onboarding-page"><section className="onboarding-card"><div className="step-dots" aria-label={`Step ${onboardingSteps.indexOf(step) + 1} of 4`}>{onboardingSteps.map(item => <i key={item} className={item === step ? 'active' : ''} />)}</div>
    {step === 'areas' && <><p className="eyebrow">Make it yours</p><h1>What deserves energy?</h1><p className="onboarding-copy">Choose only what you want to see.</p><div className="area-grid">{areaOptions.map(area => <label className={areas.includes(area.id) ? 'area-option selected' : 'area-option'} key={area.id}><input type="checkbox" checked={areas.includes(area.id)} onChange={() => toggle(area.id)} /><span aria-hidden="true">{area.icon}</span>{area.label}</label>)}</div><button className="primary-button" onClick={() => move('first-item')}>Continue</button></>}
    {step === 'first-item' && <><p className="eyebrow">One small start</p><h1>Add your first item</h1><p className="onboarding-copy">Something real you can finish today.</p><form onSubmit={create}><Field label="What will you do?"><input name="title" placeholder="Walk for 20 minutes" required /></Field><Field label="Date"><input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field><button className="primary-button">Add to today</button></form></>}
    {step === 'first-win' && <><p className="eyebrow">Make it count</p><h1>Your first mark</h1><p className="onboarding-copy">Finish it when you’re ready. This is where the orbit begins.</p>{firstTask ? <button className="first-task" onClick={async () => { await completeTask(firstTask); await move('install'); }}><span className="task-check">✓</span><span>{firstTask.title}<small>Tap when done</small></span></button> : <button className="primary-button" onClick={() => move('first-item')}>Add an item</button>}</>}
    {step === 'install' && <><div className="celebration-orbit" aria-hidden="true"><span>≋</span></div><p className="eyebrow">First win saved</p><h1>Keep Tidemark close.</h1><p className="onboarding-copy">Install it after the app opens. You can always do this later.</p><button className="primary-button" onClick={() => move(null)}>Enter Tidemark</button></>}
    <button className="text-button" onClick={() => savePreferences({ enabledAreas: areas, onboardingStep: null })}>Skip for now</button>
  </section></main>;
}
