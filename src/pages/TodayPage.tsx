import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { DailyRituals } from '../components/DailyRituals';
import { DailyMomentPrompt } from '../components/DailyMoment';
import { CameraCapture } from '../components/CameraCapture';
import { FocusJourney } from '../components/FocusJourney';
import { LivingGarden } from '../components/LivingGarden';
import { Sheet } from '../components/Sheet';
import { TaskCard } from '../components/TaskCard';
import { TaskEditor, type TaskDraft } from '../components/TaskEditor';
import { Toast } from '../components/Toast';
import { dailyProgress, streakFor } from '../domain/progress';
import { gardenLine, gardenStage, learnedFocusWindow } from '../domain/garden';
import { dateKey, occursOn } from '../domain/schedule';
import { dayPhase } from '../domain/context';
import { rankNextActions } from '../domain/suggestions';
import type { DailyCheckin, DailyMomentDay, DailyMomentSnapshot, Energy, Goal, Task, TaskCompletion, User } from '../domain/types';
import type { SyncState } from '../state/AppProvider';

export function TodayPage({ today = new Date(), tasks, completions, goals, checkin, dailyMoment, preferences, syncState, pendingCount, onCreateTask, onComplete, onReopen, onCheckin, onFocus, onSaveMorning, onCreateTasks, onMoveTasks, onSaveEvening, onMomentCapture, onMomentSkip }: {
  today?: Date; tasks: Task[]; completions: TaskCompletion[]; goals: Goal[]; checkin: DailyCheckin | null; syncState: SyncState; pendingCount: number;
  onCreateTask(value: TaskDraft): Promise<void>; onComplete(task: Task, date: string, proof?: File): Promise<void>; onReopen(task: Task, date: string): Promise<void>;
  preferences: Pick<User, 'displayName' | 'voice' | 'gardenSeason' | 'celebration' | 'focusWindow'>;
  onCheckin(energy: Energy): Promise<void>; onFocus(task: Task, minutes: number): Promise<void>;
  onSaveMorning(value: { intention: string; energy: Energy; mood: 2 | 3 | 5 }): Promise<void>;
  onCreateTasks(tasks: Array<{ title: string; scheduleDate: string }>): Promise<void>; onMoveTasks(tasks: Task[], date: string): Promise<void>; onSaveEvening(value: { win: string; gratitude: string }): Promise<void>;
  dailyMoment?: DailyMomentSnapshot; onMomentCapture(day: DailyMomentDay, file: File, caption: string): Promise<void>; onMomentSkip(date: string): Promise<void>;
}) {
  const key = dateKey(today);
  const [adding, setAdding] = useState(false);
  const [proofTask, setProofTask] = useState<Task | null>(null);
  const [focusTask, setFocusTask] = useState<Task | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const scheduled = useMemo(() => tasks.filter(task => occursOn(task, today)).sort((a, b) => (a.scheduleTime ?? '99:99').localeCompare(b.scheduleTime ?? '99:99')), [tasks, today]);
  const progress = dailyProgress(scheduled, completions, today);
  const streak = streakFor({ cadence: 'daily', restWeekdays: [] }, completions.filter(item => item.status !== 'pending_proof').map(item => item.occurrenceDate), today);
  const stage = gardenStage(progress.completed, progress.total);
  const completionFor = (task: Task) => completions.find(item => item.taskId === task.id && item.occurrenceDate === key);
  const incomplete = scheduled.filter(task => !completionFor(task));
  const quickWins = incomplete.filter(task => task.estimatedMinutes <= 10);
  const focusWindow = preferences.focusWindow === 'learn' ? learnedFocusWindow(completions, today) : preferences.focusWindow;
  const suggestion = rankNextActions(incomplete, { minutes: 30, energy: checkin?.energy ?? 'medium', now: today, focusWindow })[0];
  const statusText = syncState === 'offline' ? `${pendingCount} waiting to sync` : syncState === 'syncing' ? 'Syncing' : 'Synced';
  const finish = async (task: Task) => { if (task.proofRequired) setProofTask(task); else { await onComplete(task, key); setToast(`Completed ${task.title}`); } };

  return <section className="today-page"><header className="today-header"><div><p className="eyebrow">{format(today, 'EEEE · d MMMM')}</p><h1>{preferences.displayName ? `Hi, ${preferences.displayName}` : 'Today'}</h1><span className={`sync-pill ${syncState}`}>{statusText}</span><p className="luma-line"><span aria-hidden="true">✦</span>{gardenLine(stage, preferences.voice, key)}</p></div><LivingGarden done={progress.completed} total={progress.total} streak={streak.current} season={preferences.gardenSeason} celebration={preferences.celebration} /></header>
    <DailyRituals today={today} scheduled={scheduled} completions={completions} checkin={checkin} preferences={preferences} onCheckin={onCheckin} onSaveMorning={async value => { await onSaveMorning(value); setToast('Morning heading set'); }} onCreateTasks={async items => { await onCreateTasks(items); setToast(`${items.length} task${items.length === 1 ? '' : 's'} planted`); }} onMoveTasks={async (items, date) => { await onMoveTasks(items, date); setToast('Tomorrow feels lighter'); }} onSaveEvening={async value => { await onSaveEvening(value); setToast('Evening watch logged'); }} />
    {suggestion && <aside className="next-action"><div><p className="eyebrow">Next best action</p><strong>{suggestion.task.title}</strong><small>{suggestion.reason}</small></div><button onClick={() => setFocusTask(suggestion.task)}>Start</button></aside>}
    <DailyMomentPrompt value={dailyMoment} onCapture={onMomentCapture} onSkip={onMomentSkip} />
    {quickWins.length > 0 && <p className="quick-win-label">{quickWins.length} quick win{quickWins.length > 1 ? 's' : ''}</p>}
    <div className="task-list">{scheduled.length ? scheduled.map(task => <TaskCard key={task.id} task={task} completion={completionFor(task)} onComplete={() => finish(task)} onReopen={async () => { await onReopen(task, key); setToast(`Reopened ${task.title}`); }} onFocus={() => setFocusTask(task)} />) : <div className="calm-empty"><span>{dayPhase(today.getHours()) === 'night' ? '☾' : '☀'}</span><h2>Your day is open.</h2><p>Add one thing worth doing.</p></div>}</div>
    <button className="floating-add" onClick={() => setAdding(true)} aria-label="Add task">＋</button>
    <Sheet open={adding} title="New task" onClose={() => setAdding(false)}><TaskEditor date={key} goals={goals} onCancel={() => setAdding(false)} onSave={async value => { await onCreateTask(value); setAdding(false); setToast('Task added'); }} /></Sheet>
    <Sheet open={!!proofTask} title="Add proof" onClose={() => setProofTask(null)}>{proofTask && <CameraCapture busy={photoBusy} onSave={async file => { setPhotoBusy(true); try { await onComplete(proofTask, key, file); setToast(`Proof saved for ${proofTask.title}`); setProofTask(null); } finally { setPhotoBusy(false); } }} />}</Sheet>
    <Sheet open={!!focusTask} title="Focus journey" onClose={() => setFocusTask(null)}>{focusTask && <FocusJourney task={focusTask} onFinish={async minutes => { await onFocus(focusTask, minutes); setFocusTask(null); setToast(`${minutes} focused minute${minutes === 1 ? '' : 's'} saved`); }} />}</Sheet>
    <Toast message={toast} />
  </section>;
}
