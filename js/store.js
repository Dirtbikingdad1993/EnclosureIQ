// Library + saved-design storage. Three backends, picked automatically:
// - claude.ai viewer: shared `db` collections `subs`, `amps`, `vehicles`; designs private under `data/users/<id>`.
// - standalone website with accounts (Supabase): shared `library_items`, private `designs` per account.
// - anything else (or signed out on the website): this browser's localStorage.
import { local } from './ui.js';
import { cloud } from './auth.js';

const KINDS = {
  subs: { file: 'data/subwoofers.json', localKey: 'bw.subs' },
  amps: { file: 'data/amplifiers.json', localKey: 'bw.amps' },
  vehicles: { file: 'data/vehicles.json', localKey: 'bw.vehicles' },
};
const S = {
  builtin: { subs: [], amps: [], vehicles: [] },
  docs: { subs: new Map(), amps: new Map(), vehicles: new Map() },
  designs: new Map(),
  db: null, sb: null, uid: null, mode: 'loading', listeners: new Set(), readOnly: false,
};
export const storeState = S;
const emit = () => S.listeners.forEach((fn) => fn());
export const onStoreChange = (fn) => { S.listeners.add(fn); return () => S.listeners.delete(fn); };
const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);

export async function initStore() {
  await Promise.all(Object.entries(KINDS).map(async ([k, cfg]) => {
    S.builtin[k] = await fetch(cfg.file).then((r) => r.json()).catch(() => []);
    S.docs[k] = new Map(Object.entries(local.get(cfg.localKey, {})));
  }));
  S.designs = new Map(Object.entries(local.get('bw.designs', {})));
  S.mode = 'local';
  emit();
  if (cloud.enabled) connectCloud();
  else connectDb(); // lights up shared storage when the Claude viewer answers
}

// ---------------------------------------------------------------- claude.ai viewer
async function connectDb() {
  if (!window.claude?.use) return;
  const db = await withTimeout(window.claude.use('db'), 12000);
  if (!db) return;
  const user = await withTimeout(window.claude.use('user'), 8000);
  S.uid = user ? await user.id().catch(() => null) : null;
  try { if (user && (await user.can?.('data.write')) === false) S.readOnly = true; } catch { /* unknown: keep inputs */ }
  S.db = db; S.mode = 'shared';
  for (const k of Object.keys(KINDS)) {
    const before = S.docs[k];
    let first = true;
    db.collection(k).onSnapshot((snap) => {
      S.docs[k] = new Map(snap.docs.map((d) => [d.id, d.data()]));
      if (first) { first = false; migrate(k, before, S.docs[k]); }
      emit();
    }, () => {});
  }
  if (S.uid) {
    const before = S.designs;
    let first = true;
    db.collection(`data/users/${S.uid}`).onSnapshot((snap) => {
      S.designs = new Map(snap.docs.map((d) => [d.id, d.data()]));
      if (first) { first = false; migrate(`data/users/${S.uid}`, before, S.designs); }
      emit();
    }, () => {});
  }
  emit();
}
// Anything saved in this browser before the shared store answered gets copied up once.
async function migrate(coll, localMap, remote) {
  if (S.readOnly) return;
  for (const [id, doc] of localMap) if (!remote.has(id)) { try { await S.db.collection(coll).doc(id).set(doc); } catch { /* keep local */ } }
}

// ---------------------------------------------------------------- website accounts (Supabase)
async function connectCloud() {
  try { S.sb = await cloud.client(); } catch { return; }
  S.mode = 'cloud';
  cloud.onChange(() => onAccountChange());
  await cloud.init();
  await loadLibraries();
  window.addEventListener('focus', () => { loadLibraries(); });
}
async function loadLibraries() {
  const { data, error } = await S.sb.from('library_items').select('kind, item_id, data, created_by, updated_at');
  if (error) return;
  const next = { subs: new Map(), amps: new Map(), vehicles: new Map() };
  for (const row of data) if (next[row.kind]) next[row.kind].set(row.item_id, { ...row.data, _owner: row.created_by, updatedAt: row.updated_at });
  // entries added in this browser before accounts existed are uploaded on first sign-in (onAccountChange)
  for (const k of Object.keys(KINDS)) S.docs[k] = next[k];
  emit();
}
async function onAccountChange() {
  const u = cloud.user;
  S.uid = u?.id || null;
  S.readOnly = false;
  if (!u) { S.designs = new Map(Object.entries(local.get('bw.designs', {}))); emit(); return; }
  // first sign-in on this device: move designs and library additions saved in this browser into the account
  const localDesigns = Object.entries(local.get('bw.designs', {}));
  if (localDesigns.length) {
    const rows = localDesigns.map(([id, d]) => ({ id, name: d.name || null, data: d }));
    const { error } = await S.sb.from('designs').upsert(rows, { onConflict: 'user_id,id', ignoreDuplicates: true });
    if (!error) local.set('bw.designs', {});
  }
  for (const k of Object.keys(KINDS)) {
    const mine = Object.entries(local.get(KINDS[k].localKey, {}));
    if (!mine.length) continue;
    const rows = mine.map(([id, d]) => ({ kind: k, item_id: id, data: clean(d) }));
    const { error } = await S.sb.from('library_items').upsert(rows, { onConflict: 'kind,item_id', ignoreDuplicates: true });
    if (!error) local.set(KINDS[k].localKey, {});
  }
  await Promise.all([loadDesigns(), loadLibraries()]);
}
async function loadDesigns() {
  const { data, error } = await S.sb.from('designs').select('id, data, updated_at').order('updated_at', { ascending: false });
  if (error) return;
  S.designs = new Map(data.map((r) => [r.id, { ...r.data, updatedAt: r.updated_at }]));
  emit();
}
const clean = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c._builtin; delete c._custom; delete c._edited; delete c._owner; delete c.updatedAt; return c; };
export const needsSignIn = () => S.mode === 'cloud' && !S.uid;
export class SignInRequired extends Error { constructor() { super('Sign in to save to the shared library.'); this.code = 'signin'; } }
function cloudError(error) {
  const e = new Error(error?.code === '42501' ? 'Only the person who added this entry can change it.' : 'Could not save. Check your connection and try again.');
  e.code = error?.code === '42501' ? 'not_owner' : 'cloud';
  return e;
}

