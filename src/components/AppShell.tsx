import { BrandMark } from './BrandMark';
import type { ReactNode } from 'react';
import { AmbientGarden } from './AmbientGarden';
import { BottomNav, type AppSection } from './BottomNav';

type Props = {
  active: AppSection;
  onNavigate: (section: AppSection) => void;
  children: ReactNode;
  context?: ReactNode;
  onOpenSettings?: () => void;
};

export function AppShell({ active, onNavigate, children, context, onOpenSettings }: Props) {
  return (
    <div className="app-shell" data-section={active}>
      <AmbientGarden />
      <aside className="brand-rail" aria-label="Tidemark">
        <div className="brand-mark" aria-hidden="true"><BrandMark /></div>
        <span className="brand-name">Tidemark</span>
      </aside>
      <main className="app-main">{onOpenSettings && <button className="settings-button" type="button" onClick={onOpenSettings} aria-label="Settings">☰</button>}{context}<div className="page-stage" key={active}>{children}</div></main>
      <BottomNav active={active} onNavigate={onNavigate} />
    </div>
  );
}
