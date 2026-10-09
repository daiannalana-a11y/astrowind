import { avisosDeLeitura } from "../../domain/calc";
import { CAMPOS, GRUPOS } from "../../domain/config";
import { dtFmt, dtLocal, esc, fmt, fmtIn, parseNum, uid } from "../../domain/format";
import type { Point, Reading, Valores } from "../../domain/types";
import { excluirLeitura, isGestor, pontosVisiveis, podeEditarLeitura, salvarLeitura, state } from "../../data/store";
import { icon } from "../icons";
import { hidratarFotos, miniFoto, toast, type View, confirmar } from "../dom";
import { tilesHtml } from "./home";

/** Pontos registrados no monitoramento em andamento (passo a passo). */
export const sessao: Reading[] = [];

/* ------------------------------------------------------------ passo 1: escolher o ponto */
export function viewNovo(): View {
  return {
    render(el) {
      el.innerHTML = `<div class="passo"><a class="btn sm" href="#/">${icon("back", 16)}Voltar</a><span class="sub">Passo 1 de 2</span></div>
        <h1 style="font-size:1.4rem">Selecione o ponto</h1>
        <p class="sub">${sessao.length ? `${sessao.length} ponto${sessao.length > 1 ? "s" : ""} registrado${sessao.length > 1 ? "s" : ""} neste monitoramento. Escolha o próximo ou finalize.` : "Toque no quadro do ponto que deseja registrar."}</p>
        <div id="tiles">${tilesHtml()}</div>
        ${sessao.length ? `<div class="acoes col"><a class="btn pri big" href="#/fim">${icon("check", 22)}Finalizar monitoramento</a></div>` : ""}`;
      el.querySelector("#tiles")!.addEventListener("click", (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>("[data-ponto]");
        if (b) location.hash = "#/registro/" + b.dataset.ponto;
      });
    }
  };
}

/* ------------------------------------------------------------ passo final */
export function viewFim(): View {
  return {
    render(el) {
      const pm = new Map(state.points.map((p) => [p.id, p]));
      el.innerHTML = `<section class="card"><h1 style="font-size:1.4rem">Monitoramento finalizado</h1>
        <p class="sub">${sessao.length ? `${sessao.length} ponto${sessao.length > 1 ? "s" : ""} registrado${sessao.length > 1 ? "s" : ""} neste monitoramento.` : "Nenhum ponto foi registrado neste monitoramento."}</p>
        <div class="lista">${sessao
          .map((x) => {
            const p = pm.get(x.point_id)!;
            return `<div class="item"><div class="l1"><span>${esc(p.nome)}</span><span>${dtFmt(x.ts)}</span></div><div class="vals">${GRUPOS[p.grupo].campos
              .filter((k) => x.v[k] != null)
              .map((k) => `<span>${esc(CAMPOS[k].rot)}: <b>${fmt(x.v[k])} ${CAMPOS[k].un}</b></span>`)
              .join("")}</div></div>`;
          })
          .join("")}</div>
        <div class="acoes col"><a class="btn pri big" href="#/novo" id="outro">${icon("plus", 22)}Iniciar outro monitoramento</a><a class="btn big" href="#/historico">Ver histórico</a></div></section>`;
      el.querySelector("#outro")!.addEventListener("click", () => (sessao.length = 0));
    }
  };
}

/* ------------------------------------------------------------ formulário */
type FotoRasc = { kind: "old"; path: string } | { kind: "new"; blob: Blob; url: string };

async function reduzir(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const m = Math.max(bmp.width, bmp.height);
    const e = m > 1600 ? 1600 / m : 1;
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * e);
    c.height = Math.round(bmp.height * e);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const b = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.84));
    return b ?? file;
  } catch {
    return file;
  }
}

