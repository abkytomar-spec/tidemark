import { useEffect, useState } from 'react';

const meditations = {
  Sleep: 'Let your shoulders soften. Breathe in slowly, then make the out-breath a little longer. Nothing else needs solving tonight.',
  Habits: 'Notice one tiny action you can repeat. Breathe in with intention, and out with patience. Small repetitions are enough.',
  Confidence: 'Sit tall without forcing it. Breathe in steadiness and let doubt pass without arguing with it. You can take the next step.',
  Productivity: 'Choose the single thing that matters now. Breathe in, let the noise settle, and return your attention to that one clear step.',
} as const;
type Path = keyof typeof meditations;
const breakMinutes = (focus: 25 | 50) => focus === 25 ? 5 : 10;

export function WellnessTools() {
  const [mode, setMode] = useState<'focus' | 'meditate'>('focus');
  const [focus, setFocus] = useState<25 | 50>(25);
  const [phase, setPhase] = useState<'focus' | 'rest'>('focus');
  const [target, setTarget] = useState(25 * 60);
  const [left, setLeft] = useState(25 * 60);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [path, setPath] = useState<Path>('Sleep');
  const running = endsAt !== null;
  useEffect(() => () => { if ('speechSynthesis' in window) speechSynthesis.cancel(); }, []);

  function begin(minutes: number) {
    const seconds = Math.round(minutes * 60);
    setTarget(seconds);
    setLeft(seconds);
    setEndsAt(Date.now() + seconds * 1000);
  }

  // Anchored to a wall-clock deadline instead of counting ticks: a backgrounded tab throttles
  // intervals, so a counted 25 minutes silently runs long. The phase change also has to happen here
  // rather than inside a setLeft updater — StrictMode double-invokes updaters and would skip a phase.
  useEffect(() => {
    if (endsAt === null) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining > 0) return;
      chime();
      if (mode === 'meditate') { setEndsAt(null); return; }
      const next = phase === 'focus' ? 'rest' : 'focus';
      setPhase(next);
      begin(next === 'focus' ? focus : breakMinutes(focus));
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [endsAt, focus, mode, phase]);

  const chooseFocus = (minutes: 25 | 50) => { setFocus(minutes); setPhase('focus'); setTarget(minutes * 60); setLeft(minutes * 60); setEndsAt(null); };
  const beginMeditation = () => {
    begin(3);
    if ('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) {
      speechSynthesis.cancel();
      speechSynthesis.speak(new SpeechSynthesisUtterance(meditations[path]));
    }
  };

  const face = <div className={`wellness-clock${running ? ' running' : ''}${mode === 'focus' && phase === 'rest' ? ' resting' : ''}`} style={{ '--progress': target ? 1 - left / target : 0 } as React.CSSProperties}><span>{clock(left)}</span></div>;
  return <div className="wellness-tools">
    <nav aria-label="Focus and calm"><button aria-pressed={mode === 'focus'} onClick={() => { setMode('focus'); chooseFocus(focus); }}>Pomodoro</button><button aria-pressed={mode === 'meditate'} onClick={() => { setMode('meditate'); setEndsAt(null); setTarget(3 * 60); setLeft(3 * 60); }}>Meditate</button></nav>
    {mode === 'focus'
      ? <section><p className="eyebrow">{phase === 'focus' ? 'Deep focus' : 'Shore break'}</p>{face}<div className="wellness-choices"><button aria-pressed={focus === 25} onClick={() => chooseFocus(25)}>25 / 5</button><button aria-pressed={focus === 50} onClick={() => chooseFocus(50)}>50 / 10</button></div>
        <button className="primary-button" onClick={() => setEndsAt(running ? null : Date.now() + left * 1000)}>{running ? 'Pause timer' : left < target ? 'Resume timer' : phase === 'focus' ? 'Start focus' : 'Start break'}</button>
        <button className="text-button" disabled={!running && left === target} onClick={() => chooseFocus(focus)}>Reset</button></section>
      : <section><p className="eyebrow">Three guided minutes</p>{face}<div className="meditation-paths">{(Object.keys(meditations) as Path[]).map(item => <button key={item} aria-pressed={path === item} onClick={() => setPath(item)}>{item}</button>)}</div><p className="meditation-preview">{meditations[path]}</p><button className="primary-button" onClick={beginMeditation}>{running ? 'Restart meditation' : 'Begin meditation'}</button></section>}
  </div>;
}

function clock(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

// A timer that ends in silence is a timer you miss. Vibration covers the phone, one soft tone covers
// the rest; both are best-effort — jsdom has no AudioContext and autoplay policy can refuse the tone.
function chime() {
  navigator.vibrate?.([90, 70, 140]);
  try {
    const audio = new AudioContext();
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.frequency.value = 587.33;
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, audio.currentTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 1.4);
    tone.connect(gain).connect(audio.destination);
    tone.start();
    tone.stop(audio.currentTime + 1.5);
    tone.onended = () => void audio.close();
  } catch { /* no AudioContext, or autoplay policy refused the tone */ }
}
