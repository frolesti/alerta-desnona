// Tipus compartits entre client i server

// ─── Adreça normalitzada ─────────────────────────────────────────

export interface Adreca {
  id: string;
  adrecaOriginal: string;
  tipusVia: string | null;
  nomVia: string | null;
  numero: string | null;
  bloc: string | null;
  escala: string | null;
  pis: string | null;
  porta: string | null;
  codiPostal: string | null;
  localitat: string | null;
  provincia: string | null;
  codiProvincia: string | null;
  comunitatAutonoma: string | null;
  latitud: number | null;
  longitud: number | null;
  geocodat: number; // 0=no, 1=cadastre(exact), 2=street-level, 3=city-level, -1=error
  refCatastral: string | null;
}

// ─── Desnonament (cas de subhasta o edicte judicial) ─────────────

export interface Desnonament {
  id: string;
  adrecaId: string;

  // Dades del cas
  dataDesnonament: string; // ISO date
  horaDesnonament?: string;
  estat: EstatDesnonament;

  // Tipus de procediment
  tipusProcediment: TipusProcediment;

  // Dades de la subhasta
  tipusSubhasta?: string;
  tipusBe?: string;
  vivendaHabitual?: boolean;
  quantitatReclamada?: string;
  valorSubhasta?: string;

  // Registrals
  idufir?: string;
  inscripcioRegistral?: string;
  descripcio?: string;

  // Jutjat
  jutjat?: string;
  jutjatAdreca?: string;
  jutjatTelefon?: string;
  jutjatEmail?: string;

  // Procediment
  numProcediment?: string;
  expedient?: string;

  // Fonts
  fontOficial: string;
  urlFont?: string;
  documentUrl?: string;
  boeId?: string;

  // Dedup
  duplicatDe?: string;

  creatEl: string;
  actualitzatEl: string;
}

export const EstatDesnonament = {
  PROGRAMAT: 'programat',
  IMMINENT: 'imminent',
  CANCELAT: 'cancelat',
  EXECUTAT: 'executat',
  AJORNAT: 'ajornat',
  SUSPÈS: 'suspès',
  ATURAT: 'aturat',
  NEGOCIAT: 'negociat',
} as const;
export type EstatDesnonament = (typeof EstatDesnonament)[keyof typeof EstatDesnonament];

// Tipus de procediment — cobertura completa
export const TipusProcediment = {
  EJECUCION_HIPOTECARIA: 'ejecucion_hipotecaria',
  IMPAGO_ALQUILER: 'impago_alquiler',
  OCUPACION: 'ocupacion',
  CAUTELAR: 'cautelar',
  DESCONEGUT: 'desconegut',
} as const;
export type TipusProcediment = (typeof TipusProcediment)[keyof typeof TipusProcediment];

export interface Historial {
  id: string;
  desnonamentId: string;
  data: string;
  tipusCanvi: string;
  estatAnterior?: string;
  estatNou?: string;
  descripcio?: string;
  font?: string;
  creatEl: string;
}

export interface Usuari {
  id: string;
  email: string;
  nom?: string;
  provinciesSubscrites: string[];
  notificacionsPush: boolean;
  notificacionsEmail: boolean;
  radiKm?: number;
  latitud?: number;
  longitud?: number;
  creatEl: string;
}

export interface Subscripcio {
  id: string;
  usuariId: string;
  tipus: TipusSubscripcio;
  valor: string;
  activa: boolean;
}

export const TipusSubscripcio = {
  PROVINCIA: 'provincia',
  COMUNITAT: 'comunitat',
  RADI: 'radi',
} as const;
export type TipusSubscripcio = (typeof TipusSubscripcio)[keyof typeof TipusSubscripcio];

// Estadístiques INE — dades reals de l'Instituto Nacional de Estadística
export interface EstadisticaINE {
  provincia: string;
  codi_provincia: string;
  comunitat_autonoma: string;
  any: number;
  total_finques: number;
  finques_vivendes: number;
  finques_solars: number;
  finques_altres: number;
  finques_rustiques: number;
  tipus_dada: string;
  latitud?: number;
  longitud?: number;
}

export interface ResumComunitat {
  comunitat_autonoma: string;
  total_vivendes: number;
  total_finques: number;
  num_provincies: number;
  vivendes_any_anterior?: number;
  variacio_percentual?: number;
}

export interface PuntMapaINE {
  provincia: string;
  codi: string;
  comunitat: string;
  vivendes: number;
  total: number;
  lat: number;
  lng: number;
  radi: number;
}

export interface TendenciaINE {
  any: number;
  total_vivendes: number;
  total_finques: number;
  total_rustiques: number;
}

export interface Notificacio {
  id: string;
  usuariId: string;
  desnonamentId: string;
  tipus: 'push' | 'email';
  enviatEl: string;
  llegit: boolean;
}

export interface AlertaMap {
  id: string;
  latitud: number;
  longitud: number;
  estat: EstatDesnonament;
  dataDesnonament: string;
  localitat: string;
  provincia: string;
}

// API Response types
export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
  total?: number;
}

export interface FiltresDesnonament {
  comunitatAutonoma?: string;
  provincia?: string;
  estat?: EstatDesnonament;
  tipusProcediment?: TipusProcediment;
  dataInici?: string;
  dataFi?: string;
  cerca?: string;
  pagina?: number;
  limit?: number;
}