export function viewRegistro(opts: { pontoId: string; editarId: string | null }): View {
  let editando: Reading | null = null;
  let ponto: Point | undefined;
  let fotos: FotoRasc[] = [];
  let dhTocado = false;
  let salvando = false;

  const q = <T extends HTMLElement>(el: HTMLElement, s: string) => el.querySelector<T>(s)!;

  function atualizarInfo(el: HTMLElement): void {
    const box = el.querySelector<HTMLElement>("#info");
    const p = ponto;
    if (!box || !p) return;
    let h = `<div class="nm"><span>${esc(p.nome)}</span>${p.inativo ? '<span class="chip">Fora de operação</span>' : ""}</div>`;
    if (p.info) h += `<div class="dado">${esc(p.info)}</div>`;
    let linhas = "";
    for (const k of GRUPOS[p.grupo].campos) {
      const ult = [...(state.index.byPoint.get(p.id) ?? [])].reverse().find((r) => r.v[k] != null && r.id !== editando?.id);
      if (ult) linhas += `<div>${esc(CAMPOS[k].rot)}: <b>${fmt(ult.v[k])} ${CAMPOS[k].un}</b> em ${dtFmt(ult.ts)}</div>`;
    }
    h += `<div class="ult">${linhas || '<div class="dado">Ainda não há leituras registradas neste ponto.</div>'}</div>`;
    box.innerHTML = h;
  }

  function atualizarRecentes(el: HTMLElement): void {
    const box = el.querySelector<HTMLElement>("#recentes");
    if (!box || !ponto) return;
    const ids = new Set(state.points.filter((p) => p.grupo === ponto!.grupo && p.unit_id === ponto!.unit_id).map((p) => p.id));
    const l = state.readings.filter((r) => !r.deleted && ids.has(r.point_id)).sort((a, b) => b.ts - a.ts).slice(0, 10);
    const pm = new Map(state.points.map((p) => [p.id, p]));
    el.querySelector("#rec-sub")!.textContent = GRUPOS[ponto.grupo].rot;
    box.innerHTML = l.length
      ? l
          .map((r) => {
            const vals = GRUPOS[pm.get(r.point_id)!.grupo].campos
              .filter((k) => r.v[k] != null)
              .map((k) => {
                const d = CAMPOS[k].cum ? state.index.delta(r, k) : null;
                return `<span>${esc(CAMPOS[k].rot)}: <b>${fmt(r.v[k])} ${CAMPOS[k].un}</b>${d != null ? ` (+${fmt(d)})` : ""}</span>`;
              })
              .join("");
            return `<div class="item"><div class="l1"><span>${esc(pm.get(r.point_id)?.nome ?? r.point_id)}</span><span>${dtFmt(r.ts)}</span></div><div class="vals">${vals}</div>
              ${r.obs ? `<div class="meta">${esc(r.obs)}</div>` : ""}
              <div class="meta">${r.resp ? esc(r.resp) + " · " : ""}${r.photos.length ? r.photos.length + (r.photos.length === 1 ? " foto" : " fotos") : "sem fotos"}</div>
              ${r.photos.length ? `<div class="thumbs" style="margin:0">${r.photos.map((p) => miniFoto(p)).join("")}</div>` : ""}
              ${podeEditarLeitura(r) ? `<div class="ac"><a class="btn sm" href="#/editar/${r.id}">${icon("edit", 14)}Editar</a></div>` : ""}</div>`;
          })
          .join("")
      : `<div class="vazio">Ainda não há leituras de ${esc(GRUPOS[ponto.grupo].rot.toLowerCase())}. As próximas aparecerão aqui.</div>`;
    hidratarFotos(box);
  }

  function renderThumbs(el: HTMLElement): void {
    q(el, "#thumbs").innerHTML = fotos
      .map((f, i) =>
        f.kind === "old"
          ? `<div style="position:relative">${miniFoto(f.path)}<button type="button" class="th-x" data-rm="${i}" aria-label="Remover foto" style="position:absolute;top:3px;right:3px;width:24px;height:24px;border-radius:50%;border:0;background:rgba(0,0,0,.62);color:#fff;display:grid;place-items:center;padding:0;cursor:pointer">${icon("x", 14)}</button></div>`
          : `<div class="th"><img src="${f.url}" alt="Foto ${i + 1}" data-zoom="${f.url}"><button type="button" data-rm="${i}" aria-label="Remover foto">${icon("x", 14)}</button></div>`
      )
      .join("");
    hidratarFotos(el);
  }

  async function adicionar(el: HTMLElement, files: FileList | null): Promise<void> {
    const lista = Array.from(files ?? []);
    for (const f of lista) {
      const blob = await reduzir(f);
      fotos.push({ kind: "new", blob, url: URL.createObjectURL(blob) });
    }
    const primeira = lista[0];
    if (primeira && !dhTocado && primeira.lastModified && Math.abs(Date.now() - primeira.lastModified) > 60000) q<HTMLInputElement>(el, "#f-dh").value = dtLocal(primeira.lastModified);
    renderThumbs(el);
  }

  function coletar(el: HTMLElement): { v: Valores; ts: number; erro: string | null } {
    const p = ponto!;
    const v: Valores = {};
    let erro: string | null = null;
    for (const k of GRUPOS[p.grupo].campos) {
      const s = q<HTMLInputElement>(el, "#c-" + k).value.trim();
      if (!s) continue;
      const n = parseNum(s, CAMPOS[k].milhar);
      if (n == null || isNaN(n)) erro = `Valor inválido em ${CAMPOS[k].rot}. Digite apenas números, usando vírgula nos decimais.`;
      else if (n < 0) erro = `${CAMPOS[k].rot} não pode ser negativo.`;
      else v[k] = n;
    }
    if (!erro && !Object.keys(v).length) erro = "Informe ao menos uma medição.";
    const dh = q<HTMLInputElement>(el, "#f-dh").value;
    if (!erro && !dh) erro = "Informe a data e a hora da leitura.";
    return { v, ts: dh ? new Date(dh).getTime() : 0, erro };
  }

  async function salvar(el: HTMLElement, forcar: boolean, modo: "novo" | "fim" | "edit"): Promise<void> {
    if (salvando || !ponto) return;
    const av = q(el, "#avisos");
    av.innerHTML = "";
    const c = coletar(el);
    if (c.erro) {
      av.innerHTML = `<div class="erro">${esc(c.erro)}</div>`;
      return;
    }
    const w = avisosDeLeitura(state.index, ponto, c.v, c.ts, editando?.id ?? null);
    if (w.length && !forcar) {
      av.innerHTML = `<div class="aviso">Confira antes de salvar:<ul>${w.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><div class="acoes" style="margin-top:8px"><button type="button" class="btn sm" id="btn-forcar" data-modo="${modo}">Salvar mesmo assim</button></div></div>`;
      return;
    }
    salvando = true;
    el.querySelectorAll<HTMLButtonElement>("#btn-sn, #btn-sf").forEach((b) => (b.disabled = true));
    try {
      const resp = q<HTMLInputElement>(el, "#f-resp").value.trim();
      try {
        localStorage.setItem("mon-resp", resp);
      } catch {
        /* ignora */
      }
      const r = await salvarLeitura(
        {
          id: editando?.id ?? uid(),
          point_id: ponto.id,
          unit_id: ponto.unit_id,
          ts: c.ts,
          v: c.v,
          obs: q<HTMLTextAreaElement>(el, "#f-obs").value.trim(),
          resp,
          photos: fotos.filter((f): f is Extract<FotoRasc, { kind: "old" }> => f.kind === "old").map((f) => f.path)
        },
        fotos.filter((f): f is Extract<FotoRasc, { kind: "new" }> => f.kind === "new").map((f) => ({ blob: f.blob })),
        editando
      );
      if (editando) {
        toast("Alterações salvas.");
        history.back();
        return;
      }
      sessao.push(r);
      toast(`Leitura de ${ponto.nome} salva.`);
      location.hash = modo === "fim" ? "#/fim" : "#/novo";
    } catch (e) {
      salvando = false;
      el.querySelectorAll<HTMLButtonElement>("#btn-sn, #btn-sf").forEach((b) => (b.disabled = false));
      av.innerHTML = `<div class="erro">Não foi possível salvar (${esc((e as Error).message || "erro")}). Tente novamente.</div>`;
    }
  }

  return {
    render(el) {
      if (opts.editarId) {
        editando = state.readings.find((r) => r.id === opts.editarId && !r.deleted) ?? null;
        if (!editando || !podeEditarLeitura(editando)) {
          el.innerHTML = '<div class="vazio">Esta leitura não existe ou você não tem permissão para editá-la.</div><div class="acoes"><a class="btn" href="#/historico">Voltar</a></div>';
          return;
        }
        ponto = state.points.find((p) => p.id === editando!.point_id);
        fotos = editando.photos.map((path) => ({ kind: "old", path }));
        dhTocado = true;
      } else {
        ponto = pontosVisiveis().find((p) => p.id === opts.pontoId);
      }
      if (!ponto) {
        el.innerHTML = '<div class="vazio">Ponto não encontrado.</div><div class="acoes"><a class="btn" href="#/novo">Escolher ponto</a></div>';
        return;
      }
      const irmaos = pontosVisiveis().filter((p) => p.grupo === ponto!.grupo && p.unit_id === ponto!.unit_id);
      const grupo = GRUPOS[ponto.grupo];
      const respPadrao = (() => {
        try {
          return localStorage.getItem("mon-resp");
        } catch {
          return null;
        }
      })() || (state.mode === "server" ? state.user?.nome ?? "" : "");
      el.innerHTML = `<div class="passo"><button type="button" class="btn sm" id="btn-voltar">${icon("back", 16)}Voltar</button><span class="sub">${editando ? "Editar leitura" : "Passo 2 de 2"}</span></div>
        <div class="grid2 reg"><div class="card" id="form">
          <label for="f-ponto">Ponto de monitoramento</label>
          <select id="f-ponto" ${editando ? "disabled" : ""}>${irmaos.map((p) => `<option value="${esc(p.id)}" ${p.id === ponto!.id ? "selected" : ""}>${esc(p.nome + (p.inativo ? " (fora de operação)" : ""))}</option>`).join("")}</select>
          <div class="info" id="info"></div>
          <label for="f-dh">Data e hora da leitura</label><input type="datetime-local" id="f-dh" value="${dtLocal(editando?.ts ?? Date.now())}">
          <div class="campos">${grupo.campos
            .map(
              (k) => `<div><label for="c-${k}">${esc(CAMPOS[k].rot)} <span class="sub">(${CAMPOS[k].un})</span></label><input type="text" class="num" id="c-${k}" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${editando?.v[k] != null ? fmtIn(editando.v[k]) : ""}"></div>`
            )
            .join("")}</div>
          <div class="lbl" style="margin-top:14px">Fotos da medição</div>
          <div class="acoes" style="margin-top:0">
            <span class="btn rel">${icon("camera", 18)}Tirar foto<input type="file" id="f-cam" class="cobre" accept="image/*" capture="environment" aria-label="Tirar foto"></span>
            <span class="btn rel">${icon("image", 18)}Galeria<input type="file" id="f-gal" class="cobre" accept="image/*" multiple aria-label="Escolher da galeria"></span>
          </div>
          <div class="thumbs" id="thumbs"></div>
          <label for="f-obs">Observações</label><textarea id="f-obs" placeholder="Ex.: equipamento em manutenção, condição do local">${esc(editando?.obs ?? "")}</textarea>
          <label for="f-resp">Responsável</label><input type="text" id="f-resp" autocomplete="off" placeholder="Quem realizou a medição" value="${esc(editando?.resp ?? respPadrao)}">
          <div id="avisos"></div>
          <div class="acoes col">
            <button type="button" class="btn pri big" id="btn-sn">${editando ? "Salvar alterações" : "Salvar e inserir novo ponto"}</button>
            ${editando ? "" : '<button type="button" class="btn big" id="btn-sf">Salvar e finalizar monitoramento</button>'}
            ${editando && isGestor() ? `<button type="button" class="btn big dang" id="btn-del">${icon("trash", 18)}Excluir leitura</button>` : ""}
          </div>
        </div>
        <div><div class="sec-tit"><h2 style="margin-top:0">Últimas leituras</h2><span class="sub" id="rec-sub"></span></div><div class="lista" id="recentes"></div></div></div>`;
      renderThumbs(el);
      atualizarInfo(el);
      atualizarRecentes(el);

      el.addEventListener("click", (e) => {
        const t = e.target as HTMLElement;
        let b: HTMLElement | null;
        if (t.closest("#btn-voltar")) return history.length > 1 ? history.back() : (location.hash = "#/");
        if ((b = t.closest("[data-rm]"))) {
          const f = fotos.splice(Number(b.dataset.rm), 1)[0];
          if (f?.kind === "new") URL.revokeObjectURL(f.url);
          return renderThumbs(el);
        }
        if (t.closest("#btn-sn")) return void salvar(el, false, editando ? "edit" : "novo");
        if (t.closest("#btn-sf")) return void salvar(el, false, "fim");
        if ((b = t.closest("#btn-forcar"))) return void salvar(el, true, b.dataset.modo as "novo" | "fim" | "edit");
        if (t.closest("#btn-del") && editando && confirmar("Excluir esta leitura? A ação fica registrada na auditoria.")) {
          void excluirLeitura(editando.id).then(() => {
            toast("Leitura excluída.");
            history.back();
          });
        }
      });
      el.addEventListener("change", (e) => {
        const t = e.target as HTMLInputElement;
        if (t.id === "f-ponto") {
          location.hash = "#/registro/" + t.value;
        } else if (t.id === "f-dh") dhTocado = true;
        else if (t.id === "f-cam" || t.id === "f-gal") void adicionar(el, t.files).then(() => (t.value = ""));
      });
      el.addEventListener("input", (e) => (e.target as HTMLElement).classList.remove("sug"));
    },
    onData(el) {
      if (!ponto) return;
      atualizarInfo(el);
      atualizarRecentes(el);
    },
    destroy() {
      fotos.forEach((f) => f.kind === "new" && URL.revokeObjectURL(f.url));
    }
  };
}
