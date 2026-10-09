import { buildIndex, type Index } from "../domain/calc";
import { JANELA_EDICAO_MS, SEED_POINTS, SEED_UNITS } from "../domain/config";
import { slug, uid } from "../domain/format";
import type { AuditEntry, Point, Profile, Reading, Role, Unit } from "../domain/types";
import { idb } from "./idb";
import {
  auditFromRow,
  pointFromRow,
  pointToRow,
  profileFromRow,
  readingFromRow,
  readingToRow,
  supabase,
  unitFromRow,
  unitToRow
} from "./remote";

type OutOp =
  | { kind: "reading"; id: string; isNew: boolean; tries: number }
  | { kind: "point"; id: string; tries: number }
  | { kind: "unit"; id: string; tries: number }
  | { kind: "photo"; key: string; path: string; tries: number };

export interface State {
  ready: boolean;
  mode: "local" | "server";
  user: Profile | null;
  units: Unit[];
  points: Point[];
  readings: Reading[];
  index: Index;
  online: boolean;
  syncing: boolean;
  pending: number;
  lastSync: number | null;
  syncError: string | null;
  failed: number;
}

export const state: State = {
  ready: false,
  mode: "local",
  user: null,
  units: [],
  points: [],
  readings: [],
  index: buildIndex([]),
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  syncing: false,
  pending: 0,
  lastSync: null,
  syncError: null,
  failed: 0
};

const listeners = new Set<() => void>();
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
let notifyQueued = false;
function notify(): void {
  if (notifyQueued) return;
  notifyQueued = true;
  queueMicrotask(() => {
    notifyQueued = false;
    listeners.forEach((f) => f());
  });
}

const LOCAL_USER: Profile = { id: "local", nome: "Operador local", email: "", role: "admin", unit_ids: [] };

/* ------------------------------------------------------------ permissões */
export function role(): Role {
  return state.user?.role ?? "campo";
}
export const isAdmin = (): boolean => role() === "admin";
export const isGestor = (): boolean => role() === "gestor" || role() === "admin";
export function unidadesVisiveis(): Unit[] {
  const u = state.user;
  if (!u) return [];
  const ativas = state.units.filter((x) => x.ativo || isAdmin());
  return u.role === "admin" || state.mode === "local" ? ativas : ativas.filter((x) => u.unit_ids.includes(x.id));
}
export function pontosVisiveis(): Point[] {
  const ids = new Set(unidadesVisiveis().map((u) => u.id));
  return state.points.filter((p) => ids.has(p.unit_id)).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
}
export function leiturasVisiveis(): Reading[] {
  const ids = new Set(unidadesVisiveis().map((u) => u.id));
  return state.readings.filter((r) => !r.deleted && ids.has(r.unit_id));
}
export function podeEditarLeitura(r: Reading, agora = Date.now()): boolean {
  if (!state.user) return false;
  if (isGestor()) return true;
  return r.created_by === state.user.id && agora - r.created_at < JANELA_EDICAO_MS;
}

/* ------------------------------------------------------------ carga local */
function reindex(): void {
  state.index = buildIndex(state.readings);
  notify();
}

async function refreshPending(): Promise<void> {
  state.pending = (await idb.keys("outbox")).length;
  const failed = (await idb.get<unknown[]>("meta", "failed")) ?? [];
  state.failed = failed.length;
}

async function loadLocal(): Promise<void> {
  const [units, points, readings] = await Promise.all([idb.all<Unit>("units"), idb.all<Point>("points"), idb.all<Reading>("readings")]);
  state.units = units;
  state.points = points;
  state.readings = readings;
  state.lastSync = (await idb.get<number>("meta", "lastSync")) ?? null;
  await refreshPending();
  reindex();
}

async function seedLocal(): Promise<void> {
  for (const u of SEED_UNITS) await idb.put("units", u.id, u);
  for (const p of SEED_POINTS) await idb.put("points", p.id, p);
}

