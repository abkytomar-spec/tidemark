import { BrandMark } from './components/BrandMark';
import { useEffect, useState } from 'react';
import { AppShell } from './components/AppShell';
import type { AppSection } from './components/BottomNav';
import { SettingsSheet } from './components/SettingsSheet';
import { LoginPage } from './pages/LoginPage';
import { OnboardingPage, type OnboardingStep } from './pages/OnboardingPage';
import { SetupPage } from './pages/SetupPage';
import { useApp } from './state/AppProvider';
import { TodayPage } from './pages/TodayPage';
import { prepareProof } from './data/images';
import { dateKey } from './domain/schedule';
import { CalendarPage } from './pages/CalendarPage';
import type { TaskDraft } from './components/TaskEditor';
import type { DailyCheckin, Energy, Goal, Task, User } from './domain/types';
import { GoalsPage, type GoalDraft, type ProgressDraft } from './pages/GoalsPage';
import { LogPage } from './pages/LogPage';
import { GymPage } from './pages/GymPage';
import { ContextLayer, useContextLayer } from './components/ContextLayer';
import type { GymContextValue } from './components/GymPlaces';

export function App() {
  const app = useApp();
  const [active, setActive] = useState<AppSection>('today');
  const [settings, setSettings] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [workoutStartRequested, setWorkoutStartRequested] = useState(false);
  const context = useContextLayer(app.snapshot?.user);
  const appearance = app.snapshot?.user.appearance ?? 'system';
  const season = app.snapshot?.user.gardenSeason ?? 'dawn';
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = appearance === 'dark' || (appearance === 'system' && !!media?.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.documentElement.dataset.season = season;
      document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', dark ? '#07131C' : '#EEF4F7');
      try { localStorage.setItem('tidemark-appearance', appearance); } catch { /* private browsing can deny storage */ }
    };
    apply();
    if (appearance === 'system') media?.addEventListener?.('change', apply);
    return () => media?.removeEventListener?.('change', apply);
  }, [appearance, season]);
  if (app.setupRequired === null || (app.session && !app.snapshot)) return <main className="splash"><div className="auth-mark"><BrandMark /></div>{app.error ? <><span>{app.error}</span><button className="text-button" onClick={() => location.reload()}>Try again</button></> : <span>Waking Tidemark…</span>}</main>;
  if (app.setupRequired) return <SetupPage error={formError ?? app.error} onSetup={async input => { try { setFormError(null); await app.setup(input); } catch (error) { setFormError(error instanceof Error ? error.message : 'Setup failed.'); } }} />;
  if (!app.session) return <LoginPage error={formError ?? app.error} onLogin={async input => { try { setFormError(null); await app.login(input); } catch (error) { setFormError(error instanceof Error ? error.message : 'Login failed.'); } }} />;
  if (!app.snapshot) return null;

  const user = app.snapshot.user;
  if (user.onboardingStep) return <OnboardingPage
    initialStep={user.onboardingStep as OnboardingStep}
    enabledAreas={user.enabledAreas}
    tasks={app.snapshot.tasks}
    savePreferences={savePreferences}
    createTask={async value => { await app.mutate({ method: 'POST', path: '/tasks', body: { ...value, notes: '', priority: 'medium', color: '#2F7FD1', estimatedMinutes: 20, energy: 'medium', scheduleTime: null, recurrence: { type: 'one_time' }, goalId: null, proofRequired: false } }); }}
    completeTask={async task => { await app.mutate({ method: 'POST', path: `/tasks/${task.id}/complete`, body: { date: task.scheduleDate } }); }}
  />;

  async function savePreferences(patch: Partial<Pick<User, 'enabledAreas' | 'onboardingStep' | 'displayName' | 'appearance' | 'gardenSeason' | 'voice' | 'focusWindow' | 'celebration'>>) {
    await app.mutate({ method: 'PATCH', path: '/preferences', body: patch }, snapshot => ({ ...snapshot, user: { ...snapshot.user, ...patch } }));
  }

  async function createTask(draft: TaskDraft) {
    const id = crypto.randomUUID();
    await app.mutate({ method: 'POST', path: '/tasks', body: { id, ...draft } }, snapshot => ({ ...snapshot, tasks: [...snapshot.tasks, { id, ...draft, archived: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] }));
  }

  async function createGoal(draft: GoalDraft) {
    const id = crypto.randomUUID();
    await app.mutate({ method: 'POST', path: '/goals', body: { id, ...draft } }, snapshot => ({ ...snapshot, goals: [...snapshot.goals, { id, ...draft, currentValue: 0, status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] }));
  }

  async function addProgress(goal: Goal, draft: ProgressDraft, file?: File) {
    const id = crypto.randomUUID();
    const photo = file ? await prepareProof(file) : null;
    const pending = draft.entryType === 'workout';
    await app.mutate({ method: 'POST', path: `/goals/${goal.id}/entries`, body: { id, ...draft } }, snapshot => ({ ...snapshot, goals: snapshot.goals.map(item => item.id === goal.id && !pending ? { ...item, currentValue: item.currentValue + draft.value } : item), progressEntries: [...snapshot.progressEntries, { id, goalId: goal.id, area: goal.area, ...draft, status: pending ? 'pending_proof' : 'complete', createdAt: new Date().toISOString() }] }));
    if (photo) await app.addProof({ ownerType: 'progress', ownerId: id, photo });
  }

  async function completeTask(task: Task, date: string, file?: File) {
    const photo = file ? await prepareProof(file) : null;
    await app.mutate({ method: 'POST', path: `/tasks/${task.id}/complete`, body: { date } }, snapshot => ({ ...snapshot, completions: [...snapshot.completions.filter(item => !(item.taskId === task.id && item.occurrenceDate === date)), { id: `local-${crypto.randomUUID()}`, taskId: task.id, occurrenceDate: date, completedAt: new Date().toISOString(), points: task.priority === 'high' ? 20 : task.priority === 'medium' ? 10 : 5, hasProof: false, status: task.proofRequired ? 'pending_proof' : 'complete' }] }));
    if (photo) await app.addProof({ ownerType: 'task_occurrence', ownerId: `${task.id}:${date}`, photo });
  }

  async function reopenTask(task: Task, date: string) {
    await app.mutate({ method: 'DELETE', path: `/tasks/${task.id}/completions/${date}` }, snapshot => ({ ...snapshot, completions: snapshot.completions.filter(item => !(item.taskId === task.id && item.occurrenceDate === date)) }));
  }

  const today = new Date();
  const todayKey = dateKey(today);
  async function saveCheckin(patch: Partial<Pick<DailyCheckin, 'energy' | 'mood' | 'note' | 'intention' | 'win' | 'gratitude'>>) {
    const current = app.snapshot!.checkins.find(item => item.date === todayKey);
    const next: DailyCheckin = { id: current?.id ?? `local-${todayKey}`, date: todayKey, energy: current?.energy ?? 'medium', mood: current?.mood ?? 3, note: current?.note ?? '', intention: current?.intention ?? '', win: current?.win ?? '', gratitude: current?.gratitude ?? '', ...patch };
    const { id: _id, ...body } = next;
    await app.mutate({ method: 'POST', path: '/checkins', body }, snapshot => ({ ...snapshot, checkins: [...snapshot.checkins.filter(item => item.date !== todayKey), next] }));
  }
  async function createMindSweepTasks(items: Array<{ title: string; scheduleDate: string }>) {
    for (const item of items) await createTask({ ...item, notes: '', priority: 'low', color: '#1FA3A0', estimatedMinutes: 5, energy: 'medium', scheduleTime: null, recurrence: { type: 'one_time' }, goalId: null, proofRequired: false });
  }
  async function moveTasks(items: Task[], scheduleDate: string) {
    for (const task of items) await app.mutate({ method: 'PATCH', path: `/tasks/${task.id}`, body: { scheduleDate } }, snapshot => ({ ...snapshot, tasks: snapshot.tasks.map(item => item.id === task.id ? { ...item, scheduleDate, updatedAt: new Date().toISOString() } : item) }));
  }
  async function downloadBackup() {
    const url = URL.createObjectURL(await app.exportBackup!());
    const link = Object.assign(document.createElement('a'), { href: url, download: 'tidemark-export.json' });
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function saveGymContext(value: GymContextValue) {
    await app.mutate({ method: 'PATCH', path: '/preferences', body: value }, snapshot => ({ ...snapshot, user: { ...snapshot.user, ...value } }));
  }
  const todayContent = <TodayPage
    today={today}
    tasks={app.snapshot.tasks}
    completions={app.snapshot.completions}
    goals={app.snapshot.goals}
    checkin={app.snapshot.checkins.find(item => item.date === todayKey) ?? null}
    dailyMoment={app.snapshot.dailyMoment}
    preferences={user}
    syncState={app.syncState}
    pendingCount={app.pendingCount}
    onCreateTask={createTask}
    onComplete={completeTask}
    onReopen={reopenTask}
    onCheckin={async (energy: Energy) => saveCheckin({ energy, mood: energy === 'high' ? 5 : energy === 'medium' ? 3 : 2 })}
    onSaveMorning={saveCheckin}
    onCreateTasks={createMindSweepTasks}
    onMoveTasks={moveTasks}
    onSaveEvening={saveCheckin}
    onMomentSkip={async date => { await app.mutate({ method: 'POST', path: `/daily-moment/${date}/skip` }); }}
    onMomentCapture={async (day, file, caption) => { const photo = await prepareProof(file); await app.mutate({ method: 'POST', path: `/daily-moment/${day.localDate}/capture`, body: { caption } }); await app.addProof({ ownerType: 'daily_moment', ownerId: day.id, photo, caption }); }}
    onFocus={async (task, minutes) => { await app.mutate({ method: 'POST', path: '/focus', body: { taskId: task.id, minutes } }); }}
  />;
  const calendarContent = <CalendarPage tasks={app.snapshot.tasks} completions={app.snapshot.completions} goals={app.snapshot.goals} onCreateTask={createTask} onComplete={completeTask} onReopen={reopenTask} />;
  const gymContent = <GymPage userId={user.id} snapshot={app.snapshot} mutate={app.mutate} addProof={app.addProof} today={today} startRequested={workoutStartRequested} onStartRequestHandled={() => setWorkoutStartRequested(false)} onSaveContext={saveGymContext} />;
  const goalsContent = <GoalsPage goals={app.snapshot.goals} milestones={app.snapshot.milestones} progressEntries={app.snapshot.progressEntries} enabledAreas={user.enabledAreas} onCreateGoal={createGoal} onAddProgress={addProgress} />;
  const logContent = <LogPage tasks={app.snapshot.tasks} completions={app.snapshot.completions} activities={app.snapshot.activities} proofs={app.snapshot.proofs} checkins={app.snapshot.checkins} globalSafe={app.snapshot.globalSafe} dailyMoment={app.snapshot.dailyMoment} onDeleteProof={async proof => { await app.mutate({ method: 'DELETE', path: `/proofs/${proof.id}` }); }} onSaveReflection={async note => { const checkin = app.snapshot!.checkins.find(item => item.date === todayKey); await app.mutate({ method: 'POST', path: '/checkins', body: { date: todayKey, energy: checkin?.energy ?? 'medium', mood: checkin?.mood ?? 3, note } }); }} />;
  return <>
    <AppShell active={active} onNavigate={setActive} onOpenSettings={() => setSettings(true)} context={<ContextLayer label={context.label} nearbyGym={context.nearbyGym} onDismiss={context.dismissNearby} onStartGym={() => { context.dismissNearby(); setWorkoutStartRequested(true); setActive('gym'); }} />}>
      {active === 'today' ? todayContent : active === 'calendar' ? calendarContent : active === 'gym' ? gymContent : active === 'goals' ? goalsContent : logContent}
    </AppShell>
    <SettingsSheet open={settings} user={user} dailyMoment={app.snapshot.dailyMoment?.settings ?? { enabled: false, windowStart: '12:00', windowEnd: '17:00', notifications: false }} onClose={() => setSettings(false)} onSave={savePreferences} onSaveDailyMoment={async value => { await app.mutate({ method: 'POST', path: '/daily-moment/settings', body: value }); }} onLogout={app.logout} localOnly={app.localOnly} onExport={app.exportBackup ? downloadBackup : undefined} />
  </>;
}
