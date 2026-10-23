import type { CampoDef, CampoKey, Grupo, GrupoDef, Point, Unit } from "./types";

/** Identidade do aplicativo. Troque aqui o nome e as cores da organização. */
export const BRAND = {
  app: "Monitoramentos",
  org: "Grupo ICAL",
  tagline: "Monitoramento ambiental de campo",
  /** Cor principal usada nos relatórios PDF (RGB). */
  pdfRgb: [11, 110, 127] as [number, number, number]
};

export const GRUPOS: Record<Grupo, GrupoDef> = {
  pz: { rot: "Piezômetros", campos: ["nivel"] },
  po: { rot: "Poços e Cava", campos: ["hid", "hor"] },
  ete: { rot: "ETE", campos: ["hor1", "hor2"] }
};

export const CAMPOS: Record<CampoKey, CampoDef> = {
  nivel: { rot: "Nível d'água", un: "m", cum: false, milhar: false },
  hid: { rot: "Hidrômetro", un: "m³", cum: true, milhar: true },
  hor: { rot: "Horímetro", un: "h", cum: true, milhar: true },
  hor1: { rot: "Horímetro 1", un: "h", cum: true, milhar: true },
  hor2: { rot: "Horímetro 2", un: "h", cum: true, milhar: true }
};

export const GRUPO_KEYS = Object.keys(GRUPOS) as Grupo[];

/** Dados iniciais usados no modo local e na carga inicial do servidor (supabase/seed.sql espelha estes valores). */
export const SEED_UNITS: Unit[] = [{ id: "sjlp", nome: "São José da Lapa", ativo: true, updated_at: 0 }];

const p = (
  id: string,
  grupo: Grupo,
  nome: string,
  info: string,
  ordem: number,
  extra: Partial<Point> = {}
): Point => ({
  id,
  unit_id: "sjlp",
  grupo,
  nome,
  info,
  prof: null,
  inativo: false,
  limites: {},
  ordem,
  updated_at: 0,
  ...extra
});

export const SEED_POINTS: Point[] = [
  p("sjlp-pz01", "pz", "PZ.01", "UTM 610691 / 7819985 · cota 783 m · fundo 718 m · profundidade 65 m", 1, { prof: 65 }),
  p("sjlp-pz02", "pz", "PZ.02", "Caixa de proteção pendente. Profundidade a confirmar.", 2),
  p("sjlp-pz03", "pz", "PZ.03", "UTM 608719 / 7820445 · cota 774 m · fundo 718 m · profundidade 56 m", 3, { prof: 56 }),
  p("sjlp-inhame", "pz", "Inhame", "", 4),
  p("sjlp-chico", "pz", "Chico", "", 5),
  p("sjlp-poco3", "po", "Poço artesiano 3", "Registro do hidrômetro e do horímetro do poço.", 6),
  p("sjlp-poco4", "po", "Poço artesiano 4", "Registro do hidrômetro e do horímetro do poço.", 7, { inativo: true }),
  p("sjlp-poco5", "po", "Poço artesiano 5", "Hidrômetro em manutenção, aguardando novo equipamento.", 8),
  p("sjlp-poco6", "po", "Poço artesiano 6", "Registro do hidrômetro e do horímetro do poço.", 9, { inativo: true }),
  p("sjlp-cava", "po", "Cava", "Hidrômetro Itron (bombeamento) e horímetro BB-BA05 (bomba d'água da cava).", 10),
  p("sjlp-ete", "ete", "ETE", "Horímetro 1: mostrador superior. Horímetro 2: mostrador inferior.", 11)
];

export const DIAS_SEM_LEITURA_PADRAO = 7;
/** Pontos e leituras podem ser corrigidos por quem os criou durante este prazo. */
export const JANELA_EDICAO_MS = 24 * 3600 * 1000;
