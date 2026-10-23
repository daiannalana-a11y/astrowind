import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { BRAND, GRUPOS } from "../domain/config";
import { calcAlertas, calcResumo, somaDeltas } from "../domain/calc";
import { dFmt, dtFmt, fmt } from "../domain/format";
import type { CampoKey } from "../domain/types";
import { linhas, paraImagem, type Serie } from "../ui/charts";
import { periodoTxt, tabelaExport, type ContextoExport } from "./tabela";

interface Grafico {
  titulo: string;
  campo: CampoKey;
  modo: "v" | "d";
  series: Serie[];
}

function seriesDe(c: ContextoExport, campo: CampoKey, modo: "v" | "d"): Serie[] {
  const out: Serie[] = [];
  for (const p of c.pontos) {
    if (!GRUPOS[p.grupo].campos.includes(campo)) continue;
    const pts = c.leituras
      .filter((r) => r.point_id === p.id && r.v[campo] != null)
      .sort((a, b) => a.ts - b.ts)
      .map((r) => ({ x: r.ts, y: modo === "d" ? c.ix.delta(r, campo) : (r.v[campo] as number) }))
      .filter((q): q is { x: number; y: number } => q.y != null);
    if (pts.length) out.push({ nome: p.nome, pts });
  }
  return out;
}

function graficos(c: ContextoExport): Grafico[] {
  const campos = new Set<CampoKey>();
  c.pontos.forEach((p) => GRUPOS[p.grupo].campos.forEach((k) => campos.add(k)));
  const out: Grafico[] = [];
  const add = (campo: CampoKey, modo: "v" | "d", titulo: string) => {
    if (!campos.has(campo)) return;
    const series = seriesDe(c, campo, modo);
    if (series.length) out.push({ titulo, campo, modo, series });
  };
  add("nivel", "v", "Nível d'água por piezômetro (m de profundidade)");
  add("hid", "d", "Volume entre leituras por hidrômetro (m³)");
  add("hor", "d", "Horas de funcionamento entre leituras, poços e cava (h)");
  add("hor1", "d", "ETE: horas do horímetro 1 entre leituras (h)");
  add("hor2", "d", "ETE: horas do horímetro 2 entre leituras (h)");
  return out;
}

