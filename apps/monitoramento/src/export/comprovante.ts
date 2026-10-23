import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { codigoComprovante } from "../domain/comprovante";
import { BRAND, CAMPOS, GRUPOS } from "../domain/config";
import { dFmt, dtFmt, fmt } from "../domain/format";
import type { Index } from "../domain/calc";
import type { Point, Reading, Unit } from "../domain/types";
import { fotoUrl } from "../data/store";

export interface DadosComprovante {
  leituras: Reading[];
  pontos: Point[];
  unidades: Unit[];
  ix: Index;
  responsavel: string;
  pendentes: number;
  modoLocal: boolean;
}

async function fotoDataUrl(path: string): Promise<string | null> {
  try {
    const u = await fotoUrl(path);
    if (!u) return null;
    const blob = await (await fetch(u)).blob();
    return await new Promise<string>((ok, err) => {
      const fr = new FileReader();
      fr.onload = () => ok(String(fr.result));
      fr.onerror = () => err(fr.error);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Comprovante do monitoramento: o que foi medido, por quem, quando, com fotos e código de verificação. */
export async function gerarComprovante(d: DadosComprovante): Promise<{ blob: Blob; nome: string; codigo: string }> {
  const rs = d.leituras.slice().sort((a, b) => a.ts - b.ts);
  const pm = new Map(d.pontos.map((p) => [p.id, p]));
  const um = new Map(d.unidades.map((u) => [u.id, u.nome]));
  const codigo = await codigoComprovante(rs);
  const agora = Date.now();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const cor = BRAND.pdfRgb;

  doc.setFillColor(cor[0], cor[1], cor[2]);
  doc.rect(0, 0, W, 34, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text("Comprovante de monitoramento", 14, 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text(`${BRAND.org} · ${BRAND.app}`, 14, 23);
  doc.setFontSize(9);
  doc.text(`Código ${codigo}`, W - 14, 15, { align: "right" });

  doc.setTextColor(30, 40, 45);
  const unidades = Array.from(new Set(rs.map((r) => um.get(r.unit_id) ?? r.unit_id))).join(", ") || "—";
  const periodo = rs.length ? (dFmt(rs[0].ts) === dFmt(rs[rs.length - 1].ts) ? dFmt(rs[0].ts) : `${dFmt(rs[0].ts)} a ${dFmt(rs[rs.length - 1].ts)}`) : dFmt(agora);
  const ident: [string, string][] = [
    ["Unidade", unidades],
    ["Data do monitoramento", periodo],
    ["Responsável", d.responsavel || "—"],
    ["Pontos registrados", String(new Set(rs.map((r) => r.point_id)).size) + ` (${rs.length} ${rs.length === 1 ? "leitura" : "leituras"})`],
    ["Emitido em", dtFmt(agora)],
    ["Situação do envio", d.modoLocal ? "Dados guardados somente neste aparelho" : d.pendentes ? `${d.pendentes} item(ns) aguardando envio ao servidor` : "Sincronizado com o servidor"]
  ];
  let y = 44;
  doc.setFontSize(10);
  for (const [k, v] of ident) {
    doc.setFont("helvetica", "bold");
    doc.text(k, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(v, 62, y, { maxWidth: W - 76 });
    y += 6.5;
  }

  const linhas = rs.map((r) => {
    const p = pm.get(r.point_id);
    const med = p
      ? GRUPOS[p.grupo].campos
          .filter((k) => r.v[k] != null)
          .map((k) => {
            const dlt = CAMPOS[k].cum ? d.ix.delta(r, k) : null;
            return `${CAMPOS[k].rot}: ${fmt(r.v[k])} ${CAMPOS[k].un}${dlt != null ? ` (+${fmt(dlt)})` : ""}`;
          })
          .join("\n")
      : "";
    return [p?.nome ?? r.point_id, dtFmt(r.ts).slice(11), med, r.obs || "", r.photos.length ? String(r.photos.length) : "—"];
  });
  autoTable(doc, {
    startY: y + 4,
    head: [["Ponto", "Hora", "Medições", "Observações", "Fotos"]],
    body: linhas.length ? linhas : [["Nenhuma leitura registrada neste monitoramento.", "", "", "", ""]],
    styles: { fontSize: 9, cellPadding: 2.2, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: cor, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [240, 245, 246] },
    margin: { left: 14, right: 14 },
    columnStyles: { 1: { cellWidth: 16 }, 4: { cellWidth: 14, halign: "center" } }
  });

  /* fotos (até 12, miniaturas) */
  const fotos: { path: string; rot: string }[] = [];
  for (const r of rs) for (const f of r.photos) if (fotos.length < 12) fotos.push({ path: f, rot: `${pm.get(r.point_id)?.nome ?? ""} · ${dtFmt(r.ts).slice(11)}` });
  const imgs = (await Promise.all(fotos.map(async (f) => ({ ...f, url: await fotoDataUrl(f.path) })))).filter((f) => f.url);
  let ya = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  if (imgs.length) {
    if (ya > H - 70) {
      doc.addPage();
      ya = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Fotos registradas", 14, ya);
    ya += 4;
    const tam = 42;
    let x = 14;
    for (const im of imgs) {
      if (x + tam > W - 14) {
        x = 14;
        ya += tam + 10;
      }
      if (ya + tam + 8 > H - 40) {
        doc.addPage();
        ya = 20;
        x = 14;
      }
      doc.addImage(im.url!, "JPEG", x, ya, tam, tam * 0.75, undefined, "FAST");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(95, 112, 118);
      doc.text(im.rot, x, ya + tam * 0.75 + 4, { maxWidth: tam });
      doc.setTextColor(30, 40, 45);
      x += tam + 6;
    }
    ya += tam + 14;
  }

  /* assinaturas */
  if (ya > H - 50) {
    doc.addPage();
    ya = 40;
  }
  ya = Math.max(ya + 10, H - 62);
  doc.setDrawColor(120, 135, 140);
  doc.line(14, ya, 92, ya);
  doc.line(W - 92, ya, W - 14, ya);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(95, 112, 118);
  doc.text(d.responsavel || "Responsável pela medição", 14, ya + 5);
  doc.text("Visto / conferência", W - 92, ya + 5);

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(110, 125, 130);
    doc.text(`Código ${codigo} · ${BRAND.org} · ${BRAND.app}`, 14, H - 8);
    doc.text(`página ${i} de ${n}`, W - 14, H - 8, { align: "right" });
  }
  const iso = new Date(agora);
  const p2 = (v: number) => String(v).padStart(2, "0");
  const nome = `comprovante_${iso.getFullYear()}-${p2(iso.getMonth() + 1)}-${p2(iso.getDate())}_${p2(iso.getHours())}${p2(iso.getMinutes())}.pdf`;
  return { blob: doc.output("blob"), nome, codigo };
}
