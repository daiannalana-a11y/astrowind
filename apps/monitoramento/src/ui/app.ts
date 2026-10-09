import "./styles.css";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { calcAlertas } from "../domain/calc";
import { BRAND } from "../domain/config";
import { esc, dtFmt } from "../domain/format";
import { init, isAdmin, isGestor, leiturasVisiveis, pontosVisiveis, signOut, state, subscribe, sync, unidadesVisiveis } from "../data/store";
import { setServerConfig, getServerConfig } from "../data/remote";
import { $, abrirFoto, hidratarFotos, toast, type View } from "./dom";
import { F, iniciarFiltros } from "./filtros";
import { icon, LOGO_SVG } from "./icons";
import { viewLogin } from "./views/login";
import { viewHome } from "./views/home";
import { viewRegistro, viewNovo, viewFim } from "./views/registro";
import { viewDashboard } from "./views/dashboard";
import { viewHistorico } from "./views/historico";
import { viewAlertas } from "./views/alertas";
import { viewCadastro } from "./views/cadastro";

interface Rota {
  nome: string;
  args: string[];
}

function rota(): Rota {
  const h = (location.hash || "#/").replace(/^#\/?/, "");
  const [nome, ...args] = h.split("/").filter(Boolean);
  return { nome: nome || "home", args };
}

export function ir(caminho: string): void {
  location.hash = "#/" + caminho.replace(/^\//, "");
}

const NAV = [
  { id: "home", rot: "Início", ic: "home", sempre: true },
  { id: "dashboard", rot: "Dashboard", ic: "chart", sempre: true },
  { id: "historico", rot: "Histórico", ic: "list", sempre: true },
  { id: "alertas", rot: "Alertas", ic: "bell", sempre: true },
  { id: "cadastro", rot: "Cadastro", ic: "settings", sempre: false }
];

let atual: View | null = null;
let atualNome = "";
let shellMontado = false;

function secaoDe(nome: string): string {
  if (["novo", "registro", "editar", "fim"].includes(nome)) return "home";
  return nome;
}

function alertasAtivos() {
  return calcAlertas(state.index, pontosVisiveis());
}

function navHtml(): string {
  const sec = secaoDe(rota().nome);
  const n = alertasAtivos().filter((a) => a.level !== "info").length;
  return NAV.filter((i) => i.sempre || isGestor())
    .map(
      (i) =>
        `<a class="nav" href="#/${i.id === "home" ? "" : i.id}" ${sec === i.id ? 'aria-current="page"' : ""}>${icon(i.ic, 22)}<span>${i.rot}</span>${i.id === "alertas" && n ? `<span class="badge">${n}</span>` : ""}</a>`
    )
    .join("");
}

function statusHtml(): string {
  if (state.mode === "local") return `<span class="chipst warn" title="Os dados ficam só neste aparelho">${icon("cloudOff", 14)}Modo local</span>`;
  if (!state.online) return `<button class="chipst warn" data-sync>${icon("cloudOff", 14)}Offline${state.pending ? ` · ${state.pending} pendente${state.pending > 1 ? "s" : ""}` : ""}</button>`;
  if (state.syncing) return `<span class="chipst">${icon("refresh", 14, "spin")}Sincronizando</span>`;
  if (state.syncError || state.failed) return `<button class="chipst bad" data-sync title="${esc(state.syncError ?? "")}">${icon("alert", 14)}Erro de envio</button>`;
  if (state.pending) return `<button class="chipst warn" data-sync>${icon("cloud", 14)}${state.pending} a enviar</button>`;
  return `<button class="chipst" data-sync title="${state.lastSync ? "Atualizado em " + dtFmt(state.lastSync) : ""}">${icon("cloud", 14)}Sincronizado</button>`;
}

function montarShell(): void {
  const un = unidadesVisiveis();
  document.getElementById("app")!.innerHTML = `
    <div class="app">
      <aside class="rail">
        <div class="brand">${LOGO_SVG}<div><b>${esc(BRAND.app)}</b><span>${esc(BRAND.org)}</span></div></div>
        <div id="rail-nav" style="display:contents"></div>
        <div class="foot"><button class="nav" style="width:100%" id="btn-menu-r">${icon("user", 22)}<span id="rail-user"></span></button></div>
      </aside>
      <div>
        <header class="top">
          <div class="brand-m"><span class="logo">${LOGO_SVG.replace('width="40" height="40"', 'width="30" height="30"')}</span><b>${esc(BRAND.app)}</b></div>
          <select id="un-global" aria-label="Unidade" ${un.length > 1 ? "" : "hidden"}></select>
          <span id="status"></span>
          <button class="iconbtn" id="btn-menu" aria-label="Menu">${icon("user", 20)}</button>
        </header>
        <main id="view"></main>
      </div>
      <nav class="bottom" id="bottom-nav" aria-label="Seções"></nav>
    </div>
    <dialog id="dlg-menu"></dialog>`;
  shellMontado = true;
}

function atualizarShell(): void {
  if (!shellMontado) return;
  $("rail-nav").innerHTML = navHtml();
  $("bottom-nav").innerHTML = navHtml();
  $("status").innerHTML = statusHtml();
  $("rail-user").textContent = state.user?.nome || "Conta";
  const sel = $<HTMLSelectElement>("un-global");
  const un = unidadesVisiveis();
  sel.hidden = un.length <= 1;
  sel.innerHTML = '<option value="">Todas as unidades</option>' + un.map((u) => `<option value="${esc(u.id)}" ${F.un === u.id ? "selected" : ""}>${esc(u.nome)}</option>`).join("");
}

function abrirMenu(): void {
  const dlg = $<HTMLDialogElement>("dlg-menu");
  const tema = document.documentElement.dataset.theme ?? "auto";
  const cfg = getServerConfig();
  const papel = { campo: "Operador de campo", gestor: "Gestor", admin: "Administrador" }[state.user?.role ?? "campo"];
  dlg.innerHTML = `<div class="dlg">
    <h2>${esc(state.user?.nome || "Conta")}</h2>
    <p class="sub" style="margin:0 0 12px">${esc(papel)}${state.user?.email ? " · " + esc(state.user.email) : ""}</p>
    <div class="lbl">Aparência</div>
    <div class="seg" role="group" aria-label="Tema">
      <button data-tema="auto" aria-pressed="${tema === "auto"}">Automático</button>
      <button data-tema="light" aria-pressed="${tema === "light"}">Claro</button>
      <button data-tema="dark" aria-pressed="${tema === "dark"}">Escuro</button>
    </div>
    <div style="margin-top:14px">
      ${state.mode === "server" ? `<button class="menu-row" data-sync>${icon("refresh", 20)}<span>Sincronizar agora<br><span class="sub">${state.lastSync ? "Última: " + dtFmt(state.lastSync) : "Ainda não sincronizado"}${state.pending ? " · " + state.pending + " pendente(s)" : ""}</span></span></button>` : ""}
      ${state.mode === "local" ? `<button class="menu-row" data-servidor>${icon("server", 20)}<span>Conectar a um servidor<br><span class="sub">Sincronize e use vários aparelhos</span></span></button>` : `<div class="menu-row" style="cursor:default">${icon("server", 20)}<span class="sub">${esc(cfg?.url ?? "")}</span></div>`}
      ${state.mode === "server" ? `<button class="menu-row" data-sair>${icon("logout", 20)}<span>Sair</span></button>` : ""}
    </div>
    <div class="acoes"><button class="btn" data-fechar style="margin-left:auto">Fechar</button></div>
  </div>`;
  dlg.showModal();
}

function aplicarTema(t: string): void {
  if (t === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  try {
    if (t === "auto") localStorage.removeItem("mon-tema");
    else localStorage.setItem("mon-tema", t);
  } catch {
    /* ignora */
  }
  if (atual && atualNome === "dashboard") atual.onData?.($("view"));
}

function criarView(r: Rota): View {
  switch (r.nome) {
    case "novo":
      return viewNovo();
    case "registro":
      return viewRegistro({ pontoId: r.args[0] ?? "", editarId: null });
    case "editar":
      return viewRegistro({ pontoId: "", editarId: r.args[0] ?? "" });
    case "fim":
      return viewFim();
    case "dashboard":
      return viewDashboard();
    case "historico":
      return viewHistorico();
    case "alertas":
      return viewAlertas();
    case "cadastro":
      return viewCadastro(r.args[0] ?? "pontos");
    default:
      return viewHome();
  }
}

function navegar(): void {
  if (!state.ready) return;
  if (!state.user) {
    shellMontado = false;
    atual?.destroy?.();
    atual = null;
    viewLogin(document.getElementById("app")!, () => {
      location.hash = "#/";
      render();
    });
    return;
  }
  if (!shellMontado) montarShell();
  const r = rota();
  if (r.nome === "cadastro" && !isGestor()) return ir("");
  atual?.destroy?.();
  atualNome = r.nome;
  atual = criarView(r);
  const fresh = document.createElement("main");
  fresh.id = "view";
  $("view").replaceWith(fresh);
  const root = fresh;
  atual.render(root);
  hidratarFotos(root);
  atualizarShell();
  window.scrollTo(0, 0);
}

function render(): void {
  navegar();
}

function aoMudarDados(): void {
  if (!state.ready) return;
  if (!state.user) {
    if (shellMontado) navegar();
    return;
  }
  atualizarShell();
  if (!atual) return;
  const root = $("view");
  if (atual.onData) atual.onData(root);
  else atual.render(root);
  hidratarFotos(root);
}

function eventos(): void {
  document.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    let el: HTMLElement | null;
    if ((el = t.closest("[data-zoom]"))) return abrirFoto(el.dataset.zoom!);
    if (t.closest("#lb")) {
      $("lb").hidden = true;
      return;
    }
    if (t.closest("#btn-menu") || t.closest("#btn-menu-r")) return abrirMenu();
    if (t.closest("[data-fechar]")) return $<HTMLDialogElement>("dlg-menu").close();
    if ((el = t.closest("[data-tema]"))) {
      aplicarTema(el.dataset.tema!);
      return abrirMenu();
    }
    if (t.closest("[data-sync]")) {
      void sync().then(() => toast(state.syncError ? state.syncError : "Sincronizado."));
      return;
    }
    if (t.closest("[data-sair]")) {
      if (state.pending && !window.confirm(`Há ${state.pending} item(ns) ainda não enviado(s). Sair agora apaga esses dados deste aparelho. Continuar?`)) return;
      $<HTMLDialogElement>("dlg-menu").close();
      void signOut().then(() => {
        shellMontado = false;
        render();
      });
      return;
    }
    if (t.closest("[data-servidor]")) {
      const url = window.prompt("Endereço do servidor (URL do projeto Supabase):", "https://");
      if (!url) return;
      const key = window.prompt("Chave pública (anon key):", "");
      if (!key) return;
      setServerConfig({ url: url.trim(), key: key.trim() });
      location.reload();
    }
  });
  document.addEventListener("change", (e) => {
    const t = e.target as HTMLElement;
    if (t.id === "un-global") {
      F.un = (t as HTMLSelectElement).value;
      F.pt = "";
      navegar();
    }
  });
  window.addEventListener("hashchange", navegar);
  subscribe(aoMudarDados);
}

export async function iniciarApp(): Promise<void> {
  try {
    const t = localStorage.getItem("mon-tema");
    if (t) document.documentElement.dataset.theme = t;
  } catch {
    /* ignora */
  }
  iniciarFiltros();
  document.getElementById("app")!.innerHTML = `<div class="splash">${icon("refresh", 28, "spin")}</div>`;
  eventos();
  if (Capacitor.isNativePlatform()) {
    void StatusBar.setStyle({ style: Style.Default }).catch(() => undefined);
    void CapApp.addListener("backButton", ({ canGoBack }) => {
      if (rota().nome !== "home") history.back();
      else if (!canGoBack) void CapApp.exitApp();
    });
  }
  await init();
  navegar();
  // Resumo para diagnóstico rápido no console.
  console.info(`[${BRAND.app}] ${pontosVisiveis().length} pontos, ${leiturasVisiveis().length} leituras, modo ${state.mode}${isAdmin() ? ", admin" : ""}`);
}