// ---------------------------------------------------------------- libraries
const strip = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c._builtin; delete c._custom; delete c._edited; delete c._owner; return c; };
export function all(kind) {
  const docs = S.docs[kind];
  const list = S.builtin[kind].map((b) => {
    const o = docs.get(b.id);
    if (o && o._hidden) return null;
    return o ? { ...b, ...o, id: b.id, _builtin: true, _edited: true } : { ...b, _builtin: true };
  }).filter(Boolean);
  for (const [id, d] of docs) if (!S.builtin[kind].find((b) => b.id === id) && !d._hidden) list.push({ ...d, id, _custom: true });
  return list;
}
export const builtin = (kind, id) => S.builtin[kind].find((b) => b.id === id);
export const isMine = (item) => S.mode !== 'cloud' || !item._owner || item._owner === S.uid;
export async function save(kind, item) {
  const body = { ...strip(item), updatedAt: new Date().toISOString() };
  if (S.mode === 'cloud') {
    if (!S.uid) throw new SignInRequired();
    const data = clean(body);
    const { error } = await S.sb.from('library_items').upsert({ kind, item_id: item.id, data }, { onConflict: 'kind,item_id' });
    if (error) throw cloudError(error);
    S.docs[kind].set(item.id, { ...data, _owner: S.uid, updatedAt: new Date().toISOString() });
    emit();
    return;
  }
  if (S.db && !S.readOnly) await S.db.collection(kind).doc(item.id).set(body);
  else { S.docs[kind].set(item.id, body); local.set(KINDS[kind].localKey, Object.fromEntries(S.docs[kind])); emit(); }
}
export async function remove(kind, id) {
  if (S.mode === 'cloud') {
    if (!S.uid) throw new SignInRequired();
    const { error } = await S.sb.from('library_items').delete().eq('kind', kind).eq('item_id', id);
    if (error) throw cloudError(error);
    S.docs[kind].delete(id);
    emit();
    return;
  }
  if (S.db && !S.readOnly) await S.db.collection(kind).doc(id).delete();
  else { S.docs[kind].delete(id); local.set(KINDS[kind].localKey, Object.fromEntries(S.docs[kind])); emit(); }
}

export const allSubs = () => all('subs').sort((a, b) => (a.brand || '').localeCompare(b.brand || '') || (a.size || 0) - (b.size || 0) || (a.model || '').localeCompare(b.model || ''));
export const getSub = (id) => allSubs().find((s) => s.id === id) || allSubs()[0];
export const allAmps = () => all('amps').sort((a, b) => (a.brand || '').localeCompare(b.brand || '') || (a.model || '').localeCompare(b.model || ''));
export const getAmp = (id) => allAmps().find((a) => a.id === id) || null;
export const allVehicles = () => all('vehicles');
export const getVehicle = (id) => allVehicles().find((v) => v.id === id) || null;

// ---------------------------------------------------------------- designs (private per person)
export const allDesigns = () => [...S.designs.entries()].map(([id, d]) => ({ ...d, id })).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
export async function saveDesign(d) {
  const body = JSON.parse(JSON.stringify({ ...d, updatedAt: new Date().toISOString() }));
  if (S.mode === 'cloud' && S.uid) {
    const data = { ...body }; delete data.updatedAt;
    const { error } = await S.sb.from('designs').upsert({ id: d.id, name: d.name || null, data }, { onConflict: 'user_id,id' });
    if (error) throw cloudError(error);
    S.designs.set(d.id, body); emit();
    return;
  }
  if (S.db && S.uid) await S.db.collection(`data/users/${S.uid}`).doc(d.id).set(body);
  else { S.designs.set(d.id, body); local.set('bw.designs', Object.fromEntries(S.designs)); emit(); }
}
export async function deleteDesign(id) {
  if (S.mode === 'cloud' && S.uid) {
    const { error } = await S.sb.from('designs').delete().eq('id', id);
    if (error) throw cloudError(error);
    S.designs.delete(id); emit();
    return;
  }
  if (S.db && S.uid) await S.db.collection(`data/users/${S.uid}`).doc(id).delete();
  else { S.designs.delete(id); local.set('bw.designs', Object.fromEntries(S.designs)); emit(); }
}
