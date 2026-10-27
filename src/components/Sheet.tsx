import type { ReactNode } from 'react';

export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose(): void; children: ReactNode }) {
  if (!open) return null;
  return <div className="sheet-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div className="sheet-handle" aria-hidden="true" /><header className="sheet-header"><h2 id="sheet-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label={`Close ${title}`}>×</button></header>{children}</section>
  </div>;
}
