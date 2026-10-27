import { BrandMark } from '../components/BrandMark';
import { useState, type FormEvent } from 'react';
import { Field } from '../components/Field';

export function SetupPage({ onSetup, error }: { onSetup(input: { email: string; password: string; timezone: string }): Promise<void>; error?: string | null }) {
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true);
    const form = new FormData(event.currentTarget);
    try { await onSetup({ email: String(form.get('email')), password: String(form.get('password')), timezone: String(form.get('timezone')) }); }
    finally { setBusy(false); }
  };
  return <main className="auth-page"><section className="auth-card"><div className="auth-mark"><BrandMark /></div><p className="eyebrow">Your private space</p><h1>Let’s make today lighter.</h1><p className="auth-copy">One account. Every device. Your progress stays yours.</p>
    <form onSubmit={submit}><Field label="Email"><input name="email" type="email" autoComplete="email" required /></Field><Field label="Password" hint="At least 12 characters"><input name="password" type="password" minLength={12} autoComplete="new-password" required /></Field><input type="hidden" name="timezone" value={Intl.DateTimeFormat().resolvedOptions().timeZone} />{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? 'Creating…' : 'Create my space'}</button></form>
  </section></main>;
}
