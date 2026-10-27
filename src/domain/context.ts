import type { GymPlace } from './types';

export type Coordinates = { latitude: number; longitude: number };
export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';
export type WeatherKind = 'clear' | 'cloud' | 'rain' | 'snow';

export function distanceMeters(a: Coordinates, b: Coordinates) {
  const radians = Math.PI / 180;
  const lat = (b.latitude - a.latitude) * radians;
  const lon = (b.longitude - a.longitude) * radians;
  const value = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(lon / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(value));
}

export function nearestGym(places: GymPlace[], current: Coordinates) {
  const nearby = places.map(place => ({ place, distance: distanceMeters(place, current) })).filter(item => item.distance <= item.place.radiusMeters).sort((a, b) => a.distance - b.distance)[0];
  return nearby?.place ?? null;
}

const SUNRISE = 5 * 60;
const SUNSET = 20 * 60;

export function dayPhase(hour: number): DayPhase {
  return hour < 5 || hour >= 20 ? 'night' : hour < 8 ? 'dawn' : hour < 17 ? 'day' : 'dusk';
}

/** 0 → 1 across the current arc: sunrise to sunset by day, sunset to sunrise by night. */
export function skyProgress(date: Date): number {
  const minutes = date.getHours() * 60 + date.getMinutes();
  if (minutes >= SUNRISE && minutes < SUNSET) return (minutes - SUNRISE) / (SUNSET - SUNRISE);
  const since = minutes >= SUNSET ? minutes - SUNSET : minutes + 24 * 60 - SUNSET;
  return since / (24 * 60 - SUNSET + SUNRISE);
}

export function weatherKind(code: number): WeatherKind {
  if (code >= 71 && code <= 86) return 'snow';
  if ((code >= 51 && code <= 69) || (code >= 80 && code <= 99)) return 'rain';
  return code >= 1 && code <= 3 ? 'cloud' : 'clear';
}
