import { expect, test } from '@playwright/test';

test('owner journey syncs tasks, goals, gym proof and memories', async ({ page, context }) => {
  const monday = upcomingMonday();
  await page.clock.setFixedTime(monday);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Let’s make today lighter.' })).toBeVisible();
  await page.getByLabel('Email').fill('owner@example.com');
  await page.getByLabel(/Password/).fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Create my space' }).click();

  await expect(page.getByRole('heading', { name: 'What deserves energy?' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Fitness' }).check();
  await page.getByRole('checkbox', { name: 'Learning' }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('What will you do?').fill('First mark');
  await page.getByRole('button', { name: 'Add to today' }).click();
  await page.getByRole('button', { name: /First mark/ }).click();
  await page.getByRole('button', { name: 'Enter Tidemark' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Dark').check();
  await page.getByText('Make it mine').click();
  await page.getByLabel('Display name').fill('Dheeraj');
  await page.getByLabel('Voice').selectOption('cheerful');
  await page.getByLabel('Tide theme').selectOption('moon');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('heading', { name: 'Hi, Dheeraj' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(await page.evaluate(() => document.documentElement.clientWidth));
  const gardenBox = await page.getByRole('img', { name: /Tide gauge/ }).boundingBox();
  const settingsBox = await page.getByRole('button', { name: 'Settings', exact: true }).boundingBox();
  expect(gardenBox!.width).toBeGreaterThan(100);
  expect(gardenBox!.y).toBeGreaterThanOrEqual(settingsBox!.y + settingsBox!.height);

  await page.getByRole('button', { name: 'Set morning heading' }).click();
  await page.getByLabel('Today I want to').fill('Make progress without rushing');
  await page.getByRole('button', { name: 'Soft' }).click();
  await page.getByRole('button', { name: 'Add as today’s task' }).click();
  await expect(page.getByText('Make progress without rushing')).toBeVisible();
  await page.getByRole('button', { name: 'Complete Make progress without rushing' }).click();

  await page.getByRole('button', { name: 'Mind sweep' }).click();
  await page.getByLabel('What is on your mind?').fill('Email Sam\nBook dentist');
  await page.getByRole('button', { name: 'Add 2 tasks' }).click();
  await expect(page.getByRole('heading', { name: 'Email Sam' })).toBeVisible();
  await page.getByRole('button', { name: 'Lighten my day' }).click();
  await page.getByRole('checkbox', { name: 'Book dentist' }).check();
  await page.getByRole('button', { name: 'Move 1 to tomorrow' }).click();
  await expect(page.getByRole('heading', { name: 'Book dentist' })).not.toBeVisible();
  await page.getByRole('button', { name: 'Complete Email Sam' }).click();
  await expect(page.getByRole('img', { name: /Tide gauge: lantern/ })).toBeVisible();

  await page.getByRole('button', { name: 'Log evening watch' }).click();
  await page.getByLabel('A win from today').fill('Finished the important work');
  await page.getByLabel('Something I appreciate').fill('A calm start');
  await page.getByRole('button', { name: 'Save evening watch' }).click();

  await addTask(page, 'Hydrate', { repeat: 'Daily' });
  await expect(page.getByRole('heading', { name: 'Hydrate' })).toBeVisible();

  await context.setOffline(true);
  await addTask(page, 'Offline note');
  await expect(page.getByRole('heading', { name: 'Offline note' })).toBeVisible();
  await expect(page.getByText(/waiting to sync/)).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText('Synced')).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Offline note' })).toBeVisible();

  await addTask(page, 'Gym selfie', { proof: true });
  await page.getByRole('button', { name: 'Complete Gym selfie' }).click();
  await page.getByRole('button', { name: 'Capture' }).click();
  await page.getByRole('button', { name: 'Save photo' }).click();
  await expect(page.getByRole('button', { name: 'Reopen Gym selfie' })).toBeVisible();

  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await page.getByRole('button', { name: 'Set up my gym' }).click();
  await expectVisibleTextControlsToUseAtLeast16px(page);
  await page.getByRole('radio', { name: 'Workout consistency' }).check();
  await page.getByRole('radio', { name: 'Fixed rest' }).check();
  await page.getByRole('checkbox', { name: 'Rest Saturday' }).check();
  for (const day of ['Monday', 'Wednesday', 'Friday']) await page.getByRole('checkbox', { name: `Train ${day}` }).check();
  await page.getByRole('button', { name: 'Create gym plan' }).click();
  await expect(page.getByRole('listitem', { name: 'Monday: Training day' })).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'Wednesday: Training day' })).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'Friday: Training day' })).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'Saturday: Planned rest' })).toBeVisible();

  await page.getByRole('button', { name: 'Create routine' }).click();
  await page.getByRole('button', { name: 'Full body', exact: true }).click();
  await expectVisibleTextControlsToUseAtLeast16px(page);
  await page.getByLabel('Squat set 1 load').fill('140');
  await page.getByLabel('Squat set 2 load').fill('75');
  await page.getByRole('button', { name: 'Save routine' }).click();
  await page.getByRole('button', { name: 'Start Full body' }).click();
  await expectVisibleTextControlsToUseAtLeast16px(page);
  await page.getByLabel('Notes').fill('Steady first session');
  await expect(page.getByRole('button', { name: 'Finish with proof' })).toBeDisabled();
  await page.reload();
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Full body workout' })).toBeVisible();
  await expect(page.getByLabel('Squat set 1 load')).toHaveValue('140');
  await expect(page.getByLabel('Squat set 2 load')).toHaveValue('75');
  await expect(page.getByLabel('Notes')).toHaveValue('Steady first session');
  await capturePhoto(page);
  await expect(page.getByRole('button', { name: 'Finish with proof' })).toBeEnabled();
  await page.getByRole('button', { name: 'Finish with proof' }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible();
  await expect(page.getByText('1 session', { exact: true })).toBeVisible();
  await expect(page.getByText('1/7 grown')).toBeVisible();
  await expect(page.getByText('75 kg × 8')).toBeVisible();
  await expect(page.getByText(/140 kg/)).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent workouts' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible();
  await expect(page.getByText('75 kg × 8')).toBeVisible();
  await page.getByRole('button', { name: 'Open proof from Full body workout' }).click();
  const proofImage = page.getByRole('img', { name: 'Workout proof' });
  await expect(proofImage).toBeVisible();
  await expect.poll(() => proofImage.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Close Workout proof' }).click();

  await page.getByRole('button', { name: 'Add gym goal' }).click();
  await page.getByRole('radio', { name: 'Body measurements' }).check();
  await expectVisibleTextControlsToUseAtLeast16px(page);
  await page.getByLabel('Weight target').fill('75');
  await page.getByRole('button', { name: 'Create gym goal' }).click();
  for (const [index, value] of ['80', '78'].entries()) {
    await page.clock.setFixedTime(new Date(monday.getTime() + index * 60_000));
    await page.getByRole('button', { name: 'Log measurement', exact: true }).click();
    await expectVisibleTextControlsToUseAtLeast16px(page);
    await page.getByLabel('Measurement value').fill(value);
    await page.getByRole('button', { name: 'Save measurement' }).click();
    await expect(page.getByRole('dialog', { name: 'Log measurement' })).not.toBeVisible();
  }
  await expect(page.getByText('First 80 kg · Latest 78 kg · Change -2 kg')).toBeVisible();

  await page.getByRole('button', { name: 'Add gym goal' }).click();
  await expectVisibleTextControlsToUseAtLeast16px(page);
  await page.getByRole('button', { name: 'Create gym goal' }).click();
  await denyCamera(page);
  await page.getByRole('button', { name: 'Add physique check-in' }).click();
  await expectVisibleTextControlsToUseAtLeast16px(page);
  await expect(page.getByText('Camera permission was denied. Allow camera access and try again.')).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await restoreCamera(page);
  await page.getByRole('button', { name: 'Try camera again' }).click();
  await expect(page.getByRole('button', { name: 'Capture' })).toBeEnabled();
  await page.getByRole('button', { name: 'Close Physique check-in' }).click();

  await page.getByRole('button', { name: 'Goals' }).click();
  await page.getByRole('button', { name: 'Learning' }).click();
  await page.getByRole('button', { name: 'Add goal' }).click();
  await expectVisibleTextControlsToUseAtLeast16px(page);
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Train', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete Full body workout' }).click();
  await expect(page.getByRole('heading', { name: 'Recent workouts' })).not.toBeVisible();
  await expect(page.getByText('75 kg × 8')).not.toBeVisible();
  await expect(page.getByText('0/7 grown')).toBeVisible();

  await page.getByRole('button', { name: 'Planner' }).click();
  await expect(page.getByRole('heading', { name: 'Hydrate' })).toBeVisible();
  await page.getByRole('button', { name: 'Logbook' }).click();
  await expect(page.getByLabel('Tide chart')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Evening watches' })).toBeVisible();
  await expect(page.getByText('Finished the important work')).toBeVisible();
  await expect(page.getByText('A calm start')).toBeVisible();
  await page.getByRole('button', { name: 'Photos' }).click();
  await page.getByRole('button', { name: /Tasks 1/ }).click();
  await expect(page.getByText('1 private memories')).toBeVisible();

  for (const tab of ['Today', 'Planner', 'Train', 'Goals', 'Logbook']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await expectNoHorizontalOverflow(page);
  }
  await expectFixedControlsStayPut(page);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: 'Add task' }).click();
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Close New task' }).click();

  const secondDevice = await context.newPage();
  await secondDevice.goto('/');
  await expect(secondDevice.locator('html')).toHaveAttribute('data-theme', 'dark');
  await secondDevice.getByRole('button', { name: 'Goals' }).click();
  await expect(secondDevice.getByRole('button', { name: /Train steadily/ })).toBeVisible();
  await secondDevice.setViewportSize({ width: 1280, height: 900 });
  await expect(secondDevice.getByText('Tidemark')).toBeVisible();
  for (const tab of ['Today', 'Planner', 'Train', 'Goals', 'Logbook']) {
    await secondDevice.getByRole('button', { name: tab, exact: true }).click();
    await expectNoHorizontalOverflow(secondDevice);
  }
  await expectFixedControlsStayPut(secondDevice);
});

