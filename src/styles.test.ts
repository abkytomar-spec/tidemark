import styles from './styles.css?raw';

test('text-entry controls use a 16px mobile font without disabling viewport zoom', () => {
  const mobile = extractBlock(styles, '@media (max-width: 899px)');
  const outsideMobile = styles.slice(0, mobile.start) + styles.slice(mobile.end);
  const controls = /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\),\s*select,\s*textarea\s*\{[^}]*font-size:\s*16px;/g;

  expect([...mobile.text.matchAll(controls)]).toHaveLength(1);
  expect([...outsideMobile.matchAll(controls)]).toHaveLength(0);
  expect(styles).not.toMatch(/(?:user-scalable\s*=\s*no|maximum-scale\s*=\s*1)/i);
});

test('Daily Snapshot controls stay tappable, contained, and still under reduced motion', () => {
  expect(styles).toMatch(/\.daily-moment[^\{]*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere;/);
  expect(styles).toMatch(/\.daily-moment[^\{]*button[^\{]*\{[^}]*min-height:\s*44px;/);
  expect(styles).toMatch(/\.moment-switch[^\{]*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/);
  expect(styles).toMatch(/\.log-tabs button[^\{]*\{[^}]*min-height:\s*44px;/);
  expect(styles).toMatch(/\.moment-times[^\{]*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  const reduced = extractBlock(styles, '@media (prefers-reduced-motion: reduce)');
  expect(reduced.text).toMatch(/animation-duration:\s*\.01ms\s*!important;/);
});

test('Today keeps the optional photo prompt compact and secondary', () => {
  expect(styles).toMatch(/\.moment-prompt[^\{]*\{[^}]*grid-template-columns:\s*42px\s+minmax\(0,\s*1fr\)\s+auto\s+auto;/);
  expect(styles).toMatch(/\.moment-prompt[^\{]*\{[^}]*padding:\s*10px\s+12px;/);
  expect(styles).toMatch(/\.moment-seed[^\{]*\{[^}]*transform:/);
  expect(styles).toMatch(/\.moment-camera-caption[^\{]*\{[^}]*display:\s*grid;/);
});

test('context ambience and workout-place cards keep one responsive visual layer', () => {
  expect(styles).toMatch(/:root\[data-dayphase="night"\]/);
  expect(styles).toMatch(/:root\[data-weather="rain"\]/);
  expect(styles).toMatch(/\.context-whisper[^{]*\{[^}]*border-radius:/);
  expect(styles).toMatch(/\.gym-arrival[^{]*\{[^}]*position:\s*fixed;/);
  expect(styles).toMatch(/\.gym-places[^{]*\{[^}]*border-radius:/);
  expect(styles).toMatch(/\.gym-place-form[^{]*\{[^}]*grid-template-columns:/);
});

test('the complete interface shares time-aware 3D materials and restrained weather motion', () => {
  for (const phase of ['dawn', 'day', 'dusk', 'night']) expect(styles).toContain(`:root[data-dayphase="${phase}"]`);
  for (const token of ['--phase-surface', '--phase-edge', '--phase-shadow', '--phase-spark']) expect(styles).toContain(token);
  expect(styles).toMatch(/\.ambient-garden[^{]*\{[^}]*perspective:/);
  expect(styles).toMatch(/\.ambient-sky[^{]*\{[^}]*transform-style:\s*preserve-3d;/);
  expect(styles).toMatch(/\.ambient-sky[^{]*\{[^}]*translate3d\(/);
  expect(styles).toMatch(/:root\[data-weather="rain"\][^{]*\.weather-rain/);
  expect(styles).toMatch(/:root\[data-weather="cloud"\][^{]*\.weather-cloud/);
  expect(styles).toMatch(/:root\[data-weather="snow"\][^{]*\.weather-snow/);
  expect(styles).toMatch(/\.app-shell\[data-section="gym"\]/);
  expect(styles).toMatch(/\.app-shell\[data-section="goals"\]/);
  expect(styles).toMatch(/\.page-stage[^{]*\{[^}]*animation:/);
  expect(styles).toMatch(/\.nav-item\.active[^{]*\{[^}]*transform:/);
  expect(styles).toMatch(/\.bottom-nav[^{]*\{[^}]*position:\s*fixed;/);
  expect(styles).not.toMatch(/\.app-main,\s*\.brand-rail,\s*\.bottom-nav/);
  expect(styles).toMatch(/\.task-card[^{]*\{[^}]*var\(--phase-surface\)/);
  expect(styles).toMatch(/\.sheet[^{]*\{[^}]*var\(--phase-surface\)/);
  const reduced = extractBlock(styles, '@media (prefers-reduced-motion: reduce)');
  expect(reduced.text).toContain('.ambient-garden');
});

function extractBlock(css: string, marker: string) {
  const start = css.indexOf(marker);
  const open = css.indexOf('{', start);
  let depth = 0;

  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}' && --depth === 0) return { start, end: index + 1, text: css.slice(start, index + 1) };
  }

  throw new Error(`Unclosed CSS block: ${marker}`);
}
