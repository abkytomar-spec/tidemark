import { eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';
import { occursOn } from '../domain/schedule';
import type { Task, TaskCompletion } from '../domain/types';

export function MonthGrid({ month, selected, tasks, completions, onSelect }: { month: Date; selected: Date; tasks: Task[]; completions: TaskCompletion[]; onSelect(date: Date): void }) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start, end });
  return <div className="month-grid"><div className="weekday-row">{['M','T','W','T','F','S','S'].map((day, index) => <span key={index}>{day}</span>)}</div><div className="calendar-cells">{days.map(date => {
    const occurrences = tasks.filter(task => occursOn(task, date));
    const dateString = format(date, 'yyyy-MM-dd');
    const done = occurrences.filter(task => completions.some(item => item.taskId === task.id && item.occurrenceDate === dateString && item.status !== 'pending_proof')).length;
    const label = `${format(date, 'MMMM d')}, ${occurrences.length} task${occurrences.length === 1 ? '' : 's'}`;
    return <button key={dateString} aria-label={label} aria-pressed={isSameDay(date, selected)} className={`${isSameMonth(date, month) ? '' : 'outside'} ${isSameDay(date, selected) ? 'selected' : ''}`} onClick={() => onSelect(date)}><span>{format(date, 'd')}</span>{occurrences.length > 0 && <i className={done === occurrences.length ? 'all-done' : ''} style={{ '--dot-progress': `${Math.round(done / occurrences.length * 100)}%` } as React.CSSProperties} />}</button>;
  })}</div></div>;
}
