import { BRAND } from "../../domain/config";
import { esc } from "../../domain/format";
import { getServerConfig, setServerConfig } from "../../data/remote";
import { resetPassword, signIn, state } from "../../data/store";
import { LOGO_SVG } from "../icons";

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
    try {
      await resetPassword(val("l-email"));
      msg.innerHTML = '<div class="okmsg">Enviamos um link para redefinir a senha, se o e-mail estiver cadastrado.</div>';
    } catch (err) {
      erro((err as Error).message);
    }
  });
  root.querySelector("#l-srv")?.addEventListener("click", () => {
    if (window.confirm("Remover a configuração de servidor deste aparelho?")) {
      setServerConfig(null);
      location.reload();
    }
  });
}
