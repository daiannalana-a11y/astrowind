import { BRAND } from "../../domain/config";
import { esc } from "../../domain/format";
import { getServerConfig, setServerConfig } from "../../data/remote";
import { recuperarComCodigo, resetPassword, signIn, state } from "../../data/store";
import { LOGO_SVG } from "../icons";

let mailGuardado = "";

export function viewLogin(root: HTMLElement, aoEntrar: () => void): void {
  const semServidor = !getServerConfig();
  root.innerHTML = `<div class="login"><form class="card" id="f-login" novalidate>
    <div class="logo">${LOGO_SVG}<div><h1>${esc(BRAND.app)}</h1><span class="sub">${esc(BRAND.org)}</span></div></div>
    ${
      semServidor
        ? `<div class="aviso">Este aplicativo ainda não está ligado a um servidor. Informe os dados do servidor para entrar.</div>
           <label for="l-url">Endereço do servidor</label><input type="url" id="l-url" placeholder="https://xxxx.supabase.co" autocomplete="off">
           <label for="l-key">Chave pública (anon key)</label><input type="text" id="l-key" autocomplete="off">`
        : `<label for="l-email">E-mail</label><input type="email" id="l-email" autocomplete="username" inputmode="email">
           <label for="l-senha">Senha</label><input type="password" id="l-senha" autocomplete="current-password">`
    }
    <div id="l-msg" role="alert"></div>
    <div class="acoes col"><button type="submit" class="btn pri big" id="l-ok">${semServidor ? "Conectar" : "Entrar"}</button>
    ${semServidor ? "" : '<button type="button" class="btn" id="l-reset">Esqueci a senha</button><button type="button" class="btn sm" id="l-srv" style="align-self:center">Trocar servidor</button>'}</div>
    <p class="nota" style="text-align:center">${state.online ? "" : "Sem conexão: é preciso internet para entrar pela primeira vez."}</p>
  </form></div>`;
  const msg = root.querySelector<HTMLElement>("#l-msg")!;
  const erro = (t: string) => (msg.innerHTML = `<div class="erro">${esc(t)}</div>`);
  const val = (id: string) => (root.querySelector<HTMLInputElement>("#" + id)?.value ?? "").trim();

  root.querySelector("#f-login")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.innerHTML = "";
    if (semServidor) {
      if (!/^https?:\/\//.test(val("l-url")) || !val("l-key")) return erro("Informe o endereço (começando com https://) e a chave.");
      setServerConfig({ url: val("l-url"), key: val("l-key") });
      location.reload();
      return;
    }
    if (!val("l-email") || !val("l-senha")) return erro("Informe e-mail e senha.");
    const b = root.querySelector<HTMLButtonElement>("#l-ok")!;
    b.disabled = true;
    b.textContent = "Entrando...";
    try {
      await signIn(val("l-email"), root.querySelector<HTMLInputElement>("#l-senha")!.value);
      aoEntrar();
    } catch (err) {
      erro((err as Error).message);
      b.disabled = false;
      b.textContent = "Entrar";
    }
  });
  root.querySelector("#l-reset")?.addEventListener("click", async () => {
    if (!val("l-email")) return erro("Digite seu e-mail e toque novamente em \"Esqueci a senha\".");
    mailGuardado = val("l-email");
    try {
      await resetPassword(val("l-email"));
      mostrarCodigo();
    } catch (err) {
      erro((err as Error).message);
    }
  });
  function mostrarCodigo(): void {
    const f = root.querySelector<HTMLElement>("#f-login")!;
    f.innerHTML = `<div class="logo">${LOGO_SVG}<div><h1>Nova senha</h1><span class="sub">${esc(val("l-email") || "")}</span></div></div>
      <div class="okmsg" style="margin-top:0">Enviamos um e-mail com um <b>código de 6 dígitos</b>. Digite o código e escolha a nova senha. Pode demorar alguns minutos; olhe também o spam.</div>
      <label for="r-cod">Código do e-mail</label><input type="text" id="r-cod" inputmode="numeric" autocomplete="one-time-code" maxlength="8">
      <label for="r-nova">Nova senha (mínimo 8 caracteres)</label><input type="password" id="r-nova" autocomplete="new-password">
      <div id="r-msg" role="alert"></div>
      <div class="acoes col"><button type="submit" class="btn pri big" id="r-ok">Salvar nova senha</button><button type="button" class="btn" id="r-voltar">Voltar</button></div>`;
    const email = (root.querySelector<HTMLInputElement>("#l-email")?.value ?? mailGuardado).trim();
    mailGuardado = email;
    f.onsubmit = async (e) => {
      e.preventDefault();
      const m = root.querySelector<HTMLElement>("#r-msg")!;
      const b = root.querySelector<HTMLButtonElement>("#r-ok")!;
      b.disabled = true;
      b.textContent = "Salvando...";
      try {
        await recuperarComCodigo(email, root.querySelector<HTMLInputElement>("#r-cod")!.value, root.querySelector<HTMLInputElement>("#r-nova")!.value);
        aoEntrar();
      } catch (err) {
        m.innerHTML = `<div class="erro">${esc((err as Error).message)}</div>`;
        b.disabled = false;
        b.textContent = "Salvar nova senha";
      }
    };
    root.querySelector("#r-voltar")!.addEventListener("click", () => viewLogin(root, aoEntrar));
  }
  root.querySelector("#l-srv")?.addEventListener("click", () => {
    if (window.confirm("Remover a configuração de servidor deste aparelho?")) {
      setServerConfig(null);
      location.reload();
    }
  });
}
