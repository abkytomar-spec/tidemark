import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { AppProvider } from './state/AppProvider';
import type { Snapshot } from './domain/types';
import { installCameraMock } from './test/camera';

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
  delete document.documentElement.dataset.weather;
  delete document.documentElement.dataset.dayphase;
});

test('keeps navigation to five calm destinations with Train in the center', async () => {
  const snapshot: Snapshot = { serverTime: '', user: { id: 'u', email: 'owner@example.com', timezone: 'Asia/Kolkata', enabledAreas: ['fitness'], onboardingStep: null, displayName: '', appearance: 'system', gardenSeason: 'dawn', voice: 'gentle', focusWindow: 'learn', celebration: 'full' }, tasks: [], completions: [], goals: [], milestones: [], progressEntries: [], checkins: [], activities: [], proofs: [] };
  const client = { getSetupStatus: vi.fn().mockResolvedValue({ setupRequired: false }), getSession: vi.fn().mockResolvedValue({ user: snapshot.user, csrfToken: 'csrf' }), sync: vi.fn().mockResolvedValue(snapshot), setCsrf: vi.fn(), mutate: vi.fn(), uploadProof: vi.fn(), setup: vi.fn(), login: vi.fn(), logout: vi.fn(), exportUrl: '/api/export' };
  render(<AppProvider client={client}><App /></AppProvider>);
  expect(await screen.findByRole('button', { name: 'Today' })).toBeVisible();
  expect(screen.getAllByRole('button', { name: /Today|Planner|Train|Goals|Logbook/ })).toHaveLength(5);
  await userEvent.click(screen.getByRole('button', { name: 'Planner' }));
  expect(screen.getByRole('button', { name: 'Next month' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Train' }));
  expect(screen.getByRole('heading', { name: 'Get stronger' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Set up my gym' })).toBeVisible();
});

test('applies and syncs appearance with the full personalization choice', async () => {
  const snapshot: Snapshot = { serverTime: '', user: { id: 'u', email: 'owner@example.com', timezone: 'Asia/Kolkata', enabledAreas: ['fitness'], onboardingStep: null, displayName: '', appearance: 'system', gardenSeason: 'dawn', voice: 'gentle', focusWindow: 'learn', celebration: 'full' }, tasks: [], completions: [], goals: [], milestones: [], progressEntries: [], checkins: [], activities: [], proofs: [] };
  const personalized: Snapshot = { ...snapshot, user: { ...snapshot.user, appearance: 'dark', displayName: 'Dheeraj', voice: 'cheerful', gardenSeason: 'moon', focusWindow: 'evening', celebration: 'quiet' } };
  const client = { getSetupStatus: vi.fn().mockResolvedValue({ setupRequired: false }), getSession: vi.fn().mockResolvedValue({ user: snapshot.user, csrfToken: 'csrf' }), sync: vi.fn().mockResolvedValueOnce(snapshot).mockResolvedValue(personalized), setCsrf: vi.fn(), mutate: vi.fn(), uploadProof: vi.fn(), setup: vi.fn(), login: vi.fn(), logout: vi.fn(), exportUrl: '/api/export' };
  const user = userEvent.setup();
  render(<AppProvider client={client}><App /></AppProvider>);

  await user.click(await screen.findByRole('button', { name: 'Settings' }));
  await user.click(screen.getByLabelText('Dark'));
  await user.click(screen.getByText('Make it mine'));
  await user.type(screen.getByLabelText('Display name'), 'Dheeraj');
  await user.selectOptions(screen.getByLabelText('Voice'), 'cheerful');
  await user.selectOptions(screen.getByLabelText('Tide theme'), 'moon');
  await user.selectOptions(screen.getByLabelText('Focus window'), 'evening');
  await user.click(screen.getByLabelText('Quiet celebrations'));
  await user.click(screen.getByRole('button', { name: 'Save changes' }));

  await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  expect(client.mutate).toHaveBeenCalledWith(expect.objectContaining({ path: '/preferences', body: expect.objectContaining({ appearance: 'dark', displayName: 'Dheeraj', voice: 'cheerful', gardenSeason: 'moon', focusWindow: 'evening', celebration: 'quiet', enabledAreas: ['fitness'] }) }));
});

test('routes Fitness goals from the Goals tab through the normal endpoint', async () => {
  const snapshot: Snapshot = { serverTime: '', user: { id: 'u', email: 'owner@example.com', timezone: 'Asia/Kolkata', enabledAreas: ['fitness'], onboardingStep: null, displayName: '', appearance: 'system', gardenSeason: 'dawn', voice: 'gentle', focusWindow: 'learn', celebration: 'full' }, tasks: [], completions: [], goals: [], milestones: [], progressEntries: [], checkins: [], activities: [], proofs: [] };
  const client = { getSetupStatus: vi.fn().mockResolvedValue({ setupRequired: false }), getSession: vi.fn().mockResolvedValue({ user: snapshot.user, csrfToken: 'csrf' }), sync: vi.fn().mockResolvedValue(snapshot), setCsrf: vi.fn(), mutate: vi.fn().mockResolvedValue(undefined), uploadProof: vi.fn(), setup: vi.fn(), login: vi.fn(), logout: vi.fn(), exportUrl: '/api/export' };
  render(<AppProvider client={client}><App /></AppProvider>);
  await userEvent.click(await screen.findByRole('button', { name: 'Goals' }));
  await userEvent.click(screen.getByRole('button', { name: 'Fitness' }));
  await userEvent.click(screen.getByRole('button', { name: 'Add goal' }));
  await userEvent.type(screen.getByLabelText('Goal title'), 'Walk more');
  await userEvent.click(screen.getByRole('button', { name: 'Create goal' }));

  await waitFor(() => expect(client.mutate).toHaveBeenCalledWith(expect.objectContaining({
    path: '/goals',
    body: expect.objectContaining({ title: 'Walk more', area: 'fitness' }),
  })));
});

test('preserves a Daily Snapshot caption in both capture preflight and proof mutation', async () => {
  installCameraMock();
  const snapshot: Snapshot = { serverTime: '', user: { id: 'u', email: 'owner@example.com', timezone: 'Asia/Kolkata', enabledAreas: ['fitness'], onboardingStep: null, displayName: '', appearance: 'system', gardenSeason: 'dawn', voice: 'gentle', focusWindow: 'learn', celebration: 'full' }, tasks: [], completions: [], goals: [], milestones: [], progressEntries: [], checkins: [], activities: [], proofs: [], dailyMoment: { settings: { enabled: true, windowStart: '12:00', windowEnd: '17:00', notifications: false }, today: { id: 'moment-day', localDate: '2026-08-11', scheduledTime: '14:30', status: 'scheduled', capturedAt: null, caption: '' }, days: [], eligiblePrompt: true } };
  const client = { getSetupStatus: vi.fn().mockResolvedValue({ setupRequired: false }), getSession: vi.fn().mockResolvedValue({ user: snapshot.user, csrfToken: 'csrf' }), sync: vi.fn().mockResolvedValue(snapshot), setCsrf: vi.fn(), mutate: vi.fn().mockResolvedValue(undefined), uploadProof: vi.fn(), setup: vi.fn(), login: vi.fn(), logout: vi.fn(), exportUrl: '/api/export' };
  render(<AppProvider client={client}><App /></AppProvider>);

  await userEvent.click(await screen.findByRole('button', { name: 'Capture daily photo' }));
  await userEvent.type(screen.getByLabelText('Caption (optional)'), 'Rain on glass  ');
  await userEvent.click(await screen.findByRole('button', { name: 'Capture' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save photo' }));

  await waitFor(() => expect(client.mutate).toHaveBeenCalledTimes(2));
  expect(client.mutate).toHaveBeenNthCalledWith(1, expect.objectContaining({ path: '/daily-moment/2026-08-11/capture', body: { caption: 'Rain on glass  ' } }));
  expect(client.mutate).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'proof', body: expect.objectContaining({ ownerType: 'daily_moment', ownerId: 'moment-day', caption: 'Rain on glass  ' }) }));
});

test('offers a nearby saved gym and uses coarse coordinates for local weather', async () => {
  const getCurrentPosition = vi.fn((success: PositionCallback) => success({ coords: { latitude: 12.97164, longitude: 77.59464 } } as GeolocationPosition));
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
  const weatherFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ current: { weather_code: 61 } }), { headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', weatherFetch);
  const snapshot: Snapshot = { serverTime: '', user: { id: 'u', email: 'owner@example.com', timezone: 'Asia/Kolkata', enabledAreas: ['fitness'], onboardingStep: null, displayName: '', appearance: 'system', gardenSeason: 'dawn', voice: 'gentle', focusWindow: 'learn', celebration: 'full', contextualAmbience: true, gymPlaces: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Morning gym', latitude: 12.9716, longitude: 77.5946, radiusMeters: 250 }] }, tasks: [], completions: [], goals: [], milestones: [], progressEntries: [], checkins: [], activities: [], proofs: [] };
  const client = { getSetupStatus: vi.fn().mockResolvedValue({ setupRequired: false }), getSession: vi.fn().mockResolvedValue({ user: snapshot.user, csrfToken: 'csrf' }), sync: vi.fn().mockResolvedValue(snapshot), setCsrf: vi.fn(), mutate: vi.fn(), uploadProof: vi.fn(), setup: vi.fn(), login: vi.fn(), logout: vi.fn(), exportUrl: '/api/export' };
  render(<AppProvider client={client}><App /></AppProvider>);

  expect(await screen.findByText('At Morning gym')).toBeVisible();
  expect(await screen.findByText('Rain nearby · Tidemark feels calmer')).toBeVisible();
  await waitFor(() => expect(document.documentElement.dataset.weather).toBe('rain'));
  expect(weatherFetch.mock.calls[0][0]).toContain('latitude=12.97&longitude=77.59');
  await userEvent.click(screen.getByRole('button', { name: 'Start workout at Morning gym' }));
  expect(await screen.findByRole('heading', { name: 'Get stronger' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Set up my gym' })).toBeVisible();
});
