import { useEffect, useState } from 'react';
import type { Task } from '../domain/types';

export function FocusJourney({ task, onFinish }: { task: Task; onFinish(minutes: number): Promise<void> }) {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(true);
  useEffect(() => { if (!running) return; const timer = window.setInterval(() => setSeconds(value => value + 1), 1000); return () => clearInterval(timer); }, [running]);
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  const remaining = String(seconds % 60).padStart(2, '0');
  return <div className="focus-journey"><div className="focus-orbit"><span>{minutes}:{remaining}</span></div><h3>{task.title}</h3><p>Stay with this one thing.</p><button className="primary-button" onClick={async () => { setRunning(false); await onFinish(Math.max(1, Math.ceil(seconds / 60))); }}>Finish focus</button><button className="text-button" onClick={() => setRunning(value => !value)}>{running ? 'Pause' : 'Resume'}</button></div>;
}
