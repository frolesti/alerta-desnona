// En producció web (mateixa origin): /api
// En Capacitor natiu o staging: URL absoluta via VITE_API_URL
const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Error de xarxa' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
  total?: number;
  totalCount?: number;
  pagina?: number;
  limit?: number;
}

export interface Desnonament {
  id: string;
  adreca_id: string;
  boe_id: string | null;

  // Cas
  data_desnonament: string;
  hora_desnonament: string | null;
  estat: string;

  // Subhasta
  tipus_subhasta: string | null;
  tipus_be: string | null;
  vivenda_habitual: number;
  quantitat_reclamada: string | null;
  valor_subhasta: string | null;

  // Registrals
  idufir: string | null;
  inscripcio_registral: string | null;
  descripcio: string | null;

  // Jutjat
  jutjat: string | null;
  jutjat_adreca: string | null;
  jutjat_telefon: string | null;
  jutjat_email: string | null;

  // Procediment
  num_procediment: string | null;
  expedient: string | null;

  // Fonts
  font_oficial: string;
  url_font: string | null;
  document_url: string | null;

  // Dedup
  duplicat_de: string | null;

  creat_el: string;
  actualitzat_el: string;

  // Adreça (from JOIN)
  adreca_original: string;
  tipus_via: string | null;
  nom_via: string | null;
  numero: string | null;
  bloc: string | null;
  escala: string | null;
  pis: string | null;
  porta: string | null;
  codi_postal: string | null;
  localitat: string | null;
  provincia: string | null;
  comunitat_autonoma: string | null;
  codi_provincia: string | null;
  latitud: number | null;
  longitud: number | null;
  geocodat: number;
  ref_catastral: string | null;
}

export interface Historial {
  id: string;
  desnonament_id: string;
  data: string;
  tipus_canvi: string;
  estat_anterior: string | null;
  estat_nou: string | null;
  descripcio: string | null;
  font: string | null;
  creat_el: string;
}

export interface MapPoint {
  id: string;
  latitud: number;
  longitud: number;
  estat: string;
  data_desnonament: string;
  localitat: string;
  provincia: string;
}

export interface HistorialGlobal extends Historial {
  ciutat: string;
  comunitat_autonoma: string;
}

export interface Stats {
  total: number;
  programats: number;
  imminents: number;
  cancelats: number;
  executats: number;
  suspesos: number;
  perProvincia: Array<{ provincia: string; total: number }>;
}

// Desnonaments
export function getDesnonaments(params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return fetchJSON<ApiResponse<Desnonament[]>>(`/desnonaments${query}`);
}

export function getDesnonament(id: string) {
  return fetchJSON<ApiResponse<Desnonament>>(`/desnonaments/${id}`);
}

export function getHistorial(desnonamentId: string) {
  return fetchJSON<ApiResponse<Historial[]>>(`/desnonaments/${desnonamentId}/historial`);
}

export function getAllHistorial() {
  return fetchJSON<ApiResponse<HistorialGlobal[]>>('/desnonaments/historial-global');
}

export function getMapPoints() {
  return fetchJSON<ApiResponse<MapPoint[]>>('/desnonaments/mapa');
}

export function getEstadistiques() {
  return fetchJSON<ApiResponse<Stats>>('/desnonaments/estadistiques');
}

// Usuaris
export function registrarUsuari(data: {
  email: string;
  nom?: string;
  comarques?: string[];
  comunitats?: string[];
  provincies?: string[];
  notificacions_email?: boolean;
}) {
  return fetchJSON<ApiResponse<{ id: string; email: string }>>('/usuaris/registre', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Health
export function healthCheck() {
  return fetchJSON<{ ok: boolean; timestamp: string }>('/health');
}

// === Estadístiques INE (dades reals) ===

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

export interface INEResponse<T> {
  ok: boolean;
  data: T;
  any?: number;
  total_vivendes?: number;
  total_finques?: number;
  font?: string;
  url_font?: string;
  llicencia?: string;
  any_anterior?: number;
  message?: string;
}

export function getINEData() {
  return fetchJSON<INEResponse<EstadisticaINE[]>>('/estadistiques/ine');
}

export function getINETendencia(params?: { comunitat?: string; provincia?: string }) {
  const query = params ? '?' + new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v))
  ).toString() : '';
  return fetchJSON<INEResponse<TendenciaINE[]>>(`/estadistiques/ine/tendencia${query}`);
}

export function getINEComunitats() {
  return fetchJSON<INEResponse<ResumComunitat[]>>('/estadistiques/ine/comunitats');
}

export function getINEMapa() {
  return fetchJSON<INEResponse<PuntMapaINE[]>>('/estadistiques/ine/mapa');
}

// Detall d'una província
export interface ProvinciaDetall {
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
  variacio_percentual: number;
  vivendes_any_anterior: number;
}

export interface ProvinciaResponse {
  ok: boolean;
  data: ProvinciaDetall;
  tendencia: TendenciaINE[];
  font_comunitaria: { nom: string; url: string } | null;
  any: number;
  font: string;
  url_font: string;
  url_teju: string;
  error?: string;
}

export function getINEProvincia(codi: string) {
  return fetchJSON<ProvinciaResponse>(`/estadistiques/ine/provincia/${codi}`);
}

// === Casos individuals (desnonaments) ===

export interface CasIndividual {
  id: string;
  estat: string;
  data_desnonament: string;
  hora_desnonament: string | null;
  tipus_subhasta: string | null;
  tipus_be: string | null;
  jutjat: string | null;
  num_procediment: string | null;
  font_oficial: string;
  url_font: string | null;
  // Adreça (JOIN)
  adreca_original: string;
  tipus_via: string | null;
  nom_via: string | null;
  numero: string | null;
  localitat: string | null;
  provincia: string | null;
  comunitat_autonoma: string | null;
  codi_postal: string | null;
  latitud: number | null;
  longitud: number | null;
}

export interface CasosResponse {
  ok: boolean;
  data: CasIndividual[];
  total: number;
  pagina: number;
  limit: number;
}

export interface CasDetallResponse {
  ok: boolean;
  data: Desnonament;
}

export interface MapPointCas {
  id: string;
  latitud: number;
  longitud: number;
  estat: string;
  data_desnonament: string;
  hora_desnonament: string | null;
  ciutat: string;           // a.localitat AS ciutat
  provincia: string;
  comunitat_autonoma: string;
  adreca_original: string;
  tipus_via: string | null;
  nom_via: string | null;
  numero: string | null;
  bloc: string | null;
  escala: string | null;
  pis: string | null;
  porta: string | null;
  codi_postal: string | null;
  tipus_subhasta: string | null;
  tipus_be: string | null;
  vivenda_habitual: number | null;
  quantitat_reclamada: string | null;
  valor_subhasta: string | null;
  geocodat: number;
}

export function getCasos(params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return fetchJSON<CasosResponse>(`/desnonaments${query}`);
}

export function getCasDetall(id: string) {
  return fetchJSON<CasDetallResponse>(`/desnonaments/${id}`);
}

export function getCasosMap(params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return fetchJSON<ApiResponse<MapPointCas[]>>(`/desnonaments/mapa${query}`);
}

export function getCasosStats() {
  return fetchJSON<ApiResponse<Stats>>('/desnonaments/estadistiques');
}
