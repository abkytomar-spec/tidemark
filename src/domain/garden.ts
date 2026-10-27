import type { Task, TaskCompletion } from './types';

export type GardenStage = 'soil' | 'sprout' | 'leaves' | 'bloom' | 'lantern';
export type GardenVoice = 'gentle' | 'focused' | 'cheerful';

export function gardenStage(done: number, total: number): GardenStage {
  if (done <= 0 || total <= 0) return 'soil';
  const ratio = done / total;
  if (ratio <= .25) return 'sprout';
  if (ratio <= .5) return 'leaves';
  if (ratio < 1) return 'bloom';
  return 'lantern';
}

export function parseMindSweep(text: string, scheduleDate: string): Array<{ title: string; scheduleDate: string }> {
  const seen = new Set<string>();
  return text.split(/\r?\n/).map(title => title.trim().slice(0, 160)).filter(title => {
    const key = title.toLocaleLowerCase();
    if (!title || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12).map(title => ({ title, scheduleDate }));
}

export function lightenCandidates(tasks: Task[], completions: TaskCompletion[], date: string): Task[] {
  const completed = new Set(completions.filter(item => item.occurrenceDate === date).map(item => item.taskId));
  return tasks.filter(task => !task.archived && task.scheduleDate === date && task.recurrence.type === 'one_time' && !task.scheduleTime && task.priority !== 'high' && !completed.has(task.id));
}

const windows = ['morning', 'afternoon', 'evening'] as const;
export type DayWindow = typeof windows[number];

export function windowOf(date: Date): DayWindow {
  const hour = date.getHours();
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
}

export function learnedFocusWindow(completions: TaskCompletion[], now: Date): DayWindow | null {
  const cutoff = now.getTime() - 14 * 24 * 60 * 60 * 1000;
  const recent = completions.filter(item => item.status !== 'pending_proof').map(item => new Date(item.completedAt)).filter(date => Number.isFinite(date.getTime()) && date.getTime() >= cutoff && date <= now);
  if (recent.length < 5) return null;
  const counts = recent.reduce((value, date) => {
    value[windows.indexOf(windowOf(date))]++;
    return value;
  }, [0, 0, 0]);
  return windows[counts.indexOf(Math.max(...counts))];
}

const lines: Record<GardenVoice, Record<GardenStage, string[]>> = {
  gentle: {
    soil: ['The water is calm and ready for you.', 'Begin with one small stroke.'],
    sprout: ['The tide has started to turn.', 'Something good is coming in.'],
    leaves: ['Your day is finding its current.', 'Steady care is lifting the water.'],
    bloom: ['The harbor can feel your care.', 'You are close; let it rise gently.'],
    lantern: ['The lighthouse is on tonight.', 'Enough for today. Let it shine.'],
  },
  focused: {
    soil: ['Choose the one move that matters.', 'Clear water. One useful start.'],
    sprout: ['Momentum is now in motion.', 'One done. Hold your heading.'],
    leaves: ['Good pace. Protect your attention.', 'The important work is taking shape.'],
    bloom: ['Finish the essential, then stop.', 'One clean push remains.'],
    lantern: ['Day complete. Attention well spent.', 'The plan became progress.'],
  },
  cheerful: {
    soil: ['Fresh tide, fresh possibilities!', 'Let us make a tiny splash!'],
    sprout: ['A ripple! Your day is waking up.', 'That first win looks good on you.'],
    leaves: ['Look at that tide rise!', 'Waves of real progress!'],
    bloom: ['Almost high tide everywhere!', 'Your effort is making waves.'],
    lantern: ['High tide — you lit the lighthouse!', 'A bright finish for a brave day!'],
  },
};

export function gardenLine(stage: GardenStage, voice: GardenVoice, seed: string): string {
  const options = lines[voice][stage];
  const index = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % options.length;
  return options[index];
}
