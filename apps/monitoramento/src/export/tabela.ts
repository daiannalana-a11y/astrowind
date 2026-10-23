import * as XLSX from "xlsx";
import { GRUPOS } from "../domain/config";
import { calcResumo, type Index } from "../domain/calc";
import { dFmt, dtFmt } from "../domain/format";
import type { CampoKey, Point, Reading, Unit } from "../domain/types";

export interface Col {
  t: string;
  f: (r: Reading) => Date | string | number | null | undefined;
  tipo?: "d" | "n";
}

export interface ContextoExport {
  ix: Index;
  pontos: Point[];
  todosPontos: Point[];
  unidades: Unit[];
  leituras: Reading[];
  janela: { ini: number; fim: number };
  escopo: string;
  usuario: string;
}

export function colunas(c: ContextoExport): Col[] {
  const pm = new Map(c.todosPontos.map((p) => [p.id, p]));
  const um = new Map(c.unidades.map((u) => [u.id, u]));
  const d = (k: CampoKey) => (r: Reading) => c.ix.delta(r, k);
  return [
    { t: "Data e hora", f: (r) => new Date(r.ts), tipo: "d" },
    { t: "Unidade", f: (r) => um.get(r.unit_id)?.nome ?? "" },
    { t: "Categoria", f: (r) => { const p = pm.get(r.point_id); return p ? GRUPOS[p.grupo].rot : ""; } },
    { t: "Ponto", f: (r) => pm.get(r.point_id)?.nome ?? r.point_id },
    { t: "Nível d'água (m)", f: (r) => r.v.nivel, tipo: "n" },
    { t: "Hidrômetro (m³)", f: (r) => r.v.hid, tipo: "n" },
    { t: "Volume desde a anterior (m³)", f: d("hid"), tipo: "n" },
    { t: "Horímetro (h)", f: (r) => r.v.hor, tipo: "n" },
    { t: "Horas desde a anterior (h)", f: d("hor"), tipo: "n" },
    { t: "Horímetro 1 (h)", f: (r) => r.v.hor1, tipo: "n" },
    { t: "Horas 1 desde a anterior (h)", f: d("hor1"), tipo: "n" },
    { t: "Horímetro 2 (h)", f: (r) => r.v.hor2, tipo: "n" },
    { t: "Horas 2 desde a anterior (h)", f: d("hor2"), tipo: "n" },
    { t: "Responsável", f: (r) => r.resp },
    { t: "Observações", f: (r) => r.obs },
    { t: "Fotos", f: (r) => r.photos.length || "", tipo: "n" }
  ];
}

const SEMPRE = ["Unidade", "Categoria", "Ponto", "Responsável", "Observações"];

export function tabelaExport(c: ContextoExport) {
  const l = c.leituras.slice().sort((a, b) => a.ts - b.ts);
  const cols = colunas(c).filter((col) => col.tipo === "d" || SEMPRE.includes(col.t) || l.some((r) => { const x = col.f(r); return x !== "" && x != null; }));
  const linhas = l.map((r) => cols.map((col) => col.f(r) ?? ""));
  return { cols, linhas };
}

export function periodoTxt(w: { ini: number; fim: number }): string {
  return `${isFinite(w.ini) ? dFmt(w.ini) : "início"} a ${isFinite(w.fim) ? dFmt(w.fim) : "hoje"}`;
}

export function nomeArquivo(c: ContextoExport, ext: string): string {
  const iso = (n: number, d: string) => (isFinite(n) ? new Date(n).toISOString().slice(0, 10) : d);
  return `monitoramento_${iso(c.janela.ini, "inicio")}_a_${iso(c.janela.fim, "hoje")}.${ext}`;
}

export function gerarCsv(c: ContextoExport): Blob {
  const t = tabelaExport(c);
  const q = (x: unknown): string => {
    const s = x instanceof Date ? dtFmt(x.getTime()) : typeof x === "number" ? String(x).replace(".", ",") : String(x);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const txt = [t.cols.map((col) => q(col.t)).join(";"), ...t.linhas.map((l) => l.map(q).join(";"))].join("\r\n");
  return new Blob(["﻿" + txt], { type: "text/csv;charset=utf-8" });
}

export function gerarXlsx(c: ContextoExport): Blob {
  const t = tabelaExport(c);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([t.cols.map((col) => col.t), ...t.linhas], { cellDates: true });
  ws["!cols"] = t.cols.map((col) => ({ wch: col.tipo === "d" ? 17 : col.t === "Observações" ? 40 : Math.max(12, col.t.length + 2) }));
  const rng = XLSX.utils.decode_range(ws["!ref"]!);
  for (let R = 1; R <= rng.e.r; R++)
    for (let C = 0; C <= rng.e.c; C++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (!cell) continue;
      if (t.cols[C].tipo === "d") cell.z = "dd/mm/yyyy hh:mm";
      else if (cell.t === "n" && t.cols[C].t !== "Fotos") cell.z = "#,##0.00";
    }
  XLSX.utils.book_append_sheet(wb, ws, "Leituras");
  const res = calcResumo(c.ix, c.pontos, c.leituras);
  const ws2 = XLSX.utils.aoa_to_sheet(
    [
      ["Escopo", c.escopo],
      ["Período", periodoTxt(c.janela)],
      ["Emitido por", c.usuario],
      [],
      ["Ponto", "Medição", "Leituras", "Primeira data", "Última data", "Mínimo", "Máximo", "Último valor", "Consumo ou variação no período"],
      ...res.map((x) => [x.ponto, x.campo, x.n, new Date(x.prim), new Date(x.ult), x.min, x.max, x.uv, x.tot == null ? "" : x.tot])
    ],
    { cellDates: true }
  );
  ws2["!cols"] = [{ wch: 20 }, { wch: 24 }, { wch: 10 }, { wch: 17 }, { wch: 17 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Resumo");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
