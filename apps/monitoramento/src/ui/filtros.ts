import { GRUPOS, GRUPO_KEYS } from "../domain/config";
import { dIso, esc } from "../domain/format";
import type { Point, Reading } from "../domain/types";
import { leiturasVisiveis, pontosVisiveis, unidadesVisiveis } from "../data/store";

export interface Filtros {
  un: string;
  g: string;
  pt: string;
  ini: string;
  fim: string;
  ind: string;
  comp: string;
  pz: string;
  hid: string;
  hidm: string;
  hor: string;
  horm: string;
}

export const F: Filtros = { un: "", g: "", pt: "", ini: "", fim: "", ind: "", comp: "", pz: "", hid: "", hidm: "v", hor: "", horm: "v" };

export function iniciarFiltros(): void {
  const h = new Date();
  F.ini = dIso(new Date(h.getFullYear(), h.getMonth(), 1).getTime());
  F.fim = dIso(h.getTime());
}

export function janela(): { ini: number; fim: number } {
  return {
    ini: F.ini ? new Date(F.ini + "T00:00:00").getTime() : -Infinity,
    fim: F.fim ? new Date(F.fim + "T23:59:59").getTime() : Infinity
  };
}

export function pontosFiltro(): Point[] {
  return pontosVisiveis().filter((p) => (!F.un || p.unit_id === F.un) && (!F.g || p.grupo === F.g) && (!F.pt || p.id === F.pt));
}

export function regsFiltro(): Reading[] {
  const w = janela();
  const ids = new Set(pontosFiltro().map((p) => p.id));
  return leiturasVisiveis()
    .filter((r) => ids.has(r.point_id) && r.ts >= w.ini && r.ts <= w.fim)
    .sort((a, b) => b.ts - a.ts);
}

/* ---- barra de filtros compartilhada (dashboard e histórico) ---- */
let filtrosAbertos = false;
function resumoFiltros(): string {
  const un = unidadesVisiveis().find((u) => u.id === F.un)?.nome ?? "Todas as unidades";
  const pt = pontosVisiveis().find((p) => p.id === F.pt)?.nome ?? (F.g ? GRUPOS[F.g as keyof typeof GRUPOS].rot : "Todos os pontos");
  const fmtD = (s: string) => (s ? s.split("-").reverse().join("/") : "…");
  return `${fmtD(F.ini)} a ${fmtD(F.fim)} · ${un} · ${pt}`;
}

export function filtrosHtml(): string {
  const pts = pontosVisiveis().filter((p) => (!F.un || p.unit_id === F.un) && (!F.g || p.grupo === F.g));
  const sel = (id: string, rot: string, opts: string) => `<div><label for="${id}">${rot}</label><select id="${id}">${opts}</select></div>`;
  const op = (v: string, t: string, cur: string) => `<option value="${esc(v)}"${cur === v ? " selected" : ""}>${esc(t)}</option>`;
  return `<details class="fdet" id="fl-det"${filtrosAbertos ? " open" : ""}><summary><span class="fs-t">Filtros</span><span class="fs-r">${esc(resumoFiltros())}</span></summary><div class="filtros">
    ${sel("fl-un", "Unidade", op("", "Todas", F.un) + unidadesVisiveis().map((u) => op(u.id, u.nome, F.un)).join(""))}
    ${sel("fl-g", "Categoria", op("", "Todas", F.g) + GRUPO_KEYS.map((g) => op(g, GRUPOS[g].rot, F.g)).join(""))}
    ${sel("fl-pt", "Ponto", op("", "Todos", F.pt) + pts.map((p) => op(p.id, p.nome, F.pt)).join(""))}
    <div><label for="fl-ini">Data inicial</label><input type="date" id="fl-ini" value="${esc(F.ini)}"></div>
    <div><label for="fl-fim">Data final</label><input type="date" id="fl-fim" value="${esc(F.fim)}"></div>
  </div>
  <div class="rapidos"><button type="button" class="btn sm" data-rp="mes">Este mês</button><button type="button" class="btn sm" data-rp="7">Últimos 7 dias</button><button type="button" class="btn sm" data-rp="30">Últimos 30 dias</button><button type="button" class="btn sm" data-rp="tudo">Todo o período</button></div></details>`;
}

/** Liga os filtros ao elemento raiz. `aoMudar` deve redesenhar a tela (inclusive a barra). */
export function ligarFiltros(el: HTMLElement, aoMudar: () => void): void {
  el.addEventListener("toggle", (e) => {
    const t = e.target as HTMLElement;
    if (t.id === "fl-det") filtrosAbertos = (t as HTMLDetailsElement).open;
  }, true);
  el.addEventListener("change", (e) => {
    const m = /^fl-(un|g|pt|ini|fim)$/.exec((e.target as HTMLElement).id);
    if (!m) return;
    const campo = m[1] as "un" | "g" | "pt" | "ini" | "fim";
    F[campo] = (e.target as HTMLSelectElement).value;
    if (campo === "g" || campo === "un") {
      const p = pontosVisiveis().find((x) => x.id === F.pt);
      if (p && ((F.g && p.grupo !== F.g) || (F.un && p.unit_id !== F.un))) F.pt = "";
    }
    if (campo !== "ini" && campo !== "fim") F.ind = "";
    aoMudar();
  });
  el.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-rp]");
    if (!b) return;
    const h = new Date();
    const tipo = b.dataset.rp!;
    if (tipo === "mes") {
      F.ini = dIso(new Date(h.getFullYear(), h.getMonth(), 1).getTime());
      F.fim = dIso(h.getTime());
    } else if (tipo === "tudo") {
      const ts = leiturasVisiveis().map((r) => r.ts);
      F.ini = ts.length ? dIso(Math.min(...ts)) : dIso(h.getTime());
      F.fim = dIso(h.getTime());
    } else {
      F.ini = dIso(h.getTime() - (Number(tipo) - 1) * 86400000);
      F.fim = dIso(h.getTime());
    }
    aoMudar();
  });
}
