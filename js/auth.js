// Accounts for the standalone website: Supabase Auth with Google, Microsoft (Azure), Apple and email links.
// Inside the claude.ai viewer this stays off; people there are already signed in with their Claude account.
import { SUPABASE } from './config.js';

const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
let sbPromise = null;
let settingsPromise = null;
let user = null;
let ready = false;
let justReturned = false;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => { try { fn(user); } catch (e) { console.error(e); } });
const here = () => location.origin + location.pathname;

function loadLib() {
  return new Promise((ok, bad) => {
    if (window.supabase?.createClient) return ok();
    const s = document.createElement('script');
    s.src = LIB; s.onload = ok; s.onerror = () => bad(new Error('Could not load the sign-in library.'));
    document.head.append(s);
  });
}

export const cloud = {
  /** True on the standalone site (not inside the Claude viewer) when Supabase is configured. */
  get enabled() { return !!(SUPABASE.url && SUPABASE.key) && !window.claude?.use; },
  get user() { return user; },
  get ready() { return ready; },
  providers: SUPABASE.providers,
  emailEnabled: SUPABASE.email,

  client() {
    if (!sbPromise) sbPromise = loadLib().then(() => window.supabase.createClient(SUPABASE.url, SUPABASE.key, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }));
    return sbPromise;
  },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  /**
   * The sign-in methods to offer: switched on in config.js AND switched on in Supabase right now
   * (Supabase publishes this at /auth/v1/settings). If Supabase can't be reached, config.js decides.
   */
  signInOptions() {
    if (!settingsPromise) {
      settingsPromise = fetch(`${SUPABASE.url}/auth/v1/settings`, { headers: { apikey: SUPABASE.key } })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null)
        .then((s) => {
          const on = (k) => (s?.external ? !!s.external[k] : true);
          const providers = Object.fromEntries(Object.entries(SUPABASE.providers || {}).map(([k, v]) => [k, !!v && on(k)]));
          return { providers, email: !!SUPABASE.email && on('email'), checked: !!s?.external };
        });
    }
    return settingsPromise;
  },

  async init() {
    if (!this.enabled) { ready = true; return; }
    try {
      const sb = await this.client();
      const { data } = await sb.auth.getSession();
      user = data.session?.user || null;
      sb.auth.onAuthStateChange((_event, session) => {
        const next = session?.user || null;
        const changed = (next?.id || null) !== (user?.id || null);
        user = next;
        if (changed) emit();
      });
      // tidy the address bar after a sign-in redirect and go back to where the person was
      const url = new URL(location.href);
      if (url.searchParams.has('code') || url.searchParams.has('error_description')) {
        justReturned = !!user;
        const err = url.searchParams.get('error_description');
        if (err) sessionStorage.setItem('bw.authError', err);
        let back = '';
        try { back = sessionStorage.getItem('bw.returnHash') || ''; sessionStorage.removeItem('bw.returnHash'); } catch { /* storage blocked */ }
        history.replaceState(null, '', here() + (back || location.hash));
      }
    } catch (e) {
      console.error(e);
    }
    ready = true;
    emit();
  },

  takeJustReturned() { const j = justReturned; justReturned = false; return j; },
  rememberPlace() { try { sessionStorage.setItem('bw.returnHash', location.hash); } catch { /* storage blocked */ } },
  takeAuthError() { try { const e = sessionStorage.getItem('bw.authError'); sessionStorage.removeItem('bw.authError'); return e; } catch { return null; } },

  async signInWith(provider) {
    const sb = await this.client();
    this.rememberPlace();
    const { error } = await sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo: here(), scopes: provider === 'azure' ? 'email openid profile' : undefined },
    });
    if (error) throw error;
  },
  async signInWithEmail(email) {
    const sb = await this.client();
    this.rememberPlace();
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: here() } });
    if (error) throw error;
  },
  async signOut() {
    const sb = await this.client();
    await sb.auth.signOut();
    user = null;
    emit();
  },

  displayName() {
    const m = user?.user_metadata || {};
    return m.full_name || m.name || (user?.email ? user.email.split('@')[0] : '');
  },
  providerName() {
    const p = user?.app_metadata?.provider;
    return { google: 'Google', azure: 'Microsoft', apple: 'Apple', email: 'Email link' }[p] || p || '';
  },

  async getProfile() {
    if (!user) return null;
    const sb = await this.client();
    const { data } = await sb.from('profiles').select('display_name, prefs').eq('id', user.id).maybeSingle();
    return data;
  },
  async saveProfile(patch) {
    if (!user) return;
    const sb = await this.client();
    const { error } = await sb.from('profiles').upsert({ id: user.id, ...patch });
    if (error) throw error;
  },
};
