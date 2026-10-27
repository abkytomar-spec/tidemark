import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installCameraMock } from '../test/camera';
import { SettingsSheet } from './SettingsSheet';
import type { DailyMomentSettings, User } from '../domain/types';

const user: User = { id: 'u', email: 'owner@example.com', timezone: 'Asia/Kolkata', enabledAreas: ['fitness'], onboardingStep: null, displayName: '', appearance: 'system', gardenSeason: 'dawn', voice: 'gentle', focusWindow: 'learn', celebration: 'quiet' };
const disabledMoment = { enabled: false, windowStart: '12:00', windowEnd: '17:00', notifications: false };

test('enables an open-app-only Daily Snapshot with a preset quiet window', async () => {
  const onSaveDailyMoment = vi.fn<(value: DailyMomentSettings) => Promise<void>>().mockResolvedValue(undefined);
  renderSettings(onSaveDailyMoment);

  await userEvent.click(screen.getByRole('checkbox', { name: 'Daily Snapshot' }));
  await userEvent.selectOptions(screen.getByLabelText('Quiet window'), 'evening');
  expect(screen.getByRole('checkbox', { name: 'Gentle reminder' })).not.toBeChecked();
  await userEvent.click(screen.getByRole('button', { name: 'Enable Daily Snapshot' }));

  expect(onSaveDailyMoment).toHaveBeenCalledWith({ enabled: true, windowStart: '17:00', windowEnd: '21:00', notifications: false });
  expect(document.querySelector('input[type="file"]')).toBeNull();
});

test('requests notification permission only after the reminder is chosen', async () => {
  const requestPermission = vi.fn().mockResolvedValue('granted');
  vi.stubGlobal('Notification', class { static permission = 'default'; static requestPermission = requestPermission; });
  const onSaveDailyMoment = vi.fn<(value: DailyMomentSettings) => Promise<void>>().mockResolvedValue(undefined);
  renderSettings(onSaveDailyMoment);

  await userEvent.click(screen.getByRole('checkbox', { name: 'Daily Snapshot' }));
  expect(requestPermission).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Gentle reminder' }));
  await userEvent.click(screen.getByRole('button', { name: 'Enable Daily Snapshot' }));

  expect(requestPermission).toHaveBeenCalledOnce();
  expect(onSaveDailyMoment).toHaveBeenCalledWith(expect.objectContaining({ notifications: true }));
  vi.unstubAllGlobals();
});

test('uses native custom times and tests the camera without saving a photo', async () => {
  const stop = vi.fn();
  installCameraMock(vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] } as unknown as MediaStream));
  const onSaveDailyMoment = vi.fn<(value: DailyMomentSettings) => Promise<void>>().mockResolvedValue(undefined);
  renderSettings(onSaveDailyMoment);

  await userEvent.click(screen.getByRole('checkbox', { name: 'Daily Snapshot' }));
  await userEvent.selectOptions(screen.getByLabelText('Quiet window'), 'custom');
  expect(screen.getByLabelText('Start time')).toHaveAttribute('type', 'time');
  expect(screen.getByLabelText('End time')).toHaveAttribute('type', 'time');
  await userEvent.click(screen.getByRole('button', { name: 'Test camera' }));
  expect(await screen.findByLabelText('Live camera preview')).toBeVisible();
  expect(document.querySelector('input[type="file"]')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Capture' }));
  expect(await screen.findByText('Photo ready')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Close Test Daily Snapshot camera' }));

  expect(stop).toHaveBeenCalled();
  expect(onSaveDailyMoment).not.toHaveBeenCalled();
});

test('disabling Daily Snapshot also keeps Task 3 open-app-only', async () => {
  const onSaveDailyMoment = vi.fn<(value: DailyMomentSettings) => Promise<void>>().mockResolvedValue(undefined);
  renderSettings(onSaveDailyMoment, { ...disabledMoment, enabled: true });

  await userEvent.click(screen.getByRole('checkbox', { name: 'Daily Snapshot' }));

  expect(onSaveDailyMoment).toHaveBeenCalledWith({ enabled: false, windowStart: '12:00', windowEnd: '17:00', notifications: false });
});

test('keeps the global location and weather preference in Settings', async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  renderSettings(vi.fn(), disabledMoment, onSave);

  await userEvent.click(screen.getByRole('checkbox', { name: 'Use local weather ambience' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ contextualAmbience: true }));
});

function renderSettings(onSaveDailyMoment: (value: DailyMomentSettings) => Promise<void>, dailyMoment = disabledMoment, onSave = vi.fn()) {
  return render(<SettingsSheet
    open
    user={user}
    dailyMoment={dailyMoment}
    onClose={vi.fn()}
    onSave={onSave}
    onSaveDailyMoment={onSaveDailyMoment}
    onLogout={vi.fn()}
  />);
}
