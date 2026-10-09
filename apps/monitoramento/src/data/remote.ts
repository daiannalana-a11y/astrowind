import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";
import type { Limites, Point, Profile, Reading, Unit, AuditEntry, Role } from "../domain/types";

const CFG_KEY = "mon-servidor";

export interface ServerConfig {
  url: string;
  key: string;
}

export function getServerConfig(): ServerConfig | null {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) {
      const c = JSON.parse(raw) as ServerConfig;
      if (c.url && c.key) return c;
    }
  } catch {
    /* sem armazenamento: usa o padrão do build */
  }
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && key ? { url, key } : null;
}

export function setServerConfig(c: ServerConfig | null): void {
  try {
    if (c) localStorage.setItem(CFG_KEY, JSON.stringify(c));
    else localStorage.removeItem(CFG_KEY);
  } catch {
    /* ignora */
  }
}

let client: SupabaseClient | null | undefined;
export function supabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const c = getServerConfig();
  client = c ? createClient(c.url, c.key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "mon-auth" } }) : null;
  return client;
}

const ms = (s: string | null | undefined): number => (s ? new Date(s).getTime() : 0);
const iso = (n: number): string => new Date(n).toISOString();

/* ---- conversões linha <-> modelo ---- */
export function unitFromRow(r: Record<string, unknown>): Unit {
  return { id: r.id as string, nome: r.nome as string, ativo: r.ativo as boolean, updated_at: ms(r.updated_at as string) };
}
export function pointFromRow(r: Record<string, unknown>): Point {
  return {
    id: r.id as string,
    unit_id: r.unit_id as string,
    grupo: r.grupo as Point["grupo"],
    nome: r.nome as string,
    info: (r.info as string) ?? "",
    prof: r.prof == null ? null : Number(r.prof),
    inativo: !!r.inativo,
    limites: (r.limites as Limites) ?? {},
    ordem: Number(r.ordem ?? 0),
    updated_at: ms(r.updated_at as string)
  };
}
export function readingFromRow(r: Record<string, unknown>): Reading {
  return {
    id: r.id as string,
    point_id: r.point_id as string,
    unit_id: r.unit_id as string,
    ts: ms(r.ts as string),
    v: (r.v as Reading["v"]) ?? {},
    obs: (r.obs as string) ?? "",
    resp: (r.resp as string) ?? "",
    photos: (r.photos as string[]) ?? [],
    created_by: (r.created_by as string) ?? null,
    created_at: ms(r.created_at as string),
    updated_at: ms(r.updated_at as string),
    deleted: !!r.deleted_at
  };
}
export const unitToRow = (u: Unit) => ({ id: u.id, nome: u.nome, ativo: u.ativo });
export const pointToRow = (p: Point) => ({
  id: p.id,
  unit_id: p.unit_id,
  grupo: p.grupo,
  nome: p.nome,
  info: p.info,
  prof: p.prof,
  inativo: p.inativo,
  limites: p.limites,
  ordem: p.ordem
});
export const readingToRow = (r: Reading) => ({
  id: r.id,
  point_id: r.point_id,
  unit_id: r.unit_id,
  ts: iso(r.ts),
  v: r.v,
  obs: r.obs,
  resp: r.resp,
  photos: r.photos,
  created_by: r.created_by,
  created_at: iso(r.created_at),
  deleted_at: r.deleted ? new Date().toISOString() : null
});

export function profileFromRow(r: Record<string, unknown>): Profile {
  return { id: r.id as string, nome: (r.nome as string) ?? "", email: (r.email as string) ?? "", role: (r.role as Role) ?? "campo", unit_ids: (r.unit_ids as string[]) ?? [] };
}

export function auditFromRow(r: Record<string, unknown>, nomes: Map<string, string>): AuditEntry {
  const uid = (r.user_id as string) ?? null;
  return {
    id: Number(r.id),
    ts: ms(r.ts as string),
    user_id: uid,
    user_nome: uid ? nomes.get(uid) || "Usuário" : "Sistema",
    action: r.action as string,
    table_name: r.table_name as string,
    row_id: r.row_id as string,
    before: r.before,
    after: r.after
  };
}

export type { Session };
