export function DayOrbit({ percent, completed, total }: { percent: number; completed: number; total: number }) {
  const radius = 50;
  const angle = -90 + percent * 3.6;
  const x = 64 + radius * Math.cos(angle * Math.PI / 180);
  const y = 64 + radius * Math.sin(angle * Math.PI / 180);
  return <div className="day-orbit" data-completion-motion>
    <svg viewBox="0 0 128 128" role="img" aria-label={`${percent}% complete, ${completed} of ${total} tasks`}>
      <circle className="orbit-track" cx="64" cy="64" r={radius} />
      <circle className="orbit-progress" cx="64" cy="64" r={radius} pathLength="100" strokeDasharray={`${percent} 100`} />
      <circle className="orbit-sun" cx={x} cy={y} r="7" />
    </svg>
    <div><strong>{percent}%</strong><span>{total ? `${completed} of ${total}` : 'Clear day'}</span></div>
  </div>;
}
