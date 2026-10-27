import { useState } from 'react';
import { addMonths, format, startOfMonth } from 'date-fns';
import { DayAgenda } from '../components/DayAgenda';
import { CameraCapture } from '../components/CameraCapture';
import { MonthGrid } from '../components/MonthGrid';
import { Sheet } from '../components/Sheet';
import { TaskEditor, type TaskDraft } from '../components/TaskEditor';
import { dateKey } from '../domain/schedule';
import type { Goal, Task, TaskCompletion } from '../domain/types';

export function CalendarPage({ initialDate = new Date(), tasks, completions, goals, onCreateTask, onComplete, onReopen }: { initialDate?: Date; tasks: Task[]; completions: TaskCompletion[]; goals: Goal[]; onCreateTask(value: TaskDraft): Promise<void>; onComplete(task: Task, date: string, proof?: File): Promise<void>; onReopen(task: Task, date: string): Promise<void> }) {
  const [month, setMonth] = useState(startOfMonth(initialDate));
  const [selected, setSelected] = useState(initialDate);
  const [adding, setAdding] = useState(false);
  const [proofTask, setProofTask] = useState<Task | null>(null);
  const key = dateKey(selected);
  const complete = async (task: Task) => task.proofRequired ? setProofTask(task) : onComplete(task, key);
  return <section className="calendar-page"><header className="calendar-header"><div><p className="eyebrow">Your rhythm</p><h1>{format(month, 'MMMM yyyy')}</h1></div><div><button aria-label="Previous month" onClick={() => setMonth(value => addMonths(value, -1))}>←</button><button aria-label="Next month" onClick={() => setMonth(value => addMonths(value, 1))}>→</button></div></header>
    <div className="calendar-layout"><div className="calendar-panel"><MonthGrid month={month} selected={selected} tasks={tasks} completions={completions} onSelect={setSelected} /></div><div className="agenda-panel"><DayAgenda date={selected} tasks={tasks} completions={completions} onComplete={complete} onReopen={task => onReopen(task, key)} /><button className="add-on-date" onClick={() => setAdding(true)}>＋ Add to {format(selected, 'd MMM')}</button></div></div>
    <Sheet open={adding} title="New task" onClose={() => setAdding(false)}><TaskEditor date={key} goals={goals} onCancel={() => setAdding(false)} onSave={async value => { await onCreateTask(value); setAdding(false); }} /></Sheet>
    <Sheet open={!!proofTask} title="Add proof" onClose={() => setProofTask(null)}>{proofTask && <CameraCapture onSave={async file => { await onComplete(proofTask, key, file); setProofTask(null); }} />}</Sheet>
  </section>;
}
