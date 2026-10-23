import { calcAlertas } from "../../domain/calc";
import { esc, dtFmt } from "../../domain/format";
import { pontosVisiveis, state } from "../../data/store";
import { F } from "../filtros";
import { icon } from "../icons";
import type { View } from "../dom";

export function viewAlertas(): View {
  return {
    render(el) {
      const pts = pontosVisiveis().filter((p) => !F.un || p.unit_id === F.un);
      const al = calcAlertas(state.index, pts);
      const nome = new Map(pts.map((p) => [p.id, p]));
      el.innerHTML = `<div class="pagehead"><div><h1>Alertas</h1><span class="sub">Calculados a partir das leituras e dos limites de cada ponto</span></div></div>
        ${
          al.length
            ? `<div class="lista">${al
                .map(
                  (a) => `<div class="alerta ${a.level}">${icon(a.level === "info" ? "bell" : "alert", 22)}<div><b>${esc(a.titulo)}</b><span class="sub">${esc(a.detalhe)}</span></div>
                  <a class="btn sm" href="#/registro/${esc(a.point_id)}">Registrar</a></div>`
                )
                .join("")}</div>`
            : `<div class="vazio">${icon("shield", 26)}<br>Nenhum alerta ativo. Todos os pontos estão dentro dos limites.</div>`
        }
        <p class="nota">Os limites (nível máximo e mínimo, vazão por dia, horas por dia e dias sem leitura) são definidos por ponto em Cadastro. ${nome.size ? "" : ""}Atualizado em ${dtFmt(Date.now())}.</p>`;
    }
  };
}
