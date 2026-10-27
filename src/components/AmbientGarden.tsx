import { useEffect } from 'react';

/** Writes pointer/scroll drift to the root so the ambient sky and garden parallax together. */
export function useAmbientDrift() {
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const root = document.documentElement;
    let frame = 0;
    let x = 0;
    let y = 0;
    const write = () => { frame = 0; root.style.setProperty('--drift-x', `${x}`); root.style.setProperty('--drift-y', `${y}`); };
    const queue = () => { if (!frame) frame = requestAnimationFrame(write); };
    const onPointer = (event: PointerEvent) => { x = Math.max(-1, Math.min(1, (event.clientX / window.innerWidth - .5) * 2)); queue(); };
    const onScroll = () => { y = Math.min(window.scrollY / 700, 1); queue(); };
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener('pointermove', onPointer); window.removeEventListener('scroll', onScroll); };
  }, []);
}

export function AmbientGarden() {
  useAmbientDrift();
  return <div className="ambient-garden" aria-hidden="true">
    <div className="ambient-sky"><i className="ambient-orb" /><i className="ambient-halo" /></div>
    <div className="ambient-weather"><i className="weather-cloud" /><i className="weather-rain" /><i className="weather-snow" /></div>
    <div className="ambient-sea"><i /><i /><i /></div>
    <div className="ambient-fireflies"><i /><i /><i /><i /><i /><i /></div>
  </div>;
}
