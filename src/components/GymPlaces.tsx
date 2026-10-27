import { useState } from 'react';
import type { GymPlace } from '../domain/types';

export type GymContextValue = { gymPlaces: GymPlace[]; contextualAmbience: boolean };

export function GymPlaces({ places, contextualAmbience, onSave }: { places: GymPlace[]; contextualAmbience: boolean; onSave(value: GymContextValue): Promise<void> }) {
  const [name, setName] = useState('');
  const [radius, setRadius] = useState(250);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function saveCurrent() {
    const placeName = name.trim();
    if (!placeName) { setError('Name this workout place first.'); return; }
    if (!navigator.geolocation) { setError('Location is not available on this device.'); return; }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(position => {
      const gymPlace: GymPlace = { id: crypto.randomUUID(), name: placeName, latitude: position.coords.latitude, longitude: position.coords.longitude, radiusMeters: radius };
      void onSave({ gymPlaces: [...places, gymPlace], contextualAmbience }).then(() => setName('')).catch(caught => setError(caught instanceof Error ? caught.message : 'Workout place could not be saved.')).finally(() => setBusy(false));
    }, () => { setError('Location is off. Allow it for Tidemark, then try again.'); setBusy(false); }, { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 });
  }

  return <section className="gym-places" aria-labelledby="gym-places-title">
    <header><div><p className="eyebrow">Arrive and begin</p><h2 id="gym-places-title">Workout places</h2></div><span aria-hidden="true">⌖</span></header>
    <p>Save a gym once. When Tidemark is open nearby, it offers your workout.</p>
    {places.length > 0 && <ul>{places.map(place => <li key={place.id}><div><strong>{place.name}</strong><small>Within {place.radiusMeters} m</small></div><button type="button" aria-label={`Remove ${place.name}`} onClick={() => void onSave({ gymPlaces: places.filter(item => item.id !== place.id), contextualAmbience })}>×</button></li>)}</ul>}
    <div className="gym-place-form"><label>Place name<input value={name} maxLength={60} placeholder="e.g. Morning gym" onChange={event => setName(event.target.value)} /></label><label>Arrival radius<select value={radius} onChange={event => setRadius(Number(event.target.value))}><option value="100">100 m</option><option value="250">250 m</option><option value="500">500 m</option><option value="1000">1 km</option></select></label><button type="button" disabled={busy || places.length >= 8} onClick={saveCurrent}>{busy ? 'Finding you…' : places.length >= 8 ? 'Eight places saved' : 'Save current location'}</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
