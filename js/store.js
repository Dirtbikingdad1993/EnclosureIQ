// Library + saved-design storage.
// In the Claude viewer: shared `db` collections `subs`, `amps` and `vehicles` (everyone sees additions)
// and each person's saved designs under their private `data/users/<id>` subtree.
// Anywhere else: the same data in this browser's localStorage.
import { local } from './ui.js';

const KINDS = {
  subs: { file: 'data/subwoofers.json', localKey: 'bw.subs' },
  amps: { file: 'data/amplifiers.json', localKey: 'bw.amps' },
  vehicles: { file: 'data/vehicles.json', localKey: 'bw.vehicles' },
};
const S = {
  builtin: { subs: [], amps: [], vehicles: [] },
  docs: { subs: new Map(), amps: new Map(), vehicles: new Map() },
  designs: new Map(),
  db: null, uid: null, mode: 'loading', listeners: new Set(), readOnly: false,
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
  connectDb();
}

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

const strip = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c._builtin; delete c._custom; delete c._edited; return c; };
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
export async function save(kind, item) {
  const body = { ...strip(item), updatedAt: new Date().toISOString() };
  if (S.db && !S.readOnly) await S.db.collection(kind).doc(item.id).set(body);
  else { S.docs[kind].set(item.id, body); local.set(KINDS[kind].localKey, Object.fromEntries(S.docs[kind])); emit(); }
}
export async function remove(kind, id) {
  if (S.db && !S.readOnly) await S.db.collection(kind).doc(id).delete();
  else { S.docs[kind].delete(id); local.set(KINDS[kind].localKey, Object.fromEntries(S.docs[kind])); emit(); }
}

export const allSubs = () => all('subs').sort((a, b) => (a.brand || '').localeCompare(b.brand || '') || (a.size || 0) - (b.size || 0) || (a.model || '').localeCompare(b.model || ''));
export const getSub = (id) => allSubs().find((s) => s.id === id) || allSubs()[0];
export const allAmps = () => all('amps').sort((a, b) => (a.brand || '').localeCompare(b.brand || '') || (a.model || '').localeCompare(b.model || ''));
export const getAmp = (id) => allAmps().find((a) => a.id === id) || null;
export const allVehicles = () => all('vehicles');
export const getVehicle = (id) => allVehicles().find((v) => v.id === id) || null;

// ---------- designs (private per person) ----------
export const allDesigns = () => [...S.designs.entries()].map(([id, d]) => ({ ...d, id })).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
export async function saveDesign(d) {
  const body = JSON.parse(JSON.stringify({ ...d, updatedAt: new Date().toISOString() }));
  if (S.db && S.uid) await S.db.collection(`data/users/${S.uid}`).doc(d.id).set(body);
  else { S.designs.set(d.id, body); local.set('bw.designs', Object.fromEntries(S.designs)); emit(); }
}
export async function deleteDesign(id) {
  if (S.db && S.uid) await S.db.collection(`data/users/${S.uid}`).doc(id).delete();
  else { S.designs.delete(id); local.set('bw.designs', Object.fromEntries(S.designs)); emit(); }
}
