import { CAMPOS, DIAS_SEM_LEITURA_PADRAO, GRUPOS } from "./config";
import { dtFmt, fmt } from "./format";
import type { Alert, CampoKey, Point, Reading, Valores } from "./types";

/** Índice de leituras por ponto, ordenado por data. Reconstruído quando os dados mudam. */
export interface Index {
  byPoint: Map<string, Reading[]>;
  prev(pointId: string, campo: CampoKey, ts: number, excludeId?: string | null): { ts: number; val: number; id: string } | null;
  delta(r: Reading, campo: CampoKey): number | null;
  last(pointId: string): Reading | null;
}

export function buildIndex(readings: Reading[]): Index {
  const byPoint = new Map<string, Reading[]>();
  for (const r of readings) {
    if (r.deleted) continue;
    let l = byPoint.get(r.point_id);
    if (!l) byPoint.set(r.point_id, (l = []));
    l.push(r);
  }
  byPoint.forEach((l) => l.sort((a, b) => a.ts - b.ts));

  const prev: Index["prev"] = (pointId, campo, ts, excludeId) => {
    const l = byPoint.get(pointId);
    if (!l) return null;
    let a: Reading | null = null;
    for (const r of l) {
      if (r.ts >= ts) break;
      if (r.id !== excludeId && r.v[campo] != null) a = r;
    }
    return a ? { ts: a.ts, val: a.v[campo] as number, id: a.id } : null;
  };

  return {
    byPoint,
    prev,
    delta(r, campo) {
      const v = r.v[campo];
      if (v == null) return null;
      const a = prev(r.point_id, campo, r.ts, r.id);
      if (!a) return null;
      const d = v - a.val;
      return d < 0 ? null : d;
    },
    last(pointId) {
      const l = byPoint.get(pointId);
      return l && l.length ? l[l.length - 1] : null;
    }
  };
}

export function somaDeltas(ix: Index, rs: Reading[], campo: CampoKey): number | null {
  let t = 0;
  let n = 0;
  for (const r of rs) {
    const d = ix.delta(r, campo);
    if (d != null) {
      t += d;
      n++;
    }
  }
  return n ? t : null;
}

export interface ResumoLinha {
  ponto: string;
  campo: string;
  k: CampoKey;
  n: number;
  prim: number;
  ult: number;
  pv: number;
  uv: number;
  min: number;
  max: number;
  tot: number | null;
  cum: boolean;
}

export function calcResumo(ix: Index, pontos: Point[], rs: Reading[]): ResumoLinha[] {
  const out: ResumoLinha[] = [];
  for (const p of pontos) {
    for (const k of GRUPOS[p.grupo].campos) {
      const l = rs.filter((r) => r.point_id === p.id && r.v[k] != null).sort((a, b) => a.ts - b.ts);
      if (!l.length) continue;
      const vals = l.map((r) => r.v[k] as number);
      const def = CAMPOS[k];
      const tot = def.cum ? somaDeltas(ix, l, k) : l.length > 1 ? vals[vals.length - 1] - vals[0] : null;
      out.push({
        ponto: p.nome,
        campo: `${def.rot} (${def.un})`,
        k,
        n: l.length,
        prim: l[0].ts,
        ult: l[l.length - 1].ts,
        pv: vals[0],
        uv: vals[vals.length - 1],
        min: Math.min(...vals),
        max: Math.max(...vals),
        tot,
        cum: def.cum
      });
    }
  }
  return out;
}

/** Avisos de conferência exibidos antes de salvar uma leitura. */
export function avisosDeLeitura(ix: Index, p: Point, v: Valores, ts: number, editId: string | null, agora = Date.now()): string[] {
  const out: string[] = [];
  for (const k of Object.keys(v) as CampoKey[]) {
    const def = CAMPOS[k];
    const val = v[k] as number;
    const a = ix.prev(p.id, k, ts, editId);
    if (def.cum && a) {
      if (val < a.val) out.push(`${def.rot} menor que a leitura anterior (${fmt(a.val)} ${def.un} em ${dtFmt(a.ts)}).`);
      else if (k.startsWith("hor")) {
        const h = (ts - a.ts) / 3600000;
        const d = val - a.val;
        if (d > h * 1.02 + 0.05) out.push(`${def.rot} avançou ${fmt(d)} h, mas só se passaram ${fmt(h)} h desde a leitura anterior (${dtFmt(a.ts)}).`);
      }
      const dias = (ts - a.ts) / 86400000;
      if (dias > 0.04) {
        const taxa = (val - a.val) / dias;
        if (k === "hid" && p.limites.volumeDiaMax != null && taxa > p.limites.volumeDiaMax)
          out.push(`Vazão média de ${fmt(taxa)} m³/dia acima do limite do ponto (${fmt(p.limites.volumeDiaMax)} m³/dia).`);
        if (k.startsWith("hor") && p.limites.horasDiaMax != null && taxa > p.limites.horasDiaMax)
          out.push(`Funcionamento médio de ${fmt(taxa)} h/dia acima do limite do ponto (${fmt(p.limites.horasDiaMax)} h/dia).`);
      }
    }
    if (k === "nivel") {
      if (p.prof && val > p.prof) out.push(`O nível informado é maior que a profundidade cadastrada do ponto (${p.prof} m).`);
      if (p.limites.nivelMax != null && val > p.limites.nivelMax) out.push(`Nível ${fmt(val)} m abaixo do limite máximo de profundidade (${fmt(p.limites.nivelMax)} m).`);
      if (p.limites.nivelMin != null && val < p.limites.nivelMin) out.push(`Nível ${fmt(val)} m acima do limite mínimo de profundidade (${fmt(p.limites.nivelMin)} m).`);
    }
  }
  if (ts > agora + 3600000) out.push("A data e a hora informadas estão no futuro.");
  return out;
}

