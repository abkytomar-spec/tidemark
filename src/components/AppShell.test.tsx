import { render } from '@testing-library/react';
import { AppShell } from './AppShell';

test('gives every section one hidden living world and an animated page stage', () => {
  const { container, getByRole } = render(<AppShell active="calendar" onNavigate={vi.fn()}><h1>Calendar content</h1></AppShell>);

  expect(container.querySelector('.app-shell')).toHaveAttribute('data-section', 'calendar');
  expect(container.querySelectorAll('.ambient-garden[aria-hidden="true"]')).toHaveLength(1);
  expect(container.querySelector('.ambient-orb')).toBeInTheDocument();
  expect(container.querySelector('.ambient-sky')).toBeInTheDocument();
  expect(container.querySelector('.ambient-fireflies')).toBeInTheDocument();
  expect(container.querySelector('.ambient-weather')).toBeInTheDocument();
  expect(container.querySelector('.page-stage')).toContainElement(getByRole('heading', { name: 'Calendar content' }));
  expect(getByRole('button', { name: 'Planner' })).toHaveAttribute('aria-current', 'page');
});