test('one flexible rest exhausts the weekly allowance', async ({ page }) => {
  const monday = upcomingMonday();
  const wednesday = new Date(monday);
  wednesday.setDate(wednesday.getDate() + 2);
  await page.clock.setFixedTime(wednesday);
  await page.goto('/');
  const setupRequired = await page.evaluate(() => fetch('/api/setup/status').then(response => response.json()).then(status => status.setupRequired));
  await page.getByLabel('Email').fill('owner@example.com');
  await page.getByLabel(/Password/).fill('correct horse battery staple');
  await page.getByRole('button', { name: setupRequired ? 'Create my space' : 'Open Tidemark' }).click();
  if (setupRequired) await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByRole('button', { name: 'Train', exact: true })).toBeVisible();

  const snapshot = await apiJson(page, '/sync');
  const latestPlan = snapshot.gym.plans.at(-1);
  const planResult = await apiJson(page, '/gym/plans', {
    ...(latestPlan ? { primaryGoalId: latestPlan.primaryGoalId } : {
      goalTitle: 'Train steadily', goalType: 'workout_consistency', targetValue: 2, unit: 'workouts', goalSettings: {},
    }),
    restMode: 'flexible',
    fixedRestWeekdays: [],
    flexibleRestAllowance: 1,
    trainingWeekdays: [3, 5],
    weeklySessionTarget: 2,
    weightUnit: 'kg',
    measurementUnit: 'cm',
    effectiveFrom: localDate(wednesday),
  });
  expect(planResult.restMode).toBe('flexible');
  await page.reload();
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ready when you are' })).toBeVisible();
  const flexibleRest = page.getByRole('button', { name: 'Make today a rest day' });
  await expect(flexibleRest).toHaveCount(1);
  await flexibleRest.click();
  await expect(page.getByRole('heading', { name: 'Planned rest' })).toBeVisible();
  await expect(page.getByText('0 flexible rests left')).toBeVisible();

  const thursday = new Date(wednesday);
  thursday.setDate(thursday.getDate() + 1);
  const exhausted = await apiJson(page, '/gym/rest', { date: localDate(thursday), kind: 'flexible' }, false);
  expect(exhausted.status).toBe(422);
  expect(exhausted.payload.error).toBe("This week's flexible rest allowance is already used.");
});

