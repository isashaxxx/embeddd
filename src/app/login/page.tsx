'use client';
import { useState } from 'react';

export default function Login() {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
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
    <div className="login-wrap">
      <div className="login-box">
        <div className="brand">
          <b>embeddd</b>
          <span>refs</span>
        </div>
        <input
          type="password"
          autoFocus
          placeholder="Пароль"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button className="btn" onClick={submit} disabled={busy}>
          {busy ? 'Проверяю…' : 'Войти'}
        </button>
        <div className="login-err">{err}</div>
      </div>
    </div>
  );
}
