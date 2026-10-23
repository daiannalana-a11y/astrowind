import type { Reading } from "./types";

/**
 * Código curto do comprovante: resumo SHA-256 dos identificadores, horários e valores das leituras.
 * Se qualquer valor mudar depois da emissão, o código recalculado deixa de coincidir.
 */
export async function codigoComprovante(leituras: Reading[]): Promise<string> {
  const base = leituras
    .slice()
    .sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id))
    .map((r) => `${r.id}|${r.point_id}|${r.ts}|${JSON.stringify(Object.entries(r.v).sort(([a], [b]) => a.localeCompare(b)))}`)
    .join(";");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(base));
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}
