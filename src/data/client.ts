import { ApiClient, type TidemarkClient } from './api';
import { LocalClient } from './local';

// Static hosting (Vercel) builds with VITE_LOCAL_MODE=1: no PHP API, everything stays in this browser.
export const localMode = import.meta.env.VITE_LOCAL_MODE === '1';
export const api: TidemarkClient = localMode ? new LocalClient() : new ApiClient();
