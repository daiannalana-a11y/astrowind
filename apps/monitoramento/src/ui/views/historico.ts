import { dtFmt, esc } from "../../domain/format";
import { CAMPOS, GRUPOS } from "../../domain/config";
import { excluirLeitura, podeEditarLeitura, state } from "../../data/store";
import { entregarArquivo } from "../../export/arquivos";
import type { ContextoExport } from "../../export/tabela";
import { F, filtrosHtml, janela, ligarFiltros, pontosFiltro, regsFiltro } from "../filtros";
import { icon } from "../icons";
import { confirmar, hidratarFotos, miniFoto, toast, type View } from "../dom";

function contexto(): ContextoExport {
  const un = state.units.find((u) => u.id === F.un);
  const pts = pontosFiltro();
  return {
    ix: state.index,
    pontos: pts,
    todosPontos: state.points,
    unidades: state.units,
    leituras: regsFiltro(),
    janela: janela(),
    escopo: [un ? un.nome : "Todas as unidades", F.g ? GRUPOS[F.g as keyof typeof GRUPOS].rot : "Todas as categorias", F.pt ? (state.points.find((p) => p.id === F.pt)?.nome ?? "") : "Todos os pontos"].join(" · "),
    usuario: state.user?.nome || "—"
  };
}

export function viewHistorico(): View {
  let el!: HTMLElement;
  let ocupado = false;

  function draw(): void {
    el.querySelector("#filtros")!.innerHTML = filtrosHtml();
    const rs = regsFiltro();
    const pm = new Map(state.points.map((p) => [p.id, p]));
    el.querySelector("#h-cont")!.textContent = `${rs.length} ${rs.length === 1 ? "leitura" : "leituras"}`;
    el.querySelectorAll<HTMLButtonElement>("[data-exp]").forEach((b) => (b.disabled = !rs.length || ocupado));
    const tabela = el.querySelector("#hist")!;
    if (!rs.length) {
      tabela.innerHTML = "<tbody><tr><td>Não há leituras para os filtros selecionados.</td></tr></tbody>";
      return;
    }
    tabela.innerHTML = `<thead><tr><th>Data e hora</th><th>Ponto</th><th>Medições</th><th>Responsável</th><th>Observações</th><th>Fotos</th><th></th></tr></thead><tbody>${rs
      .slice(0, 500)
      .map((r) => {
        const p = pm.get(r.point_id);
        const vals = p
          ? GRUPOS[p.grupo].campos
              .filter((k) => r.v[k] != null)
              .map((k) => {
                const d = CAMPOS[k].cum ? state.index.delta(r, k) : null;
                return `${esc(CAMPOS[k].rot)}: <b>${r.v[k]!.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} ${CAMPOS[k].un}</b>${d != null ? ` (+${d.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : ""}`;
              })
              .join("<br>")
          : "";
        const pode = podeEditarLeitura(r);
        return `<tr><td>${dtFmt(r.ts)}</td><td>${esc(p?.nome ?? r.point_id)}</td><td style="font-family:var(--f-data)">${vals}</td><td>${esc(r.resp)}</td><td class="obs">${esc(r.obs)}</td><td>${r.photos.map((f) => miniFoto(f)).join("")}</td>
          <td>${pode ? `<a class="btn sm" href="#/editar/${r.id}">${icon("edit", 14)}Editar</a> <button type="button" class="btn sm dang" data-del="${r.id}">${icon("trash", 14)}</button>` : ""}</td></tr>`;
      })
      .join("")}</tbody>`;
    if (rs.length > 500) el.querySelector("#h-cont")!.textContent += ` · exibindo as 500 mais recentes (a exportação inclui todas)`;
    hidratarFotos(tabela);
  }

  async function exportar(tipo: "csv" | "xlsx" | "pdf"): Promise<void> {
    const nota = el.querySelector<HTMLElement>("#x-nota")!;
    const c = contexto();
    ocupado = true;
    el.querySelectorAll<HTMLButtonElement>("[data-exp]").forEach((b) => (b.disabled = true));
    nota.textContent = "Gerando arquivo...";
    try {
      await new Promise((r) => setTimeout(r, 30));
      const tab = await import("../../export/tabela");
      const blob = tipo === "csv" ? tab.gerarCsv(c) : tipo === "xlsx" ? tab.gerarXlsx(c) : (await import("../../export/pdf")).gerarPdf(c);
      nota.textContent = await entregarArquivo(tab.nomeArquivo(c, tipo), blob);
    } catch (e) {
      nota.textContent = `Não foi possível gerar o arquivo (${(e as Error).message || "erro"}).`;
    } finally {
      ocupado = false;
      el.querySelectorAll<HTMLButtonElement>("[data-exp]").forEach((b) => (b.disabled = !regsFiltro().length));
    }
  }

  return {
    render(root) {
      el = root;
      el.innerHTML = `<div class="pagehead"><div><h1>Histórico e exportação</h1><span class="sub">Consulte, corrija e exporte as leituras</span></div></div>
        <section class="card"><div id="filtros"></div>
          <div class="exp">
            <button type="button" class="btn pri" data-exp="csv">${icon("download", 18)}CSV</button>
            <button type="button" class="btn pri" data-exp="xlsx">${icon("sheet", 18)}Excel</button>
            <button type="button" class="btn pri" data-exp="pdf">${icon("file", 18)}Relatório PDF</button>
            <span class="nota" id="x-nota" style="margin:0"></span>
          </div></section>
        <div class="sec-tit"><h2>Histórico de leituras</h2><span class="sub" id="h-cont"></span></div>
        <div class="tbl"><table id="hist"></table></div>`;
      ligarFiltros(el, draw);
      el.addEventListener("click", (e) => {
        const t = e.target as HTMLElement;
        const x = t.closest<HTMLElement>("[data-exp]");
        if (x) return void exportar(x.dataset.exp as "csv" | "xlsx" | "pdf");
        const d = t.closest<HTMLElement>("[data-del]");
        if (d && confirmar("Excluir esta leitura? A ação fica registrada na auditoria.")) void excluirLeitura(d.dataset.del!).then(() => toast("Leitura excluída."));
      });
      draw();
    },
    onData: () => draw()
  };
}