/* ------------------------------------------------------------ início e autenticação */
export async function init(): Promise<void> {
  const sb = supabase();
  state.mode = sb ? "server" : "local";
  window.addEventListener("online", () => {
    state.online = true;
    notify();
    void sync();
  });
  window.addEventListener("offline", () => {
    state.online = false;
    notify();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void sync();
  });
  setInterval(() => {
    if (document.visibilityState === "visible") void sync();
  }, 60000);

  if (!sb) {
    const has = await idb.keys("units");
    if (!has.length) await seedLocal();
    state.user = LOCAL_USER;
    await loadLocal();
  } else {
    const cached = await idb.get<Profile>("meta", "profile");
    const { data } = await sb.auth.getSession();
    if (data.session && cached && cached.id === data.session.user.id) state.user = cached;
    else if (data.session) await carregarPerfil();
    await loadLocal();
    if (state.user) void sync();
  }
  state.ready = true;
  notify();
}

async function carregarPerfil(): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  const { data: s } = await sb.auth.getSession();
  if (!s.session) return;
  const { data, error } = await sb.from("profiles").select("*").eq("id", s.session.user.id).maybeSingle();
  if (error) throw error;
  if (data) {
    state.user = profileFromRow(data);
    await idb.put("meta", "profile", state.user);
  }
}

export async function signIn(email: string, senha: string): Promise<void> {
  const sb = supabase();
  if (!sb) throw new Error("Servidor não configurado.");
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
  if (error) throw new Error(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message);
  await carregarPerfil();
  if (!state.user) throw new Error("Seu usuário ainda não tem perfil de acesso. Peça ao administrador.");
  await sync();
  notify();
}

export async function resetPassword(email: string): Promise<void> {
  const sb = supabase();
  if (!sb) throw new Error("Servidor não configurado.");
  const { error } = await sb.auth.resetPasswordForEmail(email.trim());
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  const sb = supabase();
  if (sb) await sb.auth.signOut();
  state.user = null;
  await idb.del("meta", "profile");
  for (const s of ["units", "points", "readings", "outbox", "photos"] as const) await idb.clear(s);
  await idb.del("meta", "lastPull");
  await idb.del("meta", "lastSync");
  await idb.del("meta", "failed");
  state.units = [];
  state.points = [];
  state.readings = [];
  state.pending = 0;
  state.lastSync = null;
  reindex();
}

/* ------------------------------------------------------------ gravações locais + fila */
async function enqueue(op: OutOp): Promise<void> {
  await idb.add("outbox", op);
  await refreshPending();
}

export interface NovaFoto {
  blob: Blob;
}

export async function salvarLeitura(
  dados: Omit<Reading, "created_by" | "created_at" | "updated_at" | "deleted" | "photos"> & { photos: string[] },
  novasFotos: NovaFoto[],
  editando: Reading | null
): Promise<Reading> {
  const agora = Date.now();
  const paths = [...dados.photos];
  for (let i = 0; i < novasFotos.length; i++) {
    const path = `${dados.unit_id}/${new Date(dados.ts).getFullYear()}/${dados.id}-${agora.toString(36)}${i}.jpg`;
    await idb.put("photos", path, novasFotos[i].blob);
    await enqueue({ kind: "photo", key: path, path, tries: 0 });
    paths.push(path);
  }
  const r: Reading = {
    ...dados,
    photos: paths,
    created_by: editando ? editando.created_by : state.user?.id ?? null,
    created_at: editando ? editando.created_at : agora,
    updated_at: agora,
    deleted: false
  };
  await idb.put("readings", r.id, r);
  state.readings = [...state.readings.filter((x) => x.id !== r.id), r];
  reindex();
  if (state.mode === "server") {
    await enqueue({ kind: "reading", id: r.id, isNew: !editando, tries: 0 });
    void sync();
  }
  return r;
}

export async function excluirLeitura(id: string): Promise<void> {
  const r = state.readings.find((x) => x.id === id);
  if (!r) return;
  const n: Reading = { ...r, deleted: true, updated_at: Date.now() };
  await idb.put("readings", id, n);
  state.readings = state.readings.map((x) => (x.id === id ? n : x));
  reindex();
  if (state.mode === "server") {
    await enqueue({ kind: "reading", id, isNew: false, tries: 0 });
    void sync();
  }
}

