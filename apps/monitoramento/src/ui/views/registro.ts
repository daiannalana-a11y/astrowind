import { avisosDeLeitura } from "../../domain/calc";
import { CAMPOS, GRUPOS } from "../../domain/config";
import { dFmt, dIso, dtFmt, dtLocal, esc, fmt, fmtIn, pad, parseNum, uid } from "../../domain/format";
import type { Point, Reading, Valores } from "../../domain/types";
import { excluirLeitura, isGestor, pontosVisiveis, podeEditarLeitura, salvarLeitura, state } from "../../data/store";
import { icon } from "../icons";
import { hidratarFotos, miniFoto, toast, type View, confirmar } from "../dom";
import { tilesHtml } from "./home";

/** Pontos registrados no monitoramento em andamento (passo a passo). */
export const sessao: Reading[] = [];

/** Dia do monitoramento em andamento (AAAA-MM-DD): definido ao iniciar e igual para todos os pontos da série. A hora é de cada ponto. */
export const serie: { dia: string | null } = { dia: null };

const horaAgora = (): string => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Começa um monitoramento novo: limpa os pontos já registrados e fixa o dia de hoje. */
export function iniciarSessao(): void {
  sessao.length = 0;
  serie.dia = dIso(Date.now());
}

function itemSessao(x: Reading, pm: Map<string, Point>): string {
  const r = state.readings.find((y) => y.id === x.id && !y.deleted) ?? x;
  const p = pm.get(r.point_id);
  const vals = p
    ? GRUPOS[p.grupo].campos
        .filter((k) => r.v[k] != null)
        .map((k) => `<span>${esc(CAMPOS[k].rot)}: <b>${fmt(r.v[k])} ${CAMPOS[k].un}</b></span>`)
        .join("")
    : "";
  return `<div class="item"><div class="l1"><span>${esc(p?.nome ?? r.point_id)}</span><span>${dtFmt(r.ts)}</span></div><div class="vals">${vals}</div>
    ${podeEditarLeitura(r) ? `<div class="ac"><a class="btn sm" href="#/editar/${r.id}">${icon("edit", 16)}Editar</a><button type="button" class="btn sm dang" data-del-sess="${r.id}">${icon("trash", 16)}Excluir</button></div>` : ""}</div>`;
}

function ligarExclusaoSessao(el: HTMLElement, redesenhar: () => void): void {
  el.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-del-sess]");
    if (!b || !confirmar("Excluir esta leitura? A ação fica registrada na auditoria.")) return;
    const id = b.dataset.delSess!;
    void excluirLeitura(id).then(() => {
      const i = sessao.findIndex((s) => s.id === id);
      if (i >= 0) sessao.splice(i, 1);
      toast("Leitura excluída.");
      redesenhar();
    });
  });
}