/** Alertas ativos calculados a partir dos dados. Não são gravados: mudam conforme novas leituras chegam. */
export function calcAlertas(ix: Index, pontos: Point[], agora = Date.now()): Alert[] {
  const out: Alert[] = [];
  for (const p of pontos) {
    if (p.inativo) continue;
    const ult = ix.last(p.id);
    const lim = p.limites.diasSemLeitura ?? DIAS_SEM_LEITURA_PADRAO;
    if (!ult) {
      out.push({ id: `${p.id}:sem`, level: "info", point_id: p.id, titulo: `${p.nome}: sem leituras`, detalhe: "Ainda não há leituras registradas neste ponto.", ts: agora });
    } else {
      const dias = Math.floor((agora - ult.ts) / 86400000);
      if (dias > lim) {
        out.push({
          id: `${p.id}:atraso`,
          level: dias > lim * 2 ? "critico" : "atencao",
          point_id: p.id,
          titulo: `${p.nome}: sem leitura há ${dias} dias`,
          detalhe: `Última leitura em ${dtFmt(ult.ts)}. Limite configurado: ${lim} dias.`,
          ts: ult.ts
        });
      }
      const nv = ult.v.nivel;
      if (nv != null) {
        if (p.limites.nivelMax != null && nv > p.limites.nivelMax)
          out.push({ id: `${p.id}:nivmax`, level: "critico", point_id: p.id, titulo: `${p.nome}: nível acima do limite`, detalhe: `${fmt(nv)} m (limite máximo ${fmt(p.limites.nivelMax)} m) em ${dtFmt(ult.ts)}.`, ts: ult.ts });
        if (p.limites.nivelMin != null && nv < p.limites.nivelMin)
          out.push({ id: `${p.id}:nivmin`, level: "atencao", point_id: p.id, titulo: `${p.nome}: nível abaixo do limite mínimo`, detalhe: `${fmt(nv)} m (limite mínimo ${fmt(p.limites.nivelMin)} m) em ${dtFmt(ult.ts)}.`, ts: ult.ts });
      }
      for (const k of GRUPOS[p.grupo].campos) {
        if (!CAMPOS[k].cum || ult.v[k] == null) continue;
        const a = ix.prev(p.id, k, ult.ts, ult.id);
        if (!a) continue;
        if ((ult.v[k] as number) < a.val)
          out.push({ id: `${p.id}:${k}:regride`, level: "atencao", point_id: p.id, titulo: `${p.nome}: ${CAMPOS[k].rot.toLowerCase()} regrediu`, detalhe: `${fmt(ult.v[k] as number)} ${CAMPOS[k].un} contra ${fmt(a.val)} ${CAMPOS[k].un} na leitura anterior. Verifique digitação ou troca de equipamento.`, ts: ult.ts });
        const dias = (ult.ts - a.ts) / 86400000;
        const taxa = dias > 0.04 ? ((ult.v[k] as number) - a.val) / dias : 0;
        if (k === "hid" && p.limites.volumeDiaMax != null && taxa > p.limites.volumeDiaMax)
          out.push({ id: `${p.id}:vol`, level: "atencao", point_id: p.id, titulo: `${p.nome}: vazão acima do limite`, detalhe: `${fmt(taxa)} m³/dia contra limite de ${fmt(p.limites.volumeDiaMax)} m³/dia.`, ts: ult.ts });
        if (k.startsWith("hor") && p.limites.horasDiaMax != null && taxa > p.limites.horasDiaMax)
          out.push({ id: `${p.id}:${k}:horas`, level: "atencao", point_id: p.id, titulo: `${p.nome}: funcionamento acima do limite`, detalhe: `${fmt(taxa)} h/dia contra limite de ${fmt(p.limites.horasDiaMax)} h/dia.`, ts: ult.ts });
      }
    }
  }
  const peso = { critico: 0, atencao: 1, info: 2 } as const;
  return out.sort((a, b) => peso[a.level] - peso[b.level] || b.ts - a.ts);
}
