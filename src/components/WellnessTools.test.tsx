import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WellnessTools } from './WellnessTools';

test('offers a Pomodoro and native guided meditation in one compact tool', async () => {
  const speak = vi.fn();
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
  vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn() });
  render(<WellnessTools />);

  expect(screen.getByText('25:00')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Meditate' }));
  await userEvent.click(screen.getByRole('button', { name: 'Productivity' }));
  await userEvent.click(screen.getByRole('button', { name: 'Begin meditation' }));

  expect(speak).toHaveBeenCalledOnce();
  expect(screen.getByText('03:00')).toBeVisible();
  vi.unstubAllGlobals();
});

test('the focus clock follows wall time, rolls into its break, and resets', () => {
  vi.useFakeTimers();
  try {
    render(<WellnessTools />);
    fireEvent.click(screen.getByRole('button', { name: 'Start focus' }));

    // One tick after 24 minutes of wall time: a timer counting its own ticks would still read 24:59.
    vi.setSystemTime(Date.now() + 24 * 60_000);
    act(() => void vi.advanceTimersByTime(250));
    expect(screen.getByText('01:00')).toBeVisible();

    vi.setSystemTime(Date.now() + 60_000);
    act(() => void vi.advanceTimersByTime(250));
    expect(screen.getByText('Shore break')).toBeVisible();
    expect(screen.getByText('05:00')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByText('Deep focus')).toBeVisible();
    expect(screen.getByText('25:00')).toBeVisible();
  } finally { vi.useRealTimers(); }
});
