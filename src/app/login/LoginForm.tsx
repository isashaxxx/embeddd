'use client';
import { useState } from 'react';

export default function LoginForm() {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!pw || busy) return;
    setBusy(true);
    setErr('');
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    if (res.ok) window.location.href = '/';
    else {
      setErr((await res.json()).error || 'Не вышло');
      setBusy(false);
    }
  }

  return (
    <form className="login-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <label className="login-form__label" htmlFor="gate-password">Пароль</label>
      <input
        id="gate-password"
        className={'login-form__input' + (err ? ' is-error' : '')}
        type="password"
        autoFocus
        autoComplete="current-password"
        placeholder="••••••••"
        value={pw}
        disabled={busy}
        onChange={(e) => { setPw(e.target.value); if (err) setErr(''); }}
        aria-invalid={!!err}
        aria-describedby={err ? 'gate-password-error' : undefined}
      />
      <button className="login-form__submit" type="submit" disabled={busy || !pw}>
        {busy ? 'Проверяю…' : 'Войти'}
      </button>
      <p className="login-form__error" id="gate-password-error" role="alert">{err}</p>
    </form>
  );
}
