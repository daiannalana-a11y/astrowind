import { BarController, BarElement, CategoryScale, Chart, Filler, Legend, LinearScale, LineController, LineElement, PieController, PointElement, ArcElement, Tooltip, type ChartConfiguration } from "chart.js";
import { CAMPOS } from "../domain/config";
import { dtFmt, fmt, pad } from "../domain/format";
import type { CampoKey } from "../domain/types";

Chart.register(BarController, BarElement, CategoryScale, Filler, Legend, LinearScale, LineController, LineElement, PieController, PointElement, ArcElement, Tooltip);

export const PAST = [
  { f: "#9fd3e3", s: "#4f9db5" }, { f: "#f6c9a8", s: "#d98d56" }, { f: "#cdbdee", s: "#8f78c9" }, { f: "#b7e0c4", s: "#58a674" },
  { f: "#f3bcd0", s: "#cf6f92" }, { f: "#ebe0a0", s: "#b8a43e" }, { f: "#b3caf2", s: "#6a92d6" }, { f: "#ccd3d7", s: "#8c9aa1" }
];

export function cor(n: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
}

export interface Cores {
  ink: string;
  grid: string;
  resp: boolean;
  fundo: boolean;
}
export const coresTela = (): Cores => ({ ink: cor("--muted"), grid: cor("--line"), resp: true, fundo: false });
export const coresPdf: Cores = { ink: "#33464d", grid: "#d5dfe2", resp: false, fundo: true };

export interface Serie {
  nome: string;
  pts: { x: number; y: number }[];
}

export function tickData(v: number | string, umDia: boolean): string {
  const d = new Date(Number(v));
  return umDia ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

export function linhas(campo: CampoKey, modo: "v" | "d", cores: Cores, series: Serie[], w: { ini: number; fim: number }): ChartConfiguration {
  const umDia = isFinite(w.ini) && isFinite(w.fim) && w.fim - w.ini < 2 * 86400000;
  const un = CAMPOS[campo].un;
  return {
    type: "line",
    data: {
      datasets: series.map((s, i) => ({
        label: s.nome,
        data: s.pts,
        borderColor: PAST[i % PAST.length].s,
        backgroundColor: PAST[i % PAST.length].f,
        pointBackgroundColor: PAST[i % PAST.length].f,
        pointBorderColor: PAST[i % PAST.length].s,
        pointRadius: 4.5,
        pointHoverRadius: 7,
        borderWidth: 2.5,
        tension: 0.15
      }))
    },
    options: {
      responsive: cores.resp,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      interaction: { mode: "nearest", intersect: false },
      scales: {
        x: { type: "linear", ticks: { color: cores.ink, maxTicksLimit: 7, callback: (v) => tickData(v, umDia) }, grid: { color: cores.grid } },
        y: { reverse: campo === "nivel", beginAtZero: modo === "d", ticks: { color: cores.ink }, grid: { color: cores.grid }, title: { display: true, text: un, color: cores.ink } }
      },
      plugins: {
        legend: { labels: { color: cores.ink } },
        tooltip: { callbacks: { title: (it) => dtFmt(it[0].parsed.x as number), label: (it) => `${it.dataset.label}: ${fmt(it.parsed.y as number)} ${un}` } }
      }
    },
    plugins: cores.fundo ? [{ id: "fundo", beforeDraw: (c) => { const x = c.ctx; x.save(); x.fillStyle = "#ffffff"; x.fillRect(0, 0, c.width, c.height); x.restore(); } }] : []
  };
}

/** Desenha um gráfico fora da tela e devolve PNG, para uso nos relatórios. */
export function paraImagem(cfg: ChartConfiguration, largura = 1100, altura = 340): string {
  const cv = document.createElement("canvas");
  cv.width = largura;
  cv.height = altura;
  const ch = new Chart(cv.getContext("2d")!, cfg);
  ch.resize(largura, altura);
  ch.update("none");
  const url = cv.toDataURL("image/jpeg", 0.92);
  ch.destroy();
  return url;
}

export { Chart };
