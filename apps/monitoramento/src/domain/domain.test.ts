import { describe, expect, it } from "vitest";
import { avisosDeLeitura, buildIndex, calcAlertas, calcResumo, somaDeltas } from "./calc";
import { SEED_POINTS } from "./config";
import { parseNum } from "./format";
import type { Reading } from "./types";

const DIA = 86400000;
const t0 = new Date("2025-03-01T08:00:00").getTime();
let n = 0;
const leitura = (point_id: string, dias: number, v: Reading["v"]): Reading => ({
  id: "r" + n++, point_id, unit_id: "sjlp", ts: t0 + dias * DIA, v, obs: "", resp: "", photos: [], created_by: null, created_at: 0, updated_at: 0, deleted: false
});
const ponto = (id: string) => SEED_POINTS.find((p) => p.id === id)!;

describe("parseNum", () => {
  it("lê vírgula como decimal e ponto como milhar quando permitido", () => {
    expect(parseNum("12,5")).toBe(12.5);
    expect(parseNum("1.234,56")).toBe(1234.56);
    expect(parseNum("12.345", true)).toBe(12345);
    expect(parseNum("12.345", false)).toBe(12.345);
  });
  it("devolve null para vazio e NaN para texto", () => {
    expect(parseNum("  ")).toBeNull();
    expect(Number.isNaN(parseNum("abc"))).toBe(true);
    expect(Number.isNaN(parseNum("1,2,3"))).toBe(true);
  });
});

describe("consumo entre leituras", () => {
  const rs = [leitura("sjlp-poco3", 0, { hid: 1000, hor: 200 }), leitura("sjlp-poco3", 1, { hid: 1100, hor: 210 }), leitura("sjlp-poco3", 3, { hid: 1400, hor: 240 })];
  const ix = buildIndex(rs);
  it("calcula o delta contra a leitura anterior do mesmo ponto", () => {
    expect(ix.delta(rs[1], "hid")).toBe(100);
    expect(ix.delta(rs[2], "hid")).toBe(300);
    expect(ix.delta(rs[0], "hid")).toBeNull();
  });
  it("soma os deltas e resume por ponto", () => {
    expect(somaDeltas(ix, rs, "hid")).toBe(400);
    const r = calcResumo(ix, [ponto("sjlp-poco3")], rs).find((x) => x.k === "hid")!;
    expect(r).toMatchObject({ n: 3, min: 1000, max: 1400, tot: 400 });
  });
  it("ignora leituras excluídas", () => {
    const ix2 = buildIndex([...rs.slice(0, 2), { ...rs[2], deleted: true }]);
    expect(ix2.last("sjlp-poco3")?.id).toBe(rs[1].id);
  });
});

describe("avisos antes de salvar", () => {
  const rs = [leitura("sjlp-poco3", 0, { hid: 1000, hor: 200 })];
  const ix = buildIndex(rs);
  const p = ponto("sjlp-poco3");
  it("avisa quando o acumulado regride", () => {
    expect(avisosDeLeitura(ix, p, { hid: 900 }, t0 + DIA, null).join(" ")).toMatch(/menor que a leitura anterior/);
  });
  it("avisa horímetro que avançou mais que o tempo decorrido", () => {
    expect(avisosDeLeitura(ix, p, { hor: 260 }, t0 + DIA, null).join(" ")).toMatch(/avançou/);
  });
  it("não avisa para leitura coerente", () => {
    expect(avisosDeLeitura(ix, p, { hid: 1100, hor: 210 }, t0 + DIA, null)).toEqual([]);
  });
  it("respeita limites de vazão e nível do ponto", () => {
    const lim = { ...p, limites: { volumeDiaMax: 50 } };
    expect(avisosDeLeitura(ix, lim, { hid: 1200 }, t0 + DIA, null).join(" ")).toMatch(/Vazão média/);
    const pz = { ...ponto("sjlp-pz01"), limites: { nivelMax: 40 } };
    expect(avisosDeLeitura(buildIndex([]), pz, { nivel: 45 }, t0, null).join(" ")).toMatch(/limite máximo/);
  });
});

describe("alertas", () => {
  it("gera alerta de atraso e escala para crítico", () => {
    const ix = buildIndex([leitura("sjlp-pz01", 0, { nivel: 30 })]);
    const pz = [ponto("sjlp-pz01")];
    expect(calcAlertas(ix, pz, t0 + 5 * DIA).filter((a) => a.level !== "info")).toEqual([]);
    expect(calcAlertas(ix, pz, t0 + 10 * DIA)[0].level).toBe("atencao");
    expect(calcAlertas(ix, pz, t0 + 20 * DIA)[0].level).toBe("critico");
  });
  it("ignora pontos fora de operação", () => {
    expect(calcAlertas(buildIndex([]), [ponto("sjlp-poco4")])).toEqual([]);
  });
  it("alerta nível acima do limite", () => {
    const pz = { ...ponto("sjlp-pz01"), limites: { nivelMax: 40 } };
    const ix = buildIndex([leitura("sjlp-pz01", 0, { nivel: 44 })]);
    expect(calcAlertas(ix, [pz], t0 + DIA).some((a) => a.level === "critico" && /nível acima/.test(a.titulo))).toBe(true);
  });
});