async function addTask(page: import('@playwright/test').Page, title: string, options: { repeat?: string; proof?: boolean } = {}) {
  await page.getByRole('button', { name: 'Add task' }).click();
  await expectVisibleTextControlsToUseAtLeast16px(page);
  await page.getByLabel('Title').fill(title);
  if (options.repeat || options.proof) {
    await page.getByRole('button', { name: 'More options' }).click();
    if (options.repeat) await page.getByLabel('Repeat').selectOption({ label: options.repeat });
    if (options.proof) await page.getByLabel('Proof required').check();
  }
  await page.getByRole('dialog').getByRole('button', { name: 'Add task' }).click();
}

async function capturePhoto(page: import('@playwright/test').Page) {
  const capture = page.getByRole('button', { name: 'Capture' });
  await expect(capture).toBeEnabled();
  await capture.press('Enter');
  await page.getByRole('button', { name: 'Save photo' }).press('Enter');
  await expect(page.getByRole('button', { name: 'Photo saved' })).toBeDisabled();
}

async function apiJson(page: import('@playwright/test').Page, path: string, body?: Record<string, unknown>, requireOk = true) {
  const result = await page.evaluate(async ({ path, body }) => {
    const session = await fetch('/api/session', { credentials: 'same-origin' }).then(response => response.json());
    const response = await fetch(`/api${path}`, body ? {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken, 'X-Mutation-ID': crypto.randomUUID() },
      body: JSON.stringify(body),
    } : { credentials: 'same-origin' });
    return { ok: response.ok, status: response.status, payload: await response.json() };
  }, { path, body });
  if (requireOk) expect(result.ok, JSON.stringify(result.payload)).toBe(true);
  return requireOk ? result.payload : result;
}

