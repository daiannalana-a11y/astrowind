export const pad = (n: number): string => (n < 10 ? "0" : "") + n;

export function esc(s: unknown): string {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function dtFmt(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function dFmt(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
/** Valor para <input type="datetime-local">. */
export function dtLocal(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** Valor para <input type="date">. */
export function dIso(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const nf = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function fmt(n: number | null | undefined): string {
  return n == null || isNaN(n) ? "" : nf.format(n);
}
/** Número para preencher um campo de texto: sem separador de milhar. */
export function fmtIn(n: number | null | undefined): string {
  return n == null ? "" : n.toLocaleString("pt-BR", { useGrouping: false, maximumFractionDigits: 3 });
}

/**
 * Lê um número digitado em português. Vírgula é decimal. Com `milhar`, "12.345" vira 12345.
 * Retorna null para vazio e NaN para texto inválido.
 */
export function parseNum(input: unknown, milhar = false): number | null {
  let s = String(input == null ? "" : input).trim().replace(/\s/g, "");
  if (!s) return null;
  let neg = false;
  if (s.charAt(0) === "-") {
    neg = true;
    s = s.slice(1);
  }
  if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
  else if (milhar && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  const n = parseFloat(s);
  return neg ? -n : n;
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
