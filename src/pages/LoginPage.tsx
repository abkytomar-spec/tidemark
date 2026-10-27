import { BrandMark } from '../components/BrandMark';
import { useState, type FormEvent } from 'react';
import { Field } from '../components/Field';

export function LoginPage({ onLogin, error }: { onLogin(input: { email: string; password: string }): Promise<void>; error?: string | null }) {
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget);
    try { await onLogin({ email: String(form.get('email')), password: String(form.get('password')) }); } finally { setBusy(false); }
  };
  return <main className="auth-page"><section className="auth-card"><div className="auth-mark"><BrandMark /></div><p className="eyebrow">Welcome back</p><h1>Pick up your rhythm.</h1><form onSubmit={submit}><Field label="Email"><input name="email" type="email" autoComplete="email" required /></Field><Field label="Password"><input name="password" type="password" autoComplete="current-password" required /></Field>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? 'Opening…' : 'Open Tidemark'}</button></form></section></main>;
}