export async function salvarPonto(p: Point): Promise<void> {
  const n: Point = { ...p, updated_at: Date.now() };
  await idb.put("points", n.id, n);
  state.points = [...state.points.filter((x) => x.id !== n.id), n];
  notify();
  if (state.mode === "server") {
    await enqueue({ kind: "point", id: n.id, tries: 0 });
    void sync();
  }
}

export async function salvarUnidade(u: Unit): Promise<void> {
  const n: Unit = { ...u, updated_at: Date.now() };
  await idb.put("units", n.id, n);
  state.units = [...state.units.filter((x) => x.id !== n.id), n];
  notify();
  if (state.mode === "server") {
    await enqueue({ kind: "unit", id: n.id, tries: 0 });
    void sync();
  }
}

export function novoIdPonto(unitId: string, nome: string): string {
  return `${unitId}-${slug(nome) || "ponto"}-${uid().slice(0, 4)}`;
}
export function novoIdUnidade(nome: string): string {
  return slug(nome) || "unidade-" + uid().slice(0, 4);
}

/* ------------------------------------------------------------ fotos */
const urlCache = new Map<string, string>();
export async function fotoUrl(path: string): Promise<string | null> {
  const hit = urlCache.get(path);
  if (hit) return hit;
  const blob = await idb.get<Blob>("photos", path);
  if (blob) {
    const u = URL.createObjectURL(blob);
    urlCache.set(path, u);
    return u;
  }
  const sb = supabase();
  if (!sb || !state.online) return null;
  const { data, error } = await sb.storage.from("fotos").createSignedUrl(path, 3600);
  if (error || !data) return null;
  urlCache.set(path, data.signedUrl);
  setTimeout(() => urlCache.delete(path), 3000 * 1000);
  return data.signedUrl;
}

/* ------------------------------------------------------------ sincronização */
function errStatus(e: unknown): number {
  const x = e as { status?: number; statusCode?: string | number; code?: string; message?: string } | null;
  const s = Number(x?.status ?? x?.statusCode ?? 0);
  if (s) return s;
  return x?.code && /^\d{5}$|^PGRST/.test(x.code) ? 400 : 0;
}
const isNetwork = (e: unknown): boolean => {
  const m = String((e as { message?: string })?.message ?? e);
  return !errStatus(e) && /fetch|network|load failed|timeout|abort/i.test(m);
};

async function sendOp(op: OutOp): Promise<void> {
  const sb = supabase()!;
  if (op.kind === "photo") {
    const blob = await idb.get<Blob>("photos", op.key);
    if (!blob) return;
    const { error } = await sb.storage.from("fotos").upload(op.path, blob, { contentType: "image/jpeg", upsert: true });
    if (error) throw error;
    return;
  }
  if (op.kind === "unit") {
    const u = state.units.find((x) => x.id === op.id);
    if (!u) return;
    const { error } = await sb.from("units").upsert(unitToRow(u));
    if (error) throw error;
    return;
  }
  if (op.kind === "point") {
    const p = state.points.find((x) => x.id === op.id);
    if (!p) return;
    const { error } = await sb.from("points").upsert(pointToRow(p));
    if (error) throw error;
    return;
  }
  const r = state.readings.find((x) => x.id === op.id);
  if (!r) return;
  const row = readingToRow(r);
  if (op.isNew && !r.deleted) {
    const { error } = await sb.from("readings").insert(row);
    if (!error) return;
    if ((error as { code?: string }).code !== "23505") throw error;
  }
  const { created_by: _cb, created_at: _ca, ...upd } = row;
  const { error } = await sb.from("readings").update(upd).eq("id", r.id);
  if (error) throw error;
}

