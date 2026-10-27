import { useState } from 'react';
import type { Appearance, Celebration, DailyMomentSettings, FocusWindow, GardenSeason, LifeArea, User, Voice } from '../domain/types';
import { DailyMomentSetup } from './DailyMoment';

const areas: Array<{ id: LifeArea; label: string }> = [
  { id: 'fitness', label: 'Fitness' }, { id: 'learning', label: 'Learning' }, { id: 'work', label: 'Work & creative' },
  { id: 'money', label: 'Money' }, { id: 'wellbeing', label: 'Wellbeing' }, { id: 'home', label: 'Home' },
];

export type SettingsValue = {
  enabledAreas: LifeArea[]; displayName: string; appearance: Appearance; gardenSeason: GardenSeason;
  voice: Voice; focusWindow: FocusWindow; celebration: Celebration; contextualAmbience: boolean;
};

export function SettingsSheet({ open, user, dailyMoment, localOnly = false, onClose, onSave, onSaveDailyMoment, onLogout, onInstall, onExport }: {
  open: boolean; user: User; dailyMoment?: DailyMomentSettings; localOnly?: boolean; onClose(): void; onSave(value: SettingsValue): Promise<void>; onSaveDailyMoment?(value: DailyMomentSettings): Promise<void>; onLogout(): Promise<void>; onInstall?(): void; onExport?(): Promise<void>;
}) {
  const [value, setValue] = useState<SettingsValue>({ enabledAreas: user.enabledAreas, displayName: user.displayName, appearance: user.appearance, gardenSeason: user.gardenSeason, voice: user.voice, focusWindow: user.focusWindow, celebration: user.celebration, contextualAmbience: user.contextualAmbience ?? false });
  if (!open) return null;
  const set = <K extends keyof SettingsValue>(key: K, next: SettingsValue[K]) => setValue(current => ({ ...current, [key]: next }));
  const toggle = (area: LifeArea) => set('enabledAreas', value.enabledAreas.includes(area) ? value.enabledAreas.filter(item => item !== area) : [...value.enabledAreas, area]);
  return <div className="sheet-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="sheet settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="sheet-handle" aria-hidden="true" />
      <header className="sheet-header"><div><p className="eyebrow">Your space</p><h2 id="settings-title">Settings</h2></div><button className="icon-button" onClick={onClose} aria-label="Close settings">×</button></header>
      <fieldset className="appearance-choices"><legend>Appearance</legend>{(['system', 'light', 'dark'] as Appearance[]).map(item => <label key={item}><input type="radio" name="appearance" checked={value.appearance === item} onChange={() => set('appearance', item)} /><span>{item[0].toUpperCase() + item.slice(1)}</span></label>)}</fieldset>
      <details className="personalization"><summary>Make it mine</summary><div className="personalization-fields">
        <label><span>Display name</span><input value={value.displayName} maxLength={80} onChange={event => set('displayName', event.target.value)} /></label>
        <label><span>Voice</span><select value={value.voice} onChange={event => set('voice', event.target.value as Voice)}><option value="gentle">Gentle</option><option value="focused">Focused</option><option value="cheerful">Cheerful</option></select></label>
        <label><span>Tide theme</span><select value={value.gardenSeason} onChange={event => set('gardenSeason', event.target.value as GardenSeason)}><option value="dawn">Coral reef</option><option value="rain">Lagoon</option><option value="moon">Midnight sea</option></select></label>
        <label><span>Focus window</span><select value={value.focusWindow} onChange={event => set('focusWindow', event.target.value as FocusWindow)}><option value="learn">Learn my rhythm</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option></select></label>
        <fieldset><legend>Celebrations</legend><label><input type="radio" name="celebration" checked={value.celebration === 'quiet'} onChange={() => set('celebration', 'quiet')} />Quiet celebrations</label><label><input type="radio" name="celebration" checked={value.celebration === 'full'} onChange={() => set('celebration', 'full')} />Full celebrations</label></fieldset>
      </div></details>
      <fieldset className="area-choices"><legend>Life areas</legend>{areas.map(area => <label key={area.id}><input type="checkbox" checked={value.enabledAreas.includes(area.id)} onChange={() => toggle(area.id)} />{area.label}</label>)}</fieldset>
      <div className="settings-row daily-moment-row"><span>Location & weather<small>Optional · local ambience and nearby workout prompts</small></span><label className="moment-switch"><input aria-label="Use local weather ambience" type="checkbox" checked={value.contextualAmbience} onChange={event => set('contextualAmbience', event.target.checked)} /><span aria-hidden="true" /></label></div>
      {dailyMoment && onSaveDailyMoment && <DailyMomentSetup value={dailyMoment} onSave={onSaveDailyMoment} />}
      <div className="settings-row"><span>Timezone</span><strong>{user.timezone}</strong></div>
      {localOnly && <div className="settings-row daily-moment-row"><span>Storage<small>Your data is stored on this device only.</small></span><strong>This device</strong></div>}
      {onExport ? <button className="settings-row button-row" onClick={() => void onExport()}><span>Download backup</span><strong>JSON ↓</strong></button> : <a className="settings-row" href="/api/export" download><span>Download backup</span><strong>JSON ↓</strong></a>}
      {onInstall && <button className="settings-row button-row" onClick={onInstall}><span>Install Tidemark</span><strong>＋</strong></button>}
      <button className="primary-button" onClick={async () => { await onSave(value); onClose(); }}>Save changes</button>
      {!localOnly && <button className="text-button danger" onClick={onLogout}>Sign out</button>}
    </section>
  </div>;
}
