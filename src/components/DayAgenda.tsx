import { format } from 'date-fns';
import { dateKey, occursOn } from '../domain/schedule';
import type { Task, TaskCompletion } from '../domain/types';
import { TaskCard } from './TaskCard';

export function DayAgenda({ date, tasks, completions, onComplete, onReopen }: { date: Date; tasks: Task[]; completions: TaskCompletion[]; onComplete(task: Task): void; onReopen(task: Task): void }) {
  const key = dateKey(date);
  const agenda = tasks.filter(task => occursOn(task, date));
  return <section className="day-agenda"><header><div><p className="eyebrow">{format(date, 'EEEE')}</p><h2>{format(date, 'd MMMM')}</h2></div><span>{agenda.length} item{agenda.length === 1 ? '' : 's'}</span></header><div className="task-list">{agenda.length ? agenda.map(task => <TaskCard key={task.id} task={task} completion={completions.find(item => item.taskId === task.id && item.occurrenceDate === key)} onComplete={() => onComplete(task)} onReopen={() => onReopen(task)} onFocus={() => undefined} />) : <p className="agenda-empty">Nothing planned. Leave it open or add one thing.</p>}</div></section>;
}