async function pull(): Promise<void> {
  const sb = supabase()!;
  const since = Math.max(0, ((await idb.get<number>("meta", "lastPull")) ?? 0) - 5 * 60 * 1000);
  const t0 = Date.now();
  const iso = new Date(since).toISOString();
  const pendentes = new Set<string>();
  for (const op of await idb.all<OutOp>("outbox")) if (op.kind !== "photo") pendentes.add(op.kind + ":" + op.id);

  const fetchAll = async (table: string): Promise<Record<string, unknown>[]> => {
    const out: Record<string, unknown>[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(table).select("*").gt("updated_at", iso).order("updated_at", { ascending: true }).range(from, from + 999);
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  };

  for (const row of await fetchAll("units")) {
    const u = unitFromRow(row);
    if (pendentes.has("unit:" + u.id)) continue;
    await idb.put("units", u.id, u);
  }
  for (const row of await fetchAll("points")) {
    const p = pointFromRow(row);
    if (pendentes.has("point:" + p.id)) continue;
    await idb.put("points", p.id, p);
  }
  for (const row of await fetchAll("readings")) {
    const r = readingFromRow(row);
    if (pendentes.has("reading:" + r.id)) continue;
    await idb.put("readings", r.id, r);
  }
  await idb.put("meta", "lastPull", t0);
  await idb.put("meta", "lastSync", Date.now());
  state.lastSync = Date.now();
  const [units, points, readings] = await Promise.all([idb.all<Unit>("units"), idb.all<Point>("points"), idb.all<Reading>("readings")]);
  state.units = units;
  state.points = points;
  state.readings = readings;
}

let running = false;
export async function sync(): Promise<void> {
  if (state.mode !== "server" || !state.user || !state.online || running) return;
  running = true;
  state.syncing = true;
  state.syncError = null;
  notify();
  try {
    const entries: [IDBValidKey, OutOp][] = [];
    const db = await idb.keys("outbox");
    for (const k of db) {
      const v = await idb.get<OutOp>("outbox", k);
      if (v) entries.push([k, v]);
    }
    for (const [key, op] of entries) {
      try {
        await sendOp(op);
        if (op.kind === "photo") await idb.del("photos", op.key);
        await idb.del("outbox", key);
      } catch (e) {
        if (isNetwork(e)) throw e;
        const tries = op.tries + 1;
        const msg = (e as { message?: string })?.message ?? "erro";
        if (tries >= 5) {
          const failed = (await idb.get<unknown[]>("meta", "failed")) ?? [];
          failed.push({ op, msg, ts: Date.now() });
          await idb.put("meta", "failed", failed);
          await idb.del("outbox", key);
          state.syncError = `Não foi possível enviar um item: ${msg}`;
        } else {
          await idb.put("outbox", key, { ...op, tries });
          state.syncError = `Falha ao enviar: ${msg}`;
        }
      }
    }
    await pull();
    await refreshPending();
    reindex();
  } catch (e) {
    if (isNetwork(e)) state.online = false;
    else state.syncError = (e as { message?: string })?.message ?? "Erro de sincronização";
    await refreshPending();
  } finally {
    running = false;
    state.syncing = false;
    notify();
  }
}

/* ------------------------------------------------------------ administração (somente servidor) */
export async function listarPerfis(): Promise<Profile[]> {
  const sb = supabase();
  if (!sb) return [];
  const { data, error } = await sb.from("profiles").select("*").order("nome");
  if (error) throw error;
  return data.map(profileFromRow);
}

export async function atualizarPerfil(p: Profile): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  const { error } = await sb.from("profiles").update({ nome: p.nome, role: p.role, unit_ids: p.unit_ids }).eq("id", p.id);
  if (error) throw error;
}

export async function listarAuditoria(limite = 200): Promise<AuditEntry[]> {
  const sb = supabase();
  if (!sb) return [];
  const { data, error } = await sb.from("audit_log").select("*").order("ts", { ascending: false }).limit(limite);
  if (error) throw error;
  const perfis = isAdmin() ? await listarPerfis().catch(() => []) : [];
  const nomes = new Map(perfis.map((p) => [p.id, p.nome || p.email]));
  if (state.user) nomes.set(state.user.id, state.user.nome);
  return data.map((r) => auditFromRow(r, nomes));
}

export async function descartarFalhas(): Promise<void> {
  await idb.del("meta", "failed");
  await refreshPending();
  notify();
}
