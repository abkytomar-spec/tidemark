import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installCameraMock } from '../test/camera';
import { TodayPage } from './TodayPage';
import type { DailyCheckin, DailyMomentSnapshot, Task, TaskCompletion, User } from '../domain/types';

const proofTask: Task = { id: 'gym', title: 'Gym session', notes: '', priority: 'high', color: '#F37B6D', estimatedMinutes: 55, energy: 'high', scheduleDate: '2026-08-09', scheduleTime: '18:00', recurrence: { type: 'one_time' }, goalId: null, proofRequired: true, archived: false, createdAt: '', updatedAt: '' };

test('quick add asks only for title and date until more options opens', async () => {
  renderToday();
  await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
  expect(screen.getByLabelText('Title')).toBeVisible();
  expect(screen.queryByLabelText('Proof required')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'More options' }));
  expect(screen.getByLabelText('Proof required')).toBeVisible();
});

test('a proof-required completion opens photo capture before mutation', async () => {
  installCameraMock();
  renderToday([proofTask]);
  await userEvent.click(screen.getByRole('button', { name: 'Complete Gym session' }));
  expect(await screen.findByLabelText('Live camera preview')).toBeVisible();
  expect(document.querySelector('input[type="file"]')).toBeNull();
});

test('quick wins contains only tasks estimated at ten minutes or less', () => {
  const quick = { ...proofTask, id: 'quick', title: 'Reply to Sam', estimatedMinutes: 8, proofRequired: false };
  renderToday([proofTask, quick]);
  expect(screen.getByRole('heading', { name: 'Reply to Sam' })).toBeVisible();
  expect(screen.getByText('1 quick win')).toBeVisible();
});

test('tide gauge exposes the current growth stage', () => {
  const second = { ...proofTask, id: 'second', title: 'Second task', proofRequired: false };
  const completion: TaskCompletion = { id: 'done', taskId: proofTask.id, occurrenceDate: '2026-08-09', completedAt: '2026-08-09T09:00:00', points: 20, hasProof: true, status: 'complete' };
  renderToday([proofTask, second], { completions: [completion] });
  expect(screen.getByRole('img', { name: 'Tide gauge: leaves, 1 of 2 tasks complete' })).toBeVisible();
});

test('morning seed saves an intention with energy', async () => {
  const { handlers } = renderToday();
  await userEvent.click(screen.getByRole('button', { name: 'Set morning heading' }));
  await userEvent.type(screen.getByLabelText('Today I want to'), 'Finish the release');
  await userEvent.click(screen.getByRole('button', { name: 'Steady' }));
  await userEvent.click(screen.getByRole('button', { name: 'Add as today’s task' }));
  expect(handlers.onSaveMorning).toHaveBeenCalledWith({ intention: 'Finish the release', energy: 'medium', mood: 3 });
  expect(handlers.onCreateTasks).toHaveBeenCalledWith([{ title: 'Finish the release', scheduleDate: '2026-08-09' }]);
});

