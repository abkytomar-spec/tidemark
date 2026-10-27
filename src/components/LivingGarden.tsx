import { useEffect, useRef, useState } from 'react';
import { gardenStage } from '../domain/garden';
import type { Celebration, GardenSeason } from '../domain/types';

export function LivingGarden({ done, total, streak, season, celebration }: { done: number; total: number; streak: number; season: GardenSeason; celebration: Celebration }) {
  const stage = gardenStage(done, total);
  const previous = useRef(done);
  const [celebrating, setCelebrating] = useState(false);
  useEffect(() => {
    if (done <= previous.current) { previous.current = done; return; }
    previous.current = done;
    const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reduced) {
      setCelebrating(true);
      if (celebration === 'full') navigator.vibrate?.(12);
      const timer = window.setTimeout(() => setCelebrating(false), 700);
      return () => window.clearTimeout(timer);
    }
  }, [celebration, done]);
  const rank = ['soil', 'sprout', 'leaves', 'bloom', 'lantern'].indexOf(stage);
  const level = [124, 108, 92, 76, 60][rank];
  const wave = (y: number) => `M-10 ${y}c12-6 24-6 38 0s26 6 38 0 26-6 38 0 26 6 38 0 26-6 38 0 26 6 38 0 26-6 38 0 26 6 38 0v80H-10Z`;
  return <div className={`living-garden tide-gauge stage-${stage} ${celebrating ? 'celebrating' : ''}`} data-season={season}>
    <svg role="img" aria-label={`Tide gauge: ${stage}, ${done} of ${total} tasks complete`} viewBox="0 0 180 150">
      <defs><clipPath id="tide-porthole"><circle cx="90" cy="76" r="62" /></clipPath></defs>
      <circle className="tide-ring" cx="90" cy="76" r="68" />
      <g clipPath="url(#tide-porthole)">
        <rect className="tide-sky" x="20" y="10" width="140" height="140" />
        {rank >= 4 && <path className="tide-beam" d="M90 34 160 12v44Z M90 34 20 12v44Z" />}
        <g className="tide-tower" aria-hidden="true">
          <path d="M80 136 84 44h12l4 92Z" />
          <path className="tide-stripe" d="M82.6 76h14.8l.7 14H81.9Z M81.4 104h17.2l.6 14H80.8Z" />
          <rect x="82" y="32" width="16" height="12" rx="2" />
          <path d="M80 32h20l-10-9Z" />
          <circle className="tide-lamp" cx="90" cy="38" r={rank >= 1 ? 4 : 2.5} />
        </g>
        <g className="tide-water" aria-hidden="true">
          <path className="tide-wave back" d={wave(level - 3)} />
          <path className="tide-wave front" d={wave(level)} />
        </g>
        <g className="tide-marks" aria-hidden="true">{[124, 108, 92, 76, 60].map(y => <path key={y} d={`M30 ${y}h8`} />)}</g>
      </g>
      {celebrating && <g className="tide-spray" aria-hidden="true"><circle cx="48" cy="52" r="3.5" /><circle cx="132" cy="62" r="3.5" /><circle cx="62" cy="24" r="2.5" /><circle cx="123" cy="19" r="2.5" /></g>}
    </svg>
    <span>{total ? `${done}/${total}` : 'open'} · {streak} day tide</span>
  </div>;
}