/* ------------------------------------------------------------ passo 1: escolher o ponto */
export function viewNovo(): View {
  return {
    render(el) {
      if (serie.dia == null) serie.dia = dIso(Date.now());
      el.innerHTML = `<div class="passo"><a class="btn sm" href="#/">${icon("back", 16)}Voltar</a><span class="sub">Passo 1 de 2</span></div>
        <h1 style="font-size:1.4rem">Selecione o ponto</h1>
        <div class="card" style="margin-bottom:14px"><label for="n-dia" style="margin-top:0">Dia do monitoramento</label>
          <input type="date" id="n-dia" value="${serie.dia ?? dIso(Date.now())}">
          <div class="nota" style="margin-top:6px">O dia vale para todos os pontos deste monitoramento. A hora de cada ponto é a do momento do registro.</div></div>
        <p class="sub">${sessao.length ? `${sessao.length} ponto${sessao.length > 1 ? "s" : ""} registrado${sessao.length > 1 ? "s" : ""} neste monitoramento. Escolha o próximo ou finalize.` : "Toque no quadro do ponto que deseja registrar."}</p>
        ${sessao.length ? `<div class="acoes col" style="margin-top:0"><a class="btn pri big" href="#/fim">${icon("check", 22)}Finalizar monitoramento</a></div>
        <h2>Registrado neste monitoramento</h2><div class="lista" id="sess-lista">${sessao.map((x) => itemSessao(x, new Map(state.points.map((p) => [p.id, p])))).join("")}</div>` : ""}
        <div id="tiles">${tilesHtml()}</div>`;
      ligarExclusaoSessao(el, () => viewNovo().render(el));
      el.querySelector<HTMLInputElement>("#n-dia")!.addEventListener("change", (e) => {
        const v = (e.target as HTMLInputElement).value;
        if (v) serie.dia = v;
      });
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
        <div class="lista">${sessao.map((x) => itemSessao(x, pm)).join("")}</div>
        ${sessao.length ? `<div class="acoes col"><button type="button" class="btn pri big" id="btn-comp">${icon("file", 22)}Gerar comprovante (PDF)</button><div class="nota" id="comp-nota" style="margin:0"></div></div>` : ""}
        <div class="acoes col"><a class="btn big" href="#/novo" id="outro">${icon("plus", 22)}Iniciar outro monitoramento</a><a class="btn big" href="#/historico">Ver histórico</a></div></section>`;
      el.querySelector("#outro")!.addEventListener("click", () => iniciarSessao());
      ligarExclusaoSessao(el, () => viewFim().render(el));
      el.querySelector("#btn-comp")?.addEventListener("click", async (ev) => {
        const b = ev.currentTarget as HTMLButtonElement;
        const nota = el.querySelector<HTMLElement>("#comp-nota")!;
        b.disabled = true;
        nota.textContent = "Gerando comprovante...";
        try {
          const [{ gerarComprovante }, { entregarArquivo }] = await Promise.all([import("../../export/comprovante"), import("../../export/arquivos")]);
          const atuais = sessao.map((s) => state.readings.find((r) => r.id === s.id && !r.deleted) ?? s);
          const out = await gerarComprovante({
            leituras: atuais,
            pontos: state.points,
            unidades: state.units,
            ix: state.index,
            responsavel: atuais.find((r) => r.resp)?.resp || state.user?.nome || "",
            pendentes: state.pending,
            modoLocal: state.mode === "local"
          });
          nota.textContent = `${await entregarArquivo(out.nome, out.blob)} Código ${out.codigo}.`;
        } catch (e) {
          nota.textContent = `Não foi possível gerar o comprovante (${(e as Error).message || "erro"}).`;
        } finally {
          b.disabled = false;
        }
      });
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
  let horaTocada = false;
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
    if (editando && primeira && !dhTocado && primeira.lastModified && Math.abs(Date.now() - primeira.lastModified) > 60000) q<HTMLInputElement>(el, "#f-dh").value = dtLocal(primeira.lastModified);
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
    let dh: string;
    if (editando) dh = q<HTMLInputElement>(el, "#f-dh").value;
    else {
      const dia = q<HTMLInputElement>(el, "#f-dia").value;
      // Hora não alterada à mão e dia de hoje: vale a hora do momento em que salva.
      const hora = !horaTocada && dia === dIso(Date.now()) ? horaAgora() : q<HTMLInputElement>(el, "#f-hora").value;
      dh = dia && hora ? `${dia}T${hora}` : "";
    }
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
        const i = sessao.findIndex((s) => s.id === r.id);
        if (i >= 0) sessao[i] = r;
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
          ${
            editando
              ? `<label for="f-dh">Data e hora da leitura</label><input type="datetime-local" id="f-dh" value="${dtLocal(editando.ts)}">`
              : `<div class="info" id="dia-box" style="display:flex;align-items:center;justify-content:space-between;gap:10px"><span>Dia do monitoramento: <b id="dia-txt">${dFmt(new Date(`${serie.dia ?? dIso(Date.now())}T12:00`).getTime())}</b></span><button type="button" class="btn sm" id="dia-alt">Alterar dia</button></div>
                 <input type="date" id="f-dia" value="${serie.dia ?? dIso(Date.now())}" hidden>
                 <label for="f-hora">Hora da leitura</label><input type="time" id="f-hora" value="${horaAgora()}">`
          }
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
          <div class="barra">
            <button type="button" class="btn pri big" id="btn-sn">${editando ? "Salvar alterações" : "Salvar e ir para o próximo ponto"}</button>
            ${editando ? "" : '<button type="button" class="btn" id="btn-sf">Salvar e finalizar</button>'}
            ${editando && isGestor() ? `<button type="button" class="btn big dang" id="btn-del">${icon("trash", 18)}Excluir leitura</button>` : ""}
          </div>
        </div>
        <details class="rec" ${window.matchMedia("(min-width: 860px)").matches ? "open" : ""}><summary><span class="fs-t">Últimas leituras</span><span class="fs-r" id="rec-sub"></span></summary><div class="lista" id="recentes"></div></details></div>`;
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
        if (t.closest("#dia-alt")) {
          const inp = q<HTMLInputElement>(el, "#f-dia");
          inp.hidden = !inp.hidden;
          return;
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
        else if (t.id === "f-hora") horaTocada = true;
        else if (t.id === "f-dia" && t.value) {
          serie.dia = t.value;
          const tx = el.querySelector<HTMLElement>("#dia-txt");
          if (tx) tx.textContent = dFmt(new Date(`${t.value}T12:00`).getTime());
        }
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