test('opens focus and meditation without adding another main tab', async () => {
  renderToday();
  await userEvent.click(screen.getByRole('button', { name: 'Focus & calm' }));
  expect(screen.getByRole('heading', { name: 'Focus & calm' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Meditate' })).toBeVisible();
});

test('turns a saved seed into an actionable task once', async () => {
  const { handlers } = renderToday([], { checkin: checkin({ intention: 'Complete part 1' }) });
  await userEvent.click(screen.getByRole('button', { name: 'Add as task' }));
  expect(handlers.onCreateTasks).toHaveBeenCalledWith([{ title: 'Complete part 1', scheduleDate: '2026-08-09' }]);
  expect(screen.queryByRole('button', { name: 'Add as task' })).not.toBeInTheDocument();
});

test('mind sweep plants deduplicated tasks on the selected day', async () => {
  const { handlers } = renderToday();
  await userEvent.click(screen.getByRole('button', { name: 'Mind sweep' }));
  await userEvent.type(screen.getByLabelText('What is on your mind?'), 'Email Sam\nEmail Sam\nBook dentist');
  await userEvent.click(screen.getByRole('button', { name: 'Add 2 tasks' }));
  expect(handlers.onCreateTasks).toHaveBeenCalledWith([{ title: 'Email Sam', scheduleDate: '2026-08-09' }, { title: 'Book dentist', scheduleDate: '2026-08-09' }]);
});

test('lighten my day moves only explicitly selected eligible tasks', async () => {
  const movable = { ...proofTask, id: 'movable', title: 'Tidy desk', priority: 'low' as const, scheduleTime: null, proofRequired: false };
  const { handlers } = renderToday([movable], { checkin: checkin({ energy: 'low' }) });
  await userEvent.click(screen.getByRole('button', { name: 'Lighten my day' }));
  await userEvent.click(screen.getByLabelText('Tidy desk'));
  await userEvent.click(screen.getByRole('button', { name: 'Move 1 to tomorrow' }));
  expect(handlers.onMoveTasks).toHaveBeenCalledWith([movable], '2026-08-10');
});

test('evening watch appears after six and saves the day close', async () => {
  const { handlers } = renderToday([], { today: new Date('2026-08-09T19:00:00') });
  await userEvent.click(screen.getByRole('button', { name: 'Log evening watch' }));
  await userEvent.type(screen.getByLabelText('A win from today'), 'Shipped the app');
  await userEvent.type(screen.getByLabelText('Something I appreciate'), 'A calm walk');
  await userEvent.click(screen.getByRole('button', { name: 'Save evening watch' }));
  expect(handlers.onSaveEvening).toHaveBeenCalledWith({ win: 'Shipped the app', gratitude: 'A calm walk' });
});

test('allows a voluntary Daily photo before its reminder time', () => {
  renderToday([], { dailyMoment: moment({ eligiblePrompt: false }) });
  expect(screen.getByText('Daily photo')).toBeVisible();
  expect(screen.getByText('Capture today')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Capture daily photo' })).toBeVisible();
  expect(screen.queryByLabelText('Caption (optional)')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Not today' })).not.toBeInTheDocument();
});

test('shows the gentle reminder only when the server marks it eligible', () => {
  renderToday([], { dailyMoment: moment({ eligiblePrompt: true }) });
  expect(screen.getByText('A tiny piece of today?')).toBeVisible();
  expect(screen.queryByText(/points|streak|penalty/i)).not.toBeInTheDocument();
});

test('keeps the Today Seed ahead of the optional Daily photo', () => {
  const { container } = renderToday([], { checkin: checkin({ intention: 'Finish the release' }), dailyMoment: moment() });
  const seed = container.querySelector('.saved-seed');
  const photo = container.querySelector('.moment-prompt');

  expect(seed).toBeTruthy();
  expect(photo).toBeTruthy();
  expect(seed!.compareDocumentPosition(photo!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test('notifies once at the scheduled time even when Daily photos already exist', () => {
  const notify = vi.fn();
  vi.stubGlobal('Notification', class { static permission = 'granted'; constructor(title: string) { notify(title); } });
  localStorage.clear();
  const scheduled = moment({ settings: { enabled: true, windowStart: '12:00', windowEnd: '17:00', notifications: true }, eligiblePrompt: true });
  const first = renderToday([], { dailyMoment: scheduled });
  first.unmount();
  renderToday([], { dailyMoment: scheduled });

  expect(notify).toHaveBeenCalledOnce();
  vi.unstubAllGlobals();
});

test('never sends more than two Daily Snapshot reminders in one day', () => {
  const notify = vi.fn();
  vi.stubGlobal('Notification', class { static permission = 'granted'; constructor(title: string) { notify(title); } });
  localStorage.setItem('tidemark:daily-moment-notified:2026-08-11', JSON.stringify({ count: 2, lastAt: 0 }));
  renderToday([], { dailyMoment: moment({ settings: { enabled: true, windowStart: '12:00', windowEnd: '17:00', notifications: true }, eligiblePrompt: true }) });

  expect(notify).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

test('skips only the server-provided local date and collapses the prompt', async () => {
  const { handlers } = renderToday([], { dailyMoment: moment({ eligiblePrompt: true }) });
  await userEvent.click(screen.getByRole('button', { name: 'Not today' }));
  expect(handlers.onMomentSkip).toHaveBeenCalledWith('2026-08-11');
  expect(screen.queryByText('A tiny piece of today?')).not.toBeInTheDocument();
  expect(screen.getByText('Capture today')).toBeVisible();
});

test('captures by live camera and preserves the exact caption', async () => {
  installCameraMock();
  const { handlers } = renderToday([], { dailyMoment: moment({ eligiblePrompt: true }) });
  await userEvent.click(screen.getByRole('button', { name: 'Capture daily photo' }));
  await userEvent.type(screen.getByLabelText('Caption (optional)'), 'Rain on glass  ');
  await userEvent.click(await screen.findByRole('button', { name: 'Capture' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save photo' }));

  expect(handlers.onMomentCapture).toHaveBeenCalledWith(expect.objectContaining({ id: 'moment-day' }), expect.any(File), 'Rain on glass  ');
  expect(screen.getByText('Capture today')).toBeVisible();
  expect(document.querySelector('input[type="file"]')).toBeNull();
});

const preferences: Pick<User, 'displayName' | 'voice' | 'gardenSeason' | 'celebration' | 'focusWindow'> = { displayName: 'Dheeraj', voice: 'gentle', gardenSeason: 'dawn', celebration: 'full', focusWindow: 'learn' };

function renderToday(tasks: Task[] = [], options: { today?: Date; completions?: TaskCompletion[]; checkin?: DailyCheckin | null; dailyMoment?: DailyMomentSnapshot } = {}) {
  const handlers = { onCreateTask: vi.fn(), onComplete: vi.fn(), onReopen: vi.fn(), onCheckin: vi.fn(), onFocus: vi.fn(), onSaveMorning: vi.fn(), onCreateTasks: vi.fn(), onMoveTasks: vi.fn(), onSaveEvening: vi.fn(), onMomentCapture: vi.fn(), onMomentSkip: vi.fn() };
  return { ...render(<TodayPage today={options.today ?? new Date('2026-08-09T10:00:00')} tasks={tasks} completions={options.completions ?? []} goals={[]} checkin={options.checkin ?? null} dailyMoment={options.dailyMoment} preferences={preferences} syncState="synced" pendingCount={0} {...handlers} />), handlers };
}

function checkin(overrides: Partial<DailyCheckin> = {}): DailyCheckin {
  return { id: 'checkin', date: '2026-08-09', energy: 'medium', mood: 3, note: '', intention: '', win: '', gratitude: '', ...overrides };
}

function moment(overrides: Partial<DailyMomentSnapshot> = {}): DailyMomentSnapshot {
  return { settings: { enabled: true, windowStart: '12:00', windowEnd: '17:00', notifications: false }, today: { id: 'moment-day', localDate: '2026-08-11', scheduledTime: '14:30', status: 'scheduled', capturedAt: null, caption: '' }, days: [], eligiblePrompt: false, ...overrides };
}
