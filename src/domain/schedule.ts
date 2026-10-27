import { format, getDate, getDay, getDaysInMonth, isBefore, parseISO, startOfDay } from 'date-fns';
import type { Task } from './types';

export const dateKey = (date: Date) => format(date, 'yyyy-MM-dd');
export const occurrenceKey = (taskId: string, date: Date) => `${taskId}:${dateKey(date)}`;

export function occursOn(task: Task, date: Date): boolean {
  if (task.archived) return false;
  const day = startOfDay(date);
  const start = startOfDay(parseISO(task.scheduleDate));
  if (isBefore(day, start)) return false;

  switch (task.recurrence.type) {
    case 'one_time': return dateKey(day) === task.scheduleDate;
    case 'daily': return true;
    case 'weekly': return task.recurrence.weekdays.includes(getDay(day));
    case 'monthly': return getDate(day) === Math.min(task.recurrence.dayOfMonth, getDaysInMonth(day));
  }
}
