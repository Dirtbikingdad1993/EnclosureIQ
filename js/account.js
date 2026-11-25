// Sign-in dialog, account panel and the top-bar account button (standalone website only).
import { h, clear, modal, toast, textField, units } from './ui.js';
import { cloud } from './auth.js';
import { storeState, allDesigns } from './store.js';

const LOGOS = {
  google: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.4a12 12 0 0 0 0 10.8l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"/></svg>',
  azure: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="1" y="1" width="10.5" height="10.5" fill="#F25022"/><rect x="12.5" y="1" width="10.5" height="10.5" fill="#7FBA00"/><rect x="1" y="12.5" width="10.5" height="10.5" fill="#00A4EF"/><rect x="12.5" y="12.5" width="10.5" height="10.5" fill="#FFB900"/></svg>',
  apple: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M16.4 12.7c0-2.5 2-3.7 2.1-3.8a4.6 4.6 0 0 0-3.6-2c-1.5-.2-3 .9-3.7.9-.8 0-2-.9-3.2-.8a4.8 4.8 0 0 0-4.1 2.5c-1.8 3-.5 7.5 1.2 10 .8 1.2 1.8 2.6 3.1 2.5 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.8 2.1-1.2 2.9-2.4c.9-1.4 1.3-2.7 1.3-2.8 0 0-2.4-1-2.4-4.1zM14 5.3c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.1-.6 2.8-1.4z"/></svg>',
};

export function signInDialog(reason) {
  const st = { email: '' };
  const status = h('p', { class: 'muted small', 'aria-live': 'polite' });
  const go = (provider) => async () => {
    status.textContent = 'Opening sign-in…';
    try { await cloud.signInWith(provider); } catch (e) { status.textContent = ''; toast(e?.message || 'Sign-in could not start. Try again.', 'bad'); }
  };
  const btn = (provider, label) => {
    const on = cloud.providers?.[provider];
    return h('button', { class: `btn sso sso-${provider}`, disabled: !on, onclick: on ? go(provider) : null },
      h('span', { class: 'sso-logo' }), label, !on ? h('em', null, ' coming soon') : null);
  };
  const buttons = [btn('google', 'Continue with Google'), btn('azure', 'Continue with Microsoft'), btn('apple', 'Continue with Apple')];
  buttons.forEach((b, i) => { b.querySelector('.sso-logo').innerHTML = LOGOS[['google', 'azure', 'apple'][i]]; });
  const emailForm = h('form', { class: 'email-signin', onsubmit: async (e) => {
    e.preventDefault();
    const email = st.email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('Enter a valid email address.', 'bad'); return; }
    status.textContent = 'Sending…';
    try { await cloud.signInWithEmail(email); status.textContent = `Check ${email} for a sign-in link. You can close this window.`; }
    catch (err) { status.textContent = ''; toast(err?.message?.includes('rate') ? 'Too many emails sent. Wait a few minutes and try again.' : (err?.message || 'Could not send the link.'), 'bad'); }
  } },
    textField({ id: 'signin-email', label: 'Or get a sign-in link by email', type: 'email', value: '', placeholder: 'you@example.com', onChange: (v) => { st.email = v; } }),
    h('button', { class: 'btn', type: 'submit' }, 'Email me a link'));
  emailForm.querySelector('input').addEventListener('input', (e) => { st.email = e.target.value; });
  modal({ title: 'Sign in to EnclosureIQ', body: h('div', { class: 'signin' },
    reason ? h('p', { class: 'note' }, reason) : null,
    h('p', { class: 'muted' }, 'Your account keeps your saved designs and settings on every device, and lets you add subwoofers, amplifiers and vehicles to the shared library.'),
    h('div', { class: 'btn-col sso-col' }, buttons),
    cloud.emailEnabled ? emailForm : null,
    status,
    h('p', { class: 'muted small' }, 'We only use your name and email to identify your account.')) });
}

export function accountDialog() {
  const u = cloud.user;
  if (!u) return signInDialog();
  const st = { name: cloud.displayName() };
  const body = h('div', { class: 'account' });
  const draw = () => {
    clear(body).append(
      h('div', { class: 'acct-head' }, h('span', { class: 'avatar avatar-lg' }, (st.name || u.email || '?').slice(0, 1).toUpperCase()),
        h('div', null, h('b', null, st.name || u.email), h('p', { class: 'muted small' }, `${u.email || ''}${cloud.providerName() ? ` · signed in with ${cloud.providerName()}` : ''}`))),
      textField({ id: 'acct-name', label: 'Display name', value: st.name, onChange: (v) => { st.name = v; } }),
      h('dl', { class: 'spec-dl' },
        h('div', null, h('dt', null, 'Saved designs'), h('dd', null, String(allDesigns().length))),
        h('div', null, h('dt', null, 'Units'), h('dd', null, units.metric ? 'Metric (mm, L)' : 'Imperial (in, ft³)')),
        h('div', null, h('dt', null, 'Member since'), h('dd', null, u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'))));
  };
  draw();
  modal({ title: 'Your account', body, actions: [
    { label: 'Sign out', onClick: async (c) => { await cloud.signOut(); c(); toast('Signed out.'); } },
    { label: 'Save', kind: 'primary', onClick: async (c) => {
      try { await cloud.saveProfile({ display_name: (st.name || '').slice(0, 80), prefs: { units: units.sys } }); c(); toast('Account saved.', 'good'); }
      catch { toast('Could not save your account. Try again.', 'bad'); }
    } },
  ] });
}

/** Top-bar button: hidden in the Claude viewer, "Sign in" when signed out, initial + name when signed in. */
export function accountButton() {
  const slot = h('span', { class: 'acct-slot' });
  const draw = () => {
    clear(slot);
    if (!cloud.enabled) return;
    const u = cloud.user;
    if (!u) slot.append(h('button', { class: 'btn acct-btn', onclick: () => signInDialog() }, 'Sign in'));
    else {
      const name = cloud.displayName();
      slot.append(h('button', { class: 'btn acct-btn', onclick: () => accountDialog(), 'aria-label': `Account: ${name}` },
        h('span', { class: 'avatar' }, (name || '?').slice(0, 1).toUpperCase()), h('span', { class: 'acct-name' }, name.split(' ')[0])));
    }
  };
  cloud.onChange(async (u) => {
    draw();
    const err = cloud.takeAuthError();
    if (err) toast(`Sign-in failed: ${err}`, 'bad');
    if (u) {
      const p = await cloud.getProfile().catch(() => null);
      if (p?.prefs?.units && p.prefs.units !== units.sys) { units.set(p.prefs.units); document.dispatchEvent(new CustomEvent('bw:units')); }
      if (cloud.takeJustReturned()) toast(`Signed in as ${cloud.displayName()}.`, 'good');
    }
  });
  draw();
  return slot;
}
export const accountMode = () => storeState.mode === 'cloud';