/** Relatório técnico: capa com resumo, alertas, gráficos, resumo por ponto, leituras e assinatura. */
export function gerarPdf(c: ContextoExport, limiteLinhas = 1500): Blob {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const cor = BRAND.pdfRgb;
  const tema = { fillColor: cor, textColor: 255, fontStyle: "bold" as const, fontSize: 8 };
  const t = tabelaExport(c);
  const res = calcResumo(c.ix, c.pontos, c.leituras);
  const unidades = Array.from(new Set(c.pontos.map((p) => p.unit_id))).map((id) => c.unidades.find((u) => u.id === id)?.nome ?? id);

  /* ---- capa ---- */
  doc.setFillColor(cor[0], cor[1], cor[2]);
  doc.rect(0, 0, W, 54, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text("Relatório de monitoramento", 18, 26);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(`${BRAND.org} · ${BRAND.tagline}`, 18, 36);
  doc.text(unidades.join(", ") || "—", 18, 44);

  doc.setTextColor(30, 40, 45);
  doc.setFontSize(11);
  const ident: [string, string][] = [
    ["Escopo", c.escopo],
    ["Período", periodoTxt(c.janela)],
    ["Emitido em", dtFmt(Date.now())],
    ["Emitido por", c.usuario]
  ];
  let y = 70;
  for (const [k, v] of ident) {
    doc.setFont("helvetica", "bold");
    doc.text(k, 18, y);
    doc.setFont("helvetica", "normal");
    doc.text(v, 52, y);
    y += 8;
  }

  const kp: [string, string][] = [["Leituras", String(c.leituras.length)]];
  const vol = somaDeltas(c.ix, c.leituras, "hid");
  const hb = somaDeltas(c.ix, c.leituras, "hor");
  if (vol != null) kp.push(["Volume nos hidrômetros", `${fmt(vol)} m³`]);
  if (hb != null) kp.push(["Horas, poços e cava", `${fmt(hb)} h`]);
  kp.push(["Pontos com leitura", String(new Set(c.leituras.map((r) => r.point_id)).size)]);
  let x = 18;
  y = 112;
  for (const [k, v] of kp) {
    doc.setFillColor(240, 245, 246);
    doc.roundedRect(x, y, 60, 24, 3, 3, "F");
    doc.setFontSize(8.5);
    doc.setTextColor(95, 112, 118);
    doc.text(k, x + 4, y + 8);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 40, 45);
    doc.text(v, x + 4, y + 18);
    doc.setFont("helvetica", "normal");
    x += 64;
    if (x > W - 70) {
      x = 18;
      y += 28;
    }
  }

  /* ---- alertas ---- */
  const alertas = calcAlertas(c.ix, c.pontos);
  if (alertas.length) {
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(30, 40, 45);
    doc.text("Alertas e pontos de atenção", 14, 18);
    autoTable(doc, {
      startY: 23,
      head: [["Nível", "Alerta", "Detalhe"]],
      body: alertas.map((a) => [a.level === "critico" ? "Crítico" : a.level === "atencao" ? "Atenção" : "Informação", a.titulo, a.detalhe]),
      styles: { fontSize: 8.5, cellPadding: 2, overflow: "linebreak" },
      headStyles: tema,
      margin: { left: 14, right: 14 },
      columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 80 } }
    });
  }

  /* ---- gráficos (dois por página) ---- */
  const gs = graficos(c);
  gs.forEach((g, i) => {
    if (i % 2 === 0) {
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(30, 40, 45);
      doc.text("Evolução das medições", 14, 18);
    }
    const yy = 26 + (i % 2) * 88;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(g.titulo, 14, yy);
    const img = paraImagem(linhas(g.campo, g.modo, { ink: "#33464d", grid: "#d5dfe2", resp: false, fundo: true }, g.series, c.janela), 1100, 340);
    doc.addImage(img, "JPEG", 14, yy + 3, 180, 55.6);
    if (g.campo === "nivel") {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(95, 112, 118);
      doc.text("Eixo invertido: quanto mais abaixo no gráfico, maior a profundidade do nível d'água.", 14, yy + 63);
      doc.setTextColor(30, 40, 45);
    }
  });

  /* ---- resumo por ponto ---- */
  if (res.length) {
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Resumo por ponto", 14, 18);
    autoTable(doc, {
      startY: 23,
      head: [["Ponto", "Medição", "Leituras", "Primeira data", "Última data", "Mínimo", "Máximo", "Último valor", "Consumo ou variação"]],
      body: res.map((r) => [r.ponto, r.campo, r.n, dtFmt(r.prim), dtFmt(r.ult), fmt(r.min), fmt(r.max), fmt(r.uv), r.tot == null ? "" : (r.cum ? "" : r.tot > 0 ? "+" : "") + fmt(r.tot)]),
      styles: { fontSize: 8, cellPadding: 1.8 },
      headStyles: tema,
      alternateRowStyles: { fillColor: [240, 245, 246] },
      margin: { left: 14, right: 14 },
      columnStyles: { 2: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" } }
    });
  }

  /* ---- leituras ---- */
  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Leituras", 14, 18);
  const corpo = t.linhas.slice(0, limiteLinhas);
  autoTable(doc, {
    startY: 23,
    head: [t.cols.map((col) => col.t)],
    body: corpo.map((l) => l.map((x, i) => (x instanceof Date ? dtFmt(x.getTime()) : typeof x === "number" ? (t.cols[i].t === "Fotos" ? String(x) : fmt(x)) : x))),
    styles: { fontSize: 7.5, cellPadding: 1.6, overflow: "linebreak" },
    headStyles: tema,
    alternateRowStyles: { fillColor: [240, 245, 246] },
    margin: { left: 14, right: 14 },
    columnStyles: t.cols.reduce<Record<number, { halign: "right" }>>((a, col, i) => (col.tipo === "n" ? { ...a, [i]: { halign: "right" } } : a), {})
  });
  if (t.linhas.length > limiteLinhas) {
    const yf = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
    doc.setFontSize(8);
    doc.text(`Exibidas as ${limiteLinhas} primeiras de ${t.linhas.length} leituras. Use a exportação em Excel para a lista completa.`, 14, yf);
  }

  /* ---- assinatura ---- */
  let ya = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 26;
  if (ya > H - 30) {
    doc.addPage();
    ya = 40;
  }
  doc.setDrawColor(120, 135, 140);
  doc.line(14, ya, 100, ya);
  doc.line(130, ya, 216, ya);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(95, 112, 118);
  doc.text("Responsável técnico", 14, ya + 5);
  doc.text("Data", 130, ya + 5);

  /* ---- rodapé em todas as páginas ---- */
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(110, 125, 130);
    doc.text(`${BRAND.org} · ${BRAND.app} · ${dFmt(Date.now())}`, 14, H - 7);
    doc.text(`página ${i} de ${n}`, W - 14, H - 7, { align: "right" });
  }
  return doc.output("blob");
}