function upcomingMonday() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + ((1 - date.getDay() + 7) % 7 || 7));
  return date;
}

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function denyCamera(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const state = window as typeof window & { __tidemarkGetUserMedia?: typeof navigator.mediaDevices.getUserMedia };
    state.__tidemarkGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); };
  });
}

async function restoreCamera(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const state = window as typeof window & { __tidemarkGetUserMedia?: typeof navigator.mediaDevices.getUserMedia };
    if (state.__tidemarkGetUserMedia) navigator.mediaDevices.getUserMedia = state.__tidemarkGetUserMedia;
    delete state.__tidemarkGetUserMedia;
  });
}

// Task 7: call after navigating each Pixel 7 form surface.
async function expectVisibleTextControlsToUseAtLeast16px(page: import('@playwright/test').Page) {
  const fontSizes = await page.locator('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), select, textarea').evaluateAll((controls) => controls
    .filter((control) => control instanceof HTMLElement && control.checkVisibility())
    .map((control) => Number.parseFloat(getComputedStyle(control).fontSize)));

  expect(fontSizes).not.toHaveLength(0);
  expect(fontSizes.every((fontSize) => fontSize >= 16)).toBe(true);
}

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(widths.scroll).toBe(widths.client);
}

async function expectFixedControlsStayPut(page: import('@playwright/test').Page) {
  await page.evaluate(() => scrollTo(0, 0));
  const nav = page.locator('.bottom-nav');
  const settings = page.getByRole('button', { name: 'Settings', exact: true });
  const rect = (locator: ReturnType<typeof page.locator>) => locator.evaluate(element => { const box = element.getBoundingClientRect(); return { y: box.y, height: box.height, position: getComputedStyle(element).position }; });
  const before = { nav: await rect(nav), settings: await rect(settings) };
  await page.evaluate(() => scrollTo(0, Math.min(900, document.documentElement.scrollHeight - innerHeight)));
  const after = { nav: await rect(nav), settings: await rect(settings) };
  expect(before.nav.position).toBe('fixed');
  expect(before.settings.position).toBe('fixed');
  expect(Math.abs(after.nav.y - before.nav.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.settings.y - before.settings.y)).toBeLessThanOrEqual(1);
  expect(after.nav.y + after.nav.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  await page.evaluate(() => scrollTo(0, 0));
}
