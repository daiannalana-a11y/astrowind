export type Grupo = "pz" | "po" | "ete";
export type CampoKey = "nivel" | "hid" | "hor" | "hor1" | "hor2";
export type Role = "campo" | "gestor" | "admin";

export interface CampoDef {
  rot: string;
  un: string;
  /** Leitura acumulada (hidrômetro, horímetro): o consumo é a diferença entre leituras. */
  cum: boolean;
  /** Aceita "12.345" como doze mil trezentos e quarenta e cinco. */
  milhar: boolean;
}

export interface GrupoDef {
  rot: string;
  campos: CampoKey[];
}

export interface Limites {
  /** Profundidade máxima aceitável do nível d'água (m). */
  nivelMax?: number;
  /** Profundidade mínima aceitável do nível d'água (m). */
  nivelMin?: number;
  /** Dias sem leitura até gerar alerta. */
  diasSemLeitura?: number;
  /** Volume máximo por dia entre duas leituras (m³/dia). */
  volumeDiaMax?: number;
  /** Horas máximas por dia entre duas leituras (h/dia). */
  horasDiaMax?: number;
}

export interface Unit {
  id: string;
  nome: string;
  ativo: boolean;
  updated_at: number;
}

export interface Point {
  id: string;
  unit_id: string;
  grupo: Grupo;
  nome: string;
  info: string;
  prof: number | null;
  inativo: boolean;
  limites: Limites;
  ordem: number;
  updated_at: number;
}

export type Valores = Partial<Record<CampoKey, number>>;

export interface Reading {
  id: string;
  point_id: string;
  unit_id: string;
  ts: number;
  v: Valores;
  obs: string;
  resp: string;
  /** Caminhos no armazenamento (ex.: sjlp/2025/abc-0.jpg). */
  photos: string[];
  created_by: string | null;
  created_at: number;
  updated_at: number;
  deleted: boolean;
}

export interface Profile {
  id: string;
  nome: string;
  email: string;
  role: Role;
  unit_ids: string[];
}

export interface AuditEntry {
  id: number;
  ts: number;
  user_id: string | null;
  user_nome: string;
  action: string;
  table_name: string;
  row_id: string;
  before: unknown;
  after: unknown;
}

export type AlertLevel = "critico" | "atencao" | "info";

export interface Alert {
  id: string;
  level: AlertLevel;
  point_id: string;
  titulo: string;
  detalhe: string;
  ts: number;
}
