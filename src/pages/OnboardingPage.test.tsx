import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardingPage } from './OnboardingPage';

test('shows only relevant onboarding choices and reaches the first task', async () => {
  const savePreferences = vi.fn().mockResolvedValue(undefined);
  render(<OnboardingPage initialStep="areas" enabledAreas={[]} tasks={[]} savePreferences={savePreferences} createTask={vi.fn()} completeTask={vi.fn()} />);
  await userEvent.click(screen.getByRole('checkbox', { name: 'Fitness' }));
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByRole('heading', { name: 'Add your first item' })).toBeVisible();
  expect(screen.queryByText(/all features/i)).not.toBeInTheDocument();
  expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({ enabledAreas: ['fitness'], onboardingStep: 'first-item' }));
});

test('onboarding can be skipped without losing chosen areas', async () => {
  const savePreferences = vi.fn().mockResolvedValue(undefined);
  render(<OnboardingPage initialStep="areas" enabledAreas={['learning']} tasks={[]} savePreferences={savePreferences} createTask={vi.fn()} completeTask={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
  expect(savePreferences).toHaveBeenCalledWith({ enabledAreas: ['learning'], onboardingStep: null });
});
