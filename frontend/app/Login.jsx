import React, { useState } from 'react';
import { api, setToken } from '../lib/api';
import { Field, useSubmit } from '../ui/Form';

const ACCOUNTS = [
  ['operator@demo.local', 'Cloud operator', 'Whole community, data operations'],
  ['technician@demo.local', 'IoT technician', 'Houses, rooms and devices'],
  ['responder@demo.local', 'Responder', 'Alerts for Willow and Oak'],
  ['owner@demo.local', 'House owner', 'Willow House only'],
];

export default function Login({ onSignedIn, expired }) {
  const [email, setEmail] = useState('operator@demo.local');
  const [password, setPassword] = useState('');
  const submit = useSubmit(async () => {
    const r = await api('/auth/login', { method: 'POST', body: { email, password } });
    setToken(r.token);
    onSignedIn(r.user);
  });
  return (
    <main className="login">
      <section className="login-story">
        <div className="wordmark"><span className="wordmark-mark" aria-hidden="true" />EchoNest</div>
        <h1>Every house, one clear view.</h1>
        <p>See which home needs attention, keep devices connected, and follow each alert from the first signal to a recorded outcome.</p>
        <p className="login-foot">CMPE 281 Group 4, Intelligent Cloud Platform for Smart Homes. Local prototype with synthetic data.</p>
      </section>
      <section className="login-panel">
        <form className="login-form" onSubmit={e => { e.preventDefault(); submit.run(); }} noValidate>
          <h2>Sign in</h2>
          {expired && !submit.error && <p className="banner banner-warn">Your session ended. Sign in again to continue.</p>}
          {submit.error && <p className="banner banner-bad" role="alert">{submit.error.status === 400 ? 'Enter a valid email address and a password.' : submit.error.message}</p>}
          <Field label="Email">{p => <input {...p} type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} />}</Field>
          <Field label="Password" hint="The DEMO_PASSWORD value from your .env file">{p => <input {...p} type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />}</Field>
          <button className="btn btn-primary btn-block" disabled={submit.busy}>{submit.busy ? 'Signing in' : 'Sign in'}</button>
          <fieldset className="accounts">
            <legend>Demo accounts</legend>
            {ACCOUNTS.map(([e, role, scope]) => (
              <button type="button" key={e} className={`account ${email === e ? 'on' : ''}`} onClick={() => setEmail(e)}>
                <strong>{role}</strong><span>{scope}</span>
              </button>
            ))}
          </fieldset>
        </form>
      </section>
    </main>
  );
}
