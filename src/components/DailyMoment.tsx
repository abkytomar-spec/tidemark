import { format, parseISO } from 'date-fns';
import { useEffect, useState } from 'react';
import type { DailyMomentDay, DailyMomentSettings, DailyMomentSnapshot, ProofPhoto } from '../domain/types';
import { CameraCapture } from './CameraCapture';
import { Sheet } from './Sheet';

const windows = {
  morning: ['08:00', '12:00'],
  afternoon: ['12:00', '17:00'],
  evening: ['17:00', '21:00'],
} as const;
type WindowChoice = keyof typeof windows | 'custom';

export function DailyMomentSetup({ value, onSave }: { value: DailyMomentSettings; onSave(value: DailyMomentSettings): Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [camera, setCamera] = useState(false);
  const [choice, setChoice] = useState<WindowChoice>(() => matchingWindow(value));
  const [start, setStart] = useState(value.windowStart);
  const [end, setEnd] = useState(value.windowEnd);
  const [saving, setSaving] = useState(false);
  const [notifications, setNotifications] = useState(value.notifications);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const [windowStart, windowEnd] = choice === 'custom' ? [start, end] : windows[choice];
    setSaving(true);
    setError(null);
    try {
      await onSave({ enabled: true, windowStart, windowEnd, notifications });
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Daily Snapshot could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="daily-moment daily-moment-settings">
    <div className="settings-row daily-moment-row">
      <span>Daily Snapshot<small>{value.enabled ? `${value.windowStart}–${value.windowEnd}` : 'Optional · open-app only'}</small></span>
      <label className="moment-switch"><input aria-label="Daily Snapshot" type="checkbox" checked={value.enabled} onChange={event => event.target.checked ? setOpen(true) : void onSave({ ...value, enabled: false, notifications: false })} /><span aria-hidden="true" /></label>
      {value.enabled && <button type="button" onClick={() => setOpen(true)}>Edit</button>}
    </div>
    <Sheet open={open} title="Set up Daily Snapshot" onClose={() => setOpen(false)}>
      <form className="moment-setup" onSubmit={event => { event.preventDefault(); void save(); }}>
        <p>Tidemark chooses one quiet time each day. You can capture it or simply let it pass.</p>
        <label><span>Quiet window</span><select value={choice} onChange={event => setChoice(event.target.value as WindowChoice)}><option value="morning">Morning · 08:00–12:00</option><option value="afternoon">Afternoon · 12:00–17:00</option><option value="evening">Evening · 17:00–21:00</option><option value="custom">Custom</option></select></label>
        {choice === 'custom' && <div className="moment-times"><label><span>Start time</span><input type="time" required value={start} onChange={event => setStart(event.target.value)} /></label><label><span>End time</span><input type="time" required value={end} onChange={event => setEnd(event.target.value)} /></label></div>}
        <label className="moment-reminder"><input aria-label="Gentle reminder" type="checkbox" checked={notifications} onChange={async event => { if (!event.target.checked) return setNotifications(false); if (!('Notification' in window)) return setError('Notifications are not supported on this device.'); const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission(); setNotifications(permission === 'granted'); if (permission !== 'granted') setError('Allow notifications in your browser to use the reminder.'); }} /><span>Gentle reminder<small>Appears at today’s chosen time.</small></span></label>
        <button className="text-button" type="button" onClick={() => setCamera(true)}>Test camera</button>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={saving}>{saving ? 'Saving…' : value.enabled ? 'Save Daily Snapshot' : 'Enable Daily Snapshot'}</button>
      </form>
    </Sheet>
    <Sheet open={camera} title="Test Daily Snapshot camera" onClose={() => setCamera(false)}><CameraCapture onSave={() => setCamera(false)} /></Sheet>
  </div>;
}

export function DailyMomentPrompt({ value, onCapture, onSkip }: { value?: DailyMomentSnapshot; onCapture(day: DailyMomentDay, file: File, caption: string): Promise<void>; onSkip(date: string): Promise<void> }) {
  const [camera, setCamera] = useState(false);
  const [caption, setCaption] = useState('');
  const [dismissedDate, setDismissedDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const day = value?.today;
  useEffect(() => {
    if (!value?.settings.notifications || !value.eligiblePrompt || !day || !('Notification' in window) || Notification.permission !== 'granted') return;
    const key = `tidemark:daily-moment-notified:${day.localDate}`;
    try {
      const previous = JSON.parse(localStorage.getItem(key) ?? '{"count":0,"lastAt":0}') as { count: number; lastAt: number };
      if (previous.count >= 2 || Date.now() - previous.lastAt < 2 * 60 * 60 * 1000) return;
      new Notification('A tiny piece of today?', { body: 'Open Tidemark and save an ordinary moment.', tag: key });
      localStorage.setItem(key, JSON.stringify({ count: previous.count + 1, lastAt: Date.now() }));
    } catch { /* Browser storage or notifications can be unavailable without breaking Today. */ }
  }, [day, value?.eligiblePrompt, value?.settings.notifications]);
  if (!value?.settings.enabled || !day || !['scheduled', 'sent'].includes(day.status)) return null;
  const reminder = value.eligiblePrompt && dismissedDate !== day.localDate;

  return <aside className={`daily-moment moment-prompt ${reminder ? 'is-reminder' : ''}`}>
    <span className="moment-seed" aria-hidden="true">◇</span>
    <div className="moment-copy"><p className="eyebrow">Daily photo</p><strong>{reminder ? 'A tiny piece of today?' : 'Capture today'}</strong><small>{reminder ? 'Your gentle reminder is here.' : 'Whenever it feels right.'}</small></div>
    <button className="moment-capture" type="button" aria-label="Capture daily photo" onClick={() => setCamera(true)}>Capture</button>
    {reminder && <button className="moment-dismiss" type="button" aria-label="Not today" title="Not today" disabled={busy} onClick={async () => { setBusy(true); setError(null); try { await onSkip(day.localDate); setDismissedDate(day.localDate); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Daily Snapshot could not be skipped.'); } finally { setBusy(false); } }}>×</button>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <Sheet open={camera} title="Capture Daily Snapshot" onClose={() => setCamera(false)}><label className="moment-camera-caption"><span>Caption (optional)</span><input maxLength={240} value={caption} onChange={event => setCaption(event.target.value)} placeholder="A few words for later" /></label><CameraCapture busy={busy} onSave={async file => { setBusy(true); setError(null); try { await onCapture(day, file, caption); setCamera(false); setCaption(''); if (reminder) setDismissedDate(day.localDate); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Daily Snapshot could not be saved.'); throw caught; } finally { setBusy(false); } }} /></Sheet>
  </aside>;
}

export function MomentGarden({ days, proofs, onDeleteProof }: { days: DailyMomentDay[]; proofs: ProofPhoto[]; onDeleteProof(proof: ProofPhoto): Promise<void> }) {
  const [selected, setSelected] = useState<{ day: DailyMomentDay; proof: ProofPhoto } | null>(null);
  const moments = days.flatMap(day => {
    return proofs.filter(item => item.ownerType === 'daily_moment' && item.ownerId === day.id).map(proof => ({ day, proof }));
  }).sort((a, b) => b.proof.createdAt.localeCompare(a.proof.createdAt));
  const months = moments.reduce<Map<string, typeof moments>>((groups, moment) => {
    const month = format(parseISO(moment.day.localDate), 'MMMM yyyy');
    groups.set(month, [...(groups.get(month) ?? []), moment]);
    return groups;
  }, new Map());

  return <section className="daily-moment moment-garden">
    {moments.length ? [...months].map(([month, items]) => <section className="moment-month" key={month}><h2>{month}</h2><div className="moment-grid">{items.map(moment => <button key={moment.proof.id} aria-label={`Daily Snapshot from ${format(parseISO(moment.day.localDate), 'd MMM yyyy')}`} onClick={() => setSelected(moment)}><img src={moment.proof.imageUrl} alt="" loading="lazy" /><span>{format(parseISO(moment.day.localDate), 'd MMM')}</span></button>)}</div></section>) : <div className="calm-empty"><span>◇</span><h2>No Daily Snapshots yet</h2><p>Your private camera moments will gather here.</p></div>}
    <Sheet open={!!selected} title="Daily Snapshot" onClose={() => setSelected(null)}>{selected && <div className="proof-memory moment-memory"><img src={selected.proof.imageUrl} alt={`Daily Snapshot from ${format(parseISO(selected.day.localDate), 'd MMMM yyyy')}`} /><strong>Daily Snapshot</strong><p>{format(parseISO(selected.day.localDate), 'EEEE, d MMMM yyyy')} · Captured at {format(parseISO(selected.proof.createdAt), 'p')}</p>{selected.proof.caption && <blockquote>{selected.proof.caption}</blockquote>}<button className="text-button danger" type="button" onClick={async () => { await onDeleteProof(selected.proof); setSelected(null); }}>Delete moment</button></div>}</Sheet>
  </section>;
}

function matchingWindow(value: DailyMomentSettings): WindowChoice {
  return (Object.entries(windows).find(([, times]) => times[0] === value.windowStart && times[1] === value.windowEnd)?.[0] as WindowChoice | undefined) ?? 'custom';
}
