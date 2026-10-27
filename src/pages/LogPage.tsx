import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { Sheet } from '../components/Sheet';
import { MomentGarden } from '../components/DailyMoment';
import { streakFor } from '../domain/progress';
import type { ActivityEvent, DailyCheckin, ProofPhoto, Snapshot, TaskCompletion } from '../domain/types';

type Tab = 'story' | 'photos' | 'reset';
type PhotoCategory = 'gym' | 'goals' | 'tasks' | 'daily';

export function LogPage({ today = new Date(), completions, activities, proofs, checkins, globalSafe, dailyMoment, onDeleteProof, onSaveReflection }: Pick<Snapshot, 'tasks' | 'completions' | 'activities' | 'proofs' | 'checkins'> & {
  today?: Date; globalSafe?: Snapshot['globalSafe']; dailyMoment?: Snapshot['dailyMoment']; onDeleteProof(proof: ProofPhoto): Promise<void>; onSaveReflection(note: string): Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>('story');
  const [proof, setProof] = useState<ProofPhoto | null>(null);
  const completedDates = completions.filter(done => done.status !== 'pending_proof').map(done => done.occurrenceDate);
  const streak = streakFor({ cadence: 'daily', restWeekdays: [] }, globalSafe?.lastProtectedDate ? [...completedDates, globalSafe.lastProtectedDate] : completedDates, today);
  return <section className="log-page">
    <header><p className="eyebrow">Your story</p><h1>Logbook</h1></header>
    <nav className="log-tabs" aria-label="Log views">{(['story', 'photos', 'reset'] as Tab[]).map(item => <button key={item} aria-pressed={tab === item} onClick={() => setTab(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</nav>
    {tab === 'story' && <Story streak={streak} safe={globalSafe} completions={completions} activities={activities} checkins={checkins} />}
    {tab === 'photos' && <PhotoLibraries proofs={proofs} days={dailyMoment?.days ?? []} onOpen={setProof} onDeleteProof={onDeleteProof} />}
    {tab === 'reset' && <WeeklyReset checkin={checkins.at(-1)} onSave={onSaveReflection} />}
    <Sheet open={!!proof} title="Proof memory" onClose={() => setProof(null)}>{proof && <div className="proof-memory"><img src={proof.imageUrl} alt={`Proof from ${format(parseISO(proof.createdAt), 'd MMMM yyyy')}`} /><p>{format(parseISO(proof.createdAt), 'EEEE, d MMMM yyyy')}</p><button className="text-button danger" onClick={async () => { await onDeleteProof(proof); setProof(null); }}>Delete proof</button></div>}</Sheet>
  </section>;
}

function Story({ streak, safe, completions, activities, checkins }: { streak: ReturnType<typeof streakFor>; safe?: Snapshot['globalSafe']; completions: TaskCompletion[]; activities: ActivityEvent[]; checkins: DailyCheckin[] }) {
  const [activityLimit, setActivityLimit] = useState(8);
  const [journalLimit, setJournalLimit] = useState(6);
  const points = completions.filter(item => item.status !== 'pending_proof').reduce((sum, item) => sum + item.points, 0);
  const journal = [...checkins].filter(item => item.win || item.gratitude).reverse();
  return <>
    <section className="constellation-card"><div><p className="eyebrow">Tide chart</p><h2>{streak.current} day tide</h2><span>Best {streak.best} · {points} marks earned</span></div><div className="constellation" aria-label="Tide chart">{Array.from({ length: 14 }, (_, index) => <i key={index} className={index >= 14 - Math.min(14, streak.current) ? 'lit' : ''} />)}<b>✦</b></div>{streak.comeback && <p className="comeback">Your comeback star is shining again.</p>}</section>
    {safe && <section className="global-safe-card"><span aria-hidden="true">⚓</span><div><p className="eyebrow">Streak Anchor</p><strong>{safe.stored ? 'Anchor ready' : `${safe.qualifyingCount}/7 grown`}</strong><small>{safe.lastProtectedDate ? `Protected ${safe.lastProtectedDate}` : safe.stored ? 'One quiet day is protected' : 'Productive days set your Anchor'}</small></div></section>}
    {journal.length > 0 && <section className="garden-journal"><header><div><p className="eyebrow">Private memories</p><h2>Evening watches</h2></div><span aria-hidden="true">◇</span></header><div>{journal.slice(0, journalLimit).map(item => <article key={item.id}><time dateTime={item.date}>{safeDate(item.date)}</time>{item.win && <p><small>Win</small>{item.win}</p>}{item.gratitude && <p><small>Grateful</small>{item.gratitude}</p>}</article>)}</div>{journal.length > journalLimit && <button className="show-more" type="button" onClick={() => setJournalLimit(limit => limit + 6)}>Show more journal entries</button>}</section>}
    <section className="activity-list"><h2>Recent moments</h2>{activities.length ? activities.slice(0, activityLimit).map(item => <article key={item.id}><span>{activityIcon(item.type)}</span><div><strong>{item.message}</strong><small>{safeDate(item.createdAt)}</small></div></article>) : <p className="quiet-copy">Your first finished task will begin this story.</p>}{activities.length > activityLimit && <button className="show-more" type="button" onClick={() => setActivityLimit(limit => limit + 8)}>Show more moments</button>}</section>
  </>;
}

function ProofGallery({ proofs, onOpen }: { proofs: ProofPhoto[]; onOpen(proof: ProofPhoto): void }) {
  return <section className="proof-gallery"><div className="proof-intro"><strong>{proofs.length} private memories</strong><small>Private to you — never shared.</small></div>{proofs.length ? <div className="proof-grid">{proofs.map(proof => { const date = safeDate(proof.createdAt); return <button key={proof.id} aria-label={`Proof from ${date}`} onClick={() => onOpen(proof)}><img src={proof.imageUrl} alt="" loading="lazy" /><span>{date}</span></button>; })}</div> : <div className="calm-empty"><span>▧</span><h2>No proof memories yet</h2><p>Photos you add to tasks and progress will live here.</p></div>}</section>;
}

function PhotoLibraries({ proofs, days, onOpen, onDeleteProof }: { proofs: ProofPhoto[]; days: NonNullable<Snapshot['dailyMoment']>['days']; onOpen(proof: ProofPhoto): void; onDeleteProof(proof: ProofPhoto): Promise<void> }) {
  const [category, setCategory] = useState<PhotoCategory>('gym');
  const grouped = (name: PhotoCategory) => proofs.filter(proof => photoCategory(proof) === name);
  return <section className="photo-libraries">
    <nav aria-label="Photo libraries">{(['gym', 'goals', 'tasks', 'daily'] as PhotoCategory[]).map(name => <button key={name} aria-pressed={category === name} onClick={() => setCategory(name)}>{name[0].toUpperCase() + name.slice(1)} <span>{grouped(name).length}</span></button>)}</nav>
    {category === 'daily' ? <MomentGarden days={days} proofs={grouped('daily')} onDeleteProof={onDeleteProof} /> : <ProofGallery proofs={grouped(category)} onOpen={onOpen} />}
  </section>;
}

function photoCategory(proof: ProofPhoto): PhotoCategory {
  return proof.category ?? (proof.ownerType === 'daily_moment' ? 'daily' : proof.ownerType === 'completion' ? 'tasks' : 'goals');
}

function WeeklyReset({ checkin, onSave }: { checkin?: DailyCheckin; onSave(note: string): Promise<void> }) {
  const [saved, setSaved] = useState(false);
  return <section className="weekly-reset"><div className="reset-orbit" aria-hidden="true"><span>↻</span></div><p className="eyebrow">Five quiet minutes</p><h2>Close the week gently.</h2><p>Notice what worked, then choose one direction.</p>
    <form onSubmit={async event => { event.preventDefault(); const data = new FormData(event.currentTarget); await onSave(`Win: ${data.get('win')}\nLearned: ${data.get('learned')}\nNext: ${data.get('next')}`); setSaved(true); }}>
      <label><span>A win</span><input name="win" required placeholder="What are you proud of?" /></label><label><span>A lesson</span><input name="learned" placeholder="What became clearer?" /></label><label><span>Next week</span><input name="next" required placeholder="One thing worth protecting" /></label><button className="primary-button">{saved ? 'Reset saved ✓' : 'Save reset'}</button>
    </form>{checkin?.note && <small className="last-reflection">Last note: {checkin.note}</small>}
  </section>;
}

function safeDate(value: string) { try { return format(parseISO(value), 'd MMM yyyy'); } catch { return 'Recently'; } }
function activityIcon(type: string) { if (type.includes('proof')) return '▧'; if (type.includes('goal') || type.includes('progress')) return '◎'; if (type.includes('focus')) return '◌'; return '✓'; }
