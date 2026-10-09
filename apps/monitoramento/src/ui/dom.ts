import { fotoUrl } from "../data/store";
import { icon } from "./icons";

export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

let toastT: number | undefined;
export function toast(msg: string): void {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastT);
  toastT = window.setTimeout(() => (t.hidden = true), 3800);
}

export function abrirFoto(src: string): void {
  const lb = $("lb");
  (lb.firstElementChild as HTMLImageElement).src = src;
  lb.hidden = false;
}

/** Miniaturas carregam de forma assíncrona: local primeiro, depois link assinado do servidor. */
export function miniFoto(path: string, cls = ""): string {
  return `<div class="th ${cls}" data-foto-box="${path}">${icon("image", 18)}</div>`;
}

export function hidratarFotos(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>("[data-foto-box]").forEach((box) => {
    if (box.dataset.ok) return;
    box.dataset.ok = "1";
    void fotoUrl(box.dataset.fotoBox!).then((u) => {
      if (!u) return;
      const img = document.createElement("img");
      img.src = u;
      img.alt = "Foto da leitura";
      img.dataset.zoom = u;
      img.loading = "lazy";
      box.innerHTML = "";
      box.appendChild(img);
    });
  });
}

export interface View {
  render(root: HTMLElement): void;
  /** Chamado quando os dados mudam. Se ausente, a tela é redesenhada. */
  onData?(root: HTMLElement): void;
  destroy?(): void;
}

export function confirmar(msg: string): boolean {
  return window.confirm(msg);
}
