import { calcAlertas } from "../../domain/calc";
import { CAMPOS, GRUPOS, GRUPO_KEYS } from "../../domain/config";
import { dtFmt, esc, fmt } from "../../domain/format";
import { pontosVisiveis, state } from "../../data/store";
import type { Point } from "../../domain/types";
import { F } from "../filtros";
import { icon } from "../icons";
import { sessao } from "./registro";
import type { View } from "../dom";

export function resumoPonto(p: Point): string {
  const partes = GRUPOS[p.grupo].campos
    .map((k) => {
      const ult = [...(state.index.byPoint.get(p.id) ?? [])].reverse().find((r) => r.v[k] != null);
      return ult ? `<span>${esc(CAMPOS[k].rot)} <b>${fmt(ult.v[k])} ${CAMPOS[k].un}</b></span>` : "";
    })
    .filter(Boolean);
  return partes.length ? partes.join("") : "<span>Sem leituras</span>";
}

export function tilesHtml(): string {
  const pts = pontosVisiveis().filter((p) => !F.un || p.unit_id === F.un);
  if (!pts.length) return '<div class="vazio">Nenhum ponto cadastrado para esta unidade.</div>';
  const alertas = new Map(calcAlertas(state.index, pts).map((a) => [a.point_id, a.level]));
  return GRUPO_KEYS.map((g) => {
    const lista = pts.filter((p) => p.grupo === g);
    if (!lista.length) return "";
    return `<div class="gtit">${esc(GRUPOS[g].rot)}</div><div class="tiles">${lista
      .map((p) => {
        const u = state.index.last(p.id);
        const feito = sessao.some((x) => x.point_id === p.id);
        const lv = alertas.get(p.id);
        return `<button type="button" class="tile${p.inativo ? " off" : ""}${feito ? " ok" : ""}" data-ponto="${esc(p.id)}">
          <span class="tn">${esc(p.nome)}${lv && lv !== "info" ? `<span class="dot${lv === "atencao" ? " warn" : ""}" title="Alerta"></span>` : ""}</span>
          ${feito ? '<span class="chip ok">Registrado agora</span>' : p.inativo ? '<span class="chip">Fora de operação</span>' : ""}
          <span class="tv">${resumoPonto(p)}</span><span class="td">${u ? "Última: " + dtFmt(u.ts) : ""}</span></button>`;
      })
      .join("")}</div>`;
  }).join("");
}

export function viewHome(): View {
  const root = (el: HTMLElement) => el;
  let handler: ((e: Event) => void) | null = null;
  const draw = (el: HTMLElement) => {
    const pts = pontosVisiveis().filter((p) => !F.un || p.unit_id === F.un);
    const al = calcAlertas(state.index, pts).filter((a) => a.level !== "info");
    const crit = al.some((a) => a.level === "critico");
    el.innerHTML = `<div class="pagehead"><div><h1>Início</h1><span class="sub">${pts.length} ponto${pts.length === 1 ? "" : "s"} de monitoramento</span></div></div>
      <section class="card hero"><h2>Inserir novo monitoramento</h2><p>Registre as medições em campo. Funciona sem internet e envia quando houver sinal.</p>
        <a class="btn pri big" href="#/novo">${icon("plus", 22)}Iniciar monitoramento</a></section>
      ${al.length ? `<a class="resumo-alertas${crit ? " critico" : ""}" href="#/alertas" style="margin-top:14px">${icon("alert", 22)}<span>${al.length} alerta${al.length > 1 ? "s" : ""} ativo${al.length > 1 ? "s" : ""}. Toque para ver.</span></a>` : ""}
      <h2>Pontos de monitoramento</h2>${tilesHtml()}`;
  };
  return {
    render(el) {
      draw(root(el));
      if (handler) el.removeEventListener("click", handler);
      handler = (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>("[data-ponto]");
        if (!b) return;
        sessao.length = 0;
        location.hash = "#/registro/" + b.dataset.ponto;
      };
      el.addEventListener("click", handler);
    }
  };
}
