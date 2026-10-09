import { DIAS_SEM_LEITURA_PADRAO, GRUPOS, GRUPO_KEYS } from "../../domain/config";
import { dtFmt, esc, fmtIn, parseNum } from "../../domain/format";
import type { AuditEntry, Grupo, Limites, Point, Profile, Role, Unit } from "../../domain/types";
import { atualizarPerfil, descartarFalhas, isAdmin, listarAuditoria, listarPerfis, novoIdPonto, novoIdUnidade, salvarPonto, salvarUnidade, state } from "../../data/store";
import { icon } from "../icons";
import { toast, type View } from "../dom";

type Aba = "pontos" | "unidades" | "usuarios" | "auditoria";

export function viewCadastro(abaInicial: string): View {
  let aba: Aba = (["pontos", "unidades", "usuarios", "auditoria"].includes(abaInicial) ? abaInicial : "pontos") as Aba;
  let el!: HTMLElement;
  let perfis: Profile[] | null = null;
  let auditoria: AuditEntry[] | null = null;
  let erroRemoto = "";

  const abas = (): { id: Aba; rot: string }[] => {
    const l: { id: Aba; rot: string }[] = [{ id: "pontos", rot: "Pontos" }];
    if (isAdmin()) l.push({ id: "unidades", rot: "Unidades" });
    if (state.mode === "server") {
      if (isAdmin()) l.push({ id: "usuarios", rot: "Usuários" });
      l.push({ id: "auditoria", rot: "Auditoria" });
    }
    return l;
  };

  /* ---------------- pontos ---------------- */
  function pontosHtml(): string {
    const un = state.units.filter((u) => isAdmin() || state.user?.unit_ids.includes(u.id) || state.mode === "local");
    const base = `<div class="acoes" style="margin:0 0 12px"><button class="btn pri" data-novo-ponto>${icon("plus", 18)}Novo ponto</button></div>`;
    return (
      base +
      un
        .map((u) => {
          const pts = state.points.filter((p) => p.unit_id === u.id).sort((a, b) => a.ordem - b.ordem);
          return `<div class="gtit">${esc(u.nome)}</div><div class="lista">${
            pts.length
              ? pts
                  .map(
                    (p) => `<div class="item"><div class="l1"><span>${esc(p.nome)} ${p.inativo ? '<span class="chip">Fora de operação</span>' : ""}</span><span>${esc(GRUPOS[p.grupo].rot)}</span></div>
                    <div class="meta">${esc(p.info) || "Sem descrição"}</div>
                    <div class="meta">${limitesTxt(p.limites) || "Sem limites de alerta (padrão: " + DIAS_SEM_LEITURA_PADRAO + " dias sem leitura)"}</div>
                    <div class="ac"><button class="btn sm" data-edit-ponto="${esc(p.id)}">${icon("edit", 14)}Editar</button></div></div>`
                  )
                  .join("")
              : '<div class="vazio">Nenhum ponto nesta unidade.</div>'
          }</div>`;
        })
        .join("")
    );
  }

  function limitesTxt(l: Limites): string {
    const p: string[] = [];
    if (l.nivelMax != null) p.push(`nível ≤ ${l.nivelMax} m`);
    if (l.nivelMin != null) p.push(`nível ≥ ${l.nivelMin} m`);
    if (l.volumeDiaMax != null) p.push(`≤ ${l.volumeDiaMax} m³/dia`);
    if (l.horasDiaMax != null) p.push(`≤ ${l.horasDiaMax} h/dia`);
    if (l.diasSemLeitura != null) p.push(`alerta após ${l.diasSemLeitura} dias sem leitura`);
    return p.length ? "Limites: " + p.join(" · ") : "";
  }

  function abrirPonto(id: string | null): void {
    const dlg = el.querySelector<HTMLDialogElement>("#dlg-cad")!;
    const ex = id ? state.points.find((p) => p.id === id) : undefined;
    const unidades = state.units.filter((u) => isAdmin() || state.user?.unit_ids.includes(u.id) || state.mode === "local");
    const g: Grupo = ex?.grupo ?? "pz";
    const l = ex?.limites ?? {};
    const num = (v: number | undefined) => (v == null ? "" : fmtIn(v));
    dlg.innerHTML = `<form class="dlg" method="dialog" id="f-ponto" novalidate>
      <h2>${ex ? "Editar ponto" : "Novo ponto"}</h2>
      <label for="p-nome">Nome</label><input type="text" id="p-nome" value="${esc(ex?.nome ?? "")}">
      <label for="p-un">Unidade</label><select id="p-un" ${ex ? "disabled" : ""}>${unidades.map((u) => `<option value="${esc(u.id)}" ${u.id === (ex?.unit_id ?? unidades[0]?.id) ? "selected" : ""}>${esc(u.nome)}</option>`).join("")}</select>
      <label for="p-g">Categoria</label><select id="p-g" ${ex ? "disabled" : ""}>${GRUPO_KEYS.map((k) => `<option value="${k}" ${k === g ? "selected" : ""}>${esc(GRUPOS[k].rot)}</option>`).join("")}</select>
      <label for="p-info">Descrição / observações do ponto</label><textarea id="p-info">${esc(ex?.info ?? "")}</textarea>
      <label for="p-prof">Profundidade do ponto (m), se piezômetro</label><input type="text" id="p-prof" inputmode="decimal" value="${num(ex?.prof ?? undefined)}">
      <div class="lbl" style="margin-top:16px">Limites para alertas (opcional)</div>
      <div class="campos">
        <div><label for="l-nmax">Nível máximo (m)</label><input type="text" id="l-nmax" inputmode="decimal" value="${num(l.nivelMax)}"></div>
        <div><label for="l-nmin">Nível mínimo (m)</label><input type="text" id="l-nmin" inputmode="decimal" value="${num(l.nivelMin)}"></div>
        <div><label for="l-vol">Volume máx. (m³/dia)</label><input type="text" id="l-vol" inputmode="decimal" value="${num(l.volumeDiaMax)}"></div>
        <div><label for="l-hor">Horas máx. (h/dia)</label><input type="text" id="l-hor" inputmode="decimal" value="${num(l.horasDiaMax)}"></div>
        <div><label for="l-dias">Dias sem leitura</label><input type="text" id="l-dias" inputmode="numeric" placeholder="${DIAS_SEM_LEITURA_PADRAO}" value="${num(l.diasSemLeitura)}"></div>
        <div><label for="p-ordem">Ordem na lista</label><input type="text" id="p-ordem" inputmode="numeric" value="${ex?.ordem ?? state.points.length + 1}"></div>
      </div>
      <div class="checks" style="margin-top:14px"><label><input type="checkbox" id="p-off" ${ex?.inativo ? "checked" : ""}>Fora de operação</label></div>
      <div id="p-msg"></div>
      <div class="acoes"><button type="button" class="btn" data-cancelar>Cancelar</button><button type="submit" class="btn pri" style="margin-left:auto">Salvar</button></div></form>`;
    dlg.showModal();
    const val = (i: string) => dlg.querySelector<HTMLInputElement>("#" + i)!.value.trim();
    dlg.querySelector("[data-cancelar]")!.addEventListener("click", () => dlg.close());
    dlg.querySelector("form")!.addEventListener("submit", (e) => {
      e.preventDefault();
      const msg = dlg.querySelector<HTMLElement>("#p-msg")!;
      const n = (i: string): number | null | undefined => {
        const s = val(i);
        if (!s) return undefined;
        const x = parseNum(s);
        return x == null || isNaN(x) ? null : x;
      };
      const campos = ["l-nmax", "l-nmin", "l-vol", "l-hor", "l-dias", "p-prof", "p-ordem"];
      if (!val("p-nome")) return void (msg.innerHTML = '<div class="erro">Informe o nome do ponto.</div>');
      if (campos.some((c) => n(c) === null)) return void (msg.innerHTML = '<div class="erro">Use apenas números nos campos de limite, profundidade e ordem.</div>');
      const limites: Limites = {};
      const set = <K extends keyof Limites>(k: K, i: string) => {
        const v = n(i);
        if (v != null) limites[k] = v as Limites[K];
      };
      set("nivelMax", "l-nmax"); set("nivelMin", "l-nmin"); set("volumeDiaMax", "l-vol"); set("horasDiaMax", "l-hor"); set("diasSemLeitura", "l-dias");
      const unit = dlg.querySelector<HTMLSelectElement>("#p-un")!.value;
      const grupo = dlg.querySelector<HTMLSelectElement>("#p-g")!.value as Grupo;
      const p: Point = {
        id: ex?.id ?? novoIdPonto(unit, val("p-nome")),
        unit_id: ex?.unit_id ?? unit,
        grupo: ex?.grupo ?? grupo,
        nome: val("p-nome"),
        info: dlg.querySelector<HTMLTextAreaElement>("#p-info")!.value.trim(),
        prof: n("p-prof") ?? null,
        inativo: dlg.querySelector<HTMLInputElement>("#p-off")!.checked,
        limites,
        ordem: n("p-ordem") ?? 0,
        updated_at: 0
      };
      void salvarPonto(p).then(() => {
        dlg.close();
        toast("Ponto salvo.");
        draw();
      });
    });
  }

  /* ---------------- unidades ---------------- */
  function unidadesHtml(): string {
    return `<div class="acoes" style="margin:0 0 12px"><button class="btn pri" data-nova-un>${icon("plus", 18)}Nova unidade</button></div><div class="lista">${state.units
      .map(
        (u) => `<div class="item"><div class="l1"><span>${esc(u.nome)} ${u.ativo ? "" : '<span class="chip">Inativa</span>'}</span><span>${esc(u.id)}</span></div>
        <div class="meta">${state.points.filter((p) => p.unit_id === u.id).length} pontos</div>
        <div class="ac"><button class="btn sm" data-ren-un="${esc(u.id)}">${icon("edit", 14)}Renomear</button><button class="btn sm" data-tog-un="${esc(u.id)}">${u.ativo ? "Desativar" : "Reativar"}</button></div></div>`
      )
      .join("")}</div>`;
  }

  /* ---------------- usuários ---------------- */
  function usuariosHtml(): string {
    if (erroRemoto) return `<div class="erro">${esc(erroRemoto)}</div>`;
    if (!perfis) return '<div class="vazio">Carregando usuários...</div>';
    return `<p class="nota" style="margin-top:0">Crie novos usuários em <b>Authentication → Users</b> no painel do Supabase. Eles aparecem aqui e recebem o papel “Operador de campo” até você alterar. O primeiro usuário criado é administrador.</p>
      <div class="lista">${perfis
        .map(
          (p) => `<div class="item" data-perfil="${esc(p.id)}"><div class="l1"><span>${esc(p.nome || p.email)}</span><span>${esc(p.email)}</span></div>
          <div class="campos"><div><label>Nome</label><input type="text" data-f="nome" value="${esc(p.nome)}"></div>
          <div><label>Papel</label><select data-f="role">${(["campo", "gestor", "admin"] as Role[]).map((r) => `<option value="${r}" ${p.role === r ? "selected" : ""}>${{ campo: "Operador de campo", gestor: "Gestor", admin: "Administrador" }[r]}</option>`).join("")}</select></div></div>
          <div class="lbl">Unidades com acesso ${p.role === "admin" ? "(administrador acessa todas)" : ""}</div>
          <div class="checks">${state.units.map((u) => `<label><input type="checkbox" data-un="${esc(u.id)}" ${p.unit_ids.includes(u.id) ? "checked" : ""}>${esc(u.nome)}</label>`).join("")}</div>
          <div class="ac"><button class="btn sm pri" data-salvar-perfil="${esc(p.id)}">Salvar</button></div></div>`
        )
        .join("")}</div>`;
  }

  /* ---------------- auditoria ---------------- */
  function resumoAud(a: AuditEntry): string {
    const dado = (a.after ?? a.before) as Record<string, unknown> | null;
    if (!dado) return a.row_id;
    if (a.table_name === "readings") {
      const p = state.points.find((x) => x.id === dado.point_id);
      const v = dado.v as Record<string, number> | undefined;
      return `${p?.nome ?? dado.point_id}${v ? " · " + Object.entries(v).map(([k, n]) => `${k}=${n}`).join(", ") : ""}`;
    }
    return String(dado.nome ?? a.row_id);
  }
  function auditoriaHtml(): string {
    if (erroRemoto) return `<div class="erro">${esc(erroRemoto)}</div>`;
    if (!auditoria) return '<div class="vazio">Carregando auditoria...</div>';
    const alvo = { readings: "Leitura", points: "Ponto", units: "Unidade" } as Record<string, string>;
    return `<div class="tbl"><table><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Item</th><th>Detalhe</th></tr></thead><tbody>${auditoria
      .map((a) => `<tr><td>${dtFmt(a.ts)}</td><td>${esc(a.user_nome)}</td><td>${esc(a.action)}</td><td>${esc(alvo[a.table_name] ?? a.table_name)}</td><td>${esc(resumoAud(a))}</td></tr>`)
      .join("")}</tbody></table></div><p class="nota">Últimos ${auditoria.length} registros. A trilha é gravada pelo servidor e não pode ser alterada pelo aplicativo.</p>`;
  }

  function carregar(): void {
    erroRemoto = "";
    if (aba === "usuarios" && !perfis) listarPerfis().then((p) => { perfis = p; draw(); }).catch((e: Error) => { erroRemoto = e.message; draw(); });
    if (aba === "auditoria" && !auditoria) listarAuditoria().then((a) => { auditoria = a; draw(); }).catch((e: Error) => { erroRemoto = e.message; draw(); });
  }

  function draw(): void {
    const ab = abas();
    if (!ab.some((a) => a.id === aba)) aba = "pontos";
    const corpo = aba === "pontos" ? pontosHtml() : aba === "unidades" ? unidadesHtml() : aba === "usuarios" ? usuariosHtml() : auditoriaHtml();
    el.querySelector("#cad-corpo")!.innerHTML = corpo;
    el.querySelector("#cad-abas")!.innerHTML = ab.map((a) => `<button aria-pressed="${a.id === aba}" data-aba="${a.id}">${a.rot}</button>`).join("");
    const falhas = el.querySelector<HTMLElement>("#cad-falhas")!;
    falhas.hidden = !state.failed;
    falhas.innerHTML = state.failed ? `<div class="erro">${state.failed} item(ns) não puderam ser enviados ao servidor. <button class="btn sm" data-descartar>Descartar</button></div>` : "";
  }

  return {
    render(root) {
      el = root;
      el.innerHTML = `<div class="pagehead"><div><h1>Cadastro</h1><span class="sub">Pontos, limites de alerta, unidades e acessos</span></div><div class="seg" id="cad-abas"></div></div>
        <div id="cad-falhas"></div><div id="cad-corpo"></div><dialog id="dlg-cad"></dialog>`;
      el.addEventListener("click", (e) => {
        const t = e.target as HTMLElement;
        let b: HTMLElement | null;
        if ((b = t.closest("[data-aba]"))) {
          aba = b.dataset.aba as Aba;
          history.replaceState(null, "", "#/cadastro/" + aba);
          draw();
          return carregar();
        }
        if (t.closest("[data-novo-ponto]")) return abrirPonto(null);
        if ((b = t.closest("[data-edit-ponto]"))) return abrirPonto(b.dataset.editPonto!);
        if (t.closest("[data-descartar]")) return void descartarFalhas().then(draw);
        if (t.closest("[data-nova-un]")) {
          const nome = window.prompt("Nome da nova unidade:");
          if (nome?.trim()) void salvarUnidade({ id: novoIdUnidade(nome), nome: nome.trim(), ativo: true, updated_at: 0 }).then(draw);
          return;
        }
        if ((b = t.closest("[data-ren-un]"))) {
          const u = state.units.find((x) => x.id === b!.dataset.renUn) as Unit;
          const nome = window.prompt("Novo nome da unidade:", u.nome);
          if (nome?.trim()) void salvarUnidade({ ...u, nome: nome.trim() }).then(draw);
          return;
        }
        if ((b = t.closest("[data-tog-un]"))) {
          const u = state.units.find((x) => x.id === b!.dataset.togUn) as Unit;
          void salvarUnidade({ ...u, ativo: !u.ativo }).then(draw);
          return;
        }
        if ((b = t.closest("[data-salvar-perfil]"))) {
          const card = b.closest<HTMLElement>("[data-perfil]")!;
          const antigo = perfis!.find((p) => p.id === b!.dataset.salvarPerfil)!;
          const novo: Profile = {
            ...antigo,
            nome: card.querySelector<HTMLInputElement>('[data-f="nome"]')!.value.trim(),
            role: card.querySelector<HTMLSelectElement>('[data-f="role"]')!.value as Role,
            unit_ids: Array.from(card.querySelectorAll<HTMLInputElement>("[data-un]:checked")).map((c) => c.dataset.un!)
          };
          atualizarPerfil(novo).then(() => { Object.assign(antigo, novo); toast("Usuário atualizado."); draw(); }).catch((err: Error) => toast("Não foi possível salvar: " + err.message));
        }
      });
      draw();
      carregar();
    },
    onData: () => draw()
  };
}
