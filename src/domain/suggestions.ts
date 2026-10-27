import { differenceInCalendarDays, parseISO } from 'date-fns';
import { windowOf, type DayWindow } from './garden';
import type { Energy, Task } from './types';

type Context = { minutes: number; energy: Energy; now: Date; focusWindow?: DayWindow | null };
export type SuggestedTask = { task: Task; score: number; reason: string };
const weight = { low: 1, medium: 2, high: 3 } as const;

export function rankNextActions(tasks: Task[], context: Context): SuggestedTask[] {
  // The chosen focus window is when deep work belongs: inside it, push the heaviest task
  // forward; outside it, push the lightest, so the setting changes what Today suggests.
  const deepTime = !!context.focusWindow && windowOf(context.now) === context.focusWindow;
  return tasks
    .filter(task => !task.archived && task.estimatedMinutes <= context.minutes)
    .map(task => {
      const days = differenceInCalendarDays(parseISO(task.scheduleDate), context.now);
      const urgency = days < 0 ? 4 : days === 0 ? 3 : days <= 2 ? 2 : 0;
      const priority = weight[task.priority];
      const energyFit = task.energy === context.energy ? 3 : Math.abs(weight[task.energy] - weight[context.energy]) === 1 ? 1 : 0;
      const timeFit = task.estimatedMinutes <= context.minutes ? 2 : 0;
      const goalWeight = task.goalId ? 1 : 0;
      const windowFit = !context.focusWindow ? 0 : deepTime ? priority + (task.estimatedMinutes > 15 ? 2 : 0) : task.estimatedMinutes <= 10 ? 4 : 0;
      const score = urgency * 4 + priority * 3 + energyFit * 2 + timeFit * 2 + goalWeight + windowFit * 2;
      const reasons = [
        urgency > 0 ? 'due soon' : '',
        windowFit > 0 ? (deepTime ? `your ${context.focusWindow} focus window` : 'light enough for now') : '',
        timeFit ? `fits ${context.minutes} min` : '',
        energyFit >= 2 ? `${context.energy} energy` : '',
        task.goalId ? 'moves a goal' : '',
      ].filter(Boolean);
      return { task, score, reason: reasons.join(' · ') };
    })
    .sort((a, b) => b.score - a.score || a.task.title.localeCompare(b.task.title));
}
