/**
 * Fetcher de dades del CGPJ (Consejo General del Poder Judicial)
 * 
 * Font: "Datos sobre el efecto de la crisis en los órganos judiciales"
 * https://www.poderjudicial.es/cgpj/es/Temas/Estadistica-Judicial/Estudios-e-Informes/Efecto-de-la-Crisis-en-los-organos-judiciales/
 * 
 * Dades:
 *   - Llançaments practicats (desnonaments executats) per CCAA i província
 *   - Desglossament per tipus: Ejecución Hipotecaria, LAU (lloguer), Altres
 *   - Verbals possessoris per ocupació il·legal de vivendes
 *   - Evolució interanual i taxa per 100.000 habitants
 * 
 * Fitxer: Excel XLSX anual publicat pel CGPJ
 * Llicència: Dades públiques del Poder Judicial
 * 
 * Ús:
 *   npx tsx src/fetch-cgpj.ts                 # Últim any disponible
 *   npx tsx src/fetch-cgpj.ts --year 2024     # Any específic
 *   npx tsx src/fetch-cgpj.ts --all           # Tots els anys disponibles (2023-2025)
 */

import { initDB, getDB } from './db/database';
import * as XLSX from 'xlsx';

// ===== Configuració =====

const BASE_URL = 'https://www.poderjudicial.es/stfls/ESTADISTICA/FICHEROS/Crisis/';
const FILE_PATTERN = 'Datos%20sobre%20el%20efecto%20de%20la%20crisis%20en%20los%20organos%20judiciales%20-%20Anual%20';

// Anys disponibles confirmats
const ANYS_DISPONIBLES = [2023, 2024, 2025];

// Mapatge de noms CGPJ (castellà, poden venir en MAJÚSCULES) a noms normalitzats
// El CGPJ usa noms com "ANDALUCÍA", "CATALUÑA", "MADRID, COMUNIDAD", etc.
function normalizeCCAA(raw: string): string | null {
  const s = raw.trim();
  const u = s.toUpperCase();

  // Mapping exact o parcial
  const MAP: Record<string, string> = {
    'ANDALUCÍA': 'Andalucía',
    'ANDALUCIA': 'Andalucía',
    'ARAGÓN': 'Aragón',
    'ARAGON': 'Aragón',
    'ASTURIAS': 'Principado de Asturias',
    'ASTURIAS, PRINCIPADO': 'Principado de Asturias',
    'PRINCIPADO DE ASTURIAS': 'Principado de Asturias',
    'ILLES BALEARS': 'Illes Balears',
    'BALEARES': 'Illes Balears',
    'ISLAS BALEARES': 'Illes Balears',
    'CANARIAS': 'Canarias',
    'CANTABRIA': 'Cantabria',
    'CASTILLA Y LEÓN': 'Castilla y León',
    'CASTILLA Y LEON': 'Castilla y León',
    'CASTILLA - LEÓN': 'Castilla y León',
    'CASTILLA - LEON': 'Castilla y León',
    'CASTILLA-LA MANCHA': 'Castilla-La Mancha',
    'CASTILLA - LA MANCHA': 'Castilla-La Mancha',
    'CATALUÑA': 'Catalunya',
    'CATALUNYA': 'Catalunya',
    'COMUNITAT VALENCIANA': 'Comunitat Valenciana',
    'COMUNIDAD VALENCIANA': 'Comunitat Valenciana',
    'C. VALENCIANA': 'Comunitat Valenciana',
    'EXTREMADURA': 'Extremadura',
    'GALICIA': 'Galicia',
    'MADRID': 'Comunidad de Madrid',
    'MADRID, COMUNIDAD': 'Comunidad de Madrid',
    'COMUNIDAD DE MADRID': 'Comunidad de Madrid',
    'MURCIA': 'Región de Murcia',
    'MURCIA, REGIÓN': 'Región de Murcia',
    'MURCIA, REGION': 'Región de Murcia',
    'REGIÓN DE MURCIA': 'Región de Murcia',
    'NAVARRA': 'Comunidad Foral de Navarra',
    'NAVARRA, COM. FORAL': 'Comunidad Foral de Navarra',
    'COMUNIDAD FORAL DE NAVARRA': 'Comunidad Foral de Navarra',
    'PAÍS VASCO': 'Euskadi',
    'PAIS VASCO': 'Euskadi',
    'EUSKADI': 'Euskadi',
    'LA RIOJA': 'La Rioja',
    'RIOJA (LA)': 'La Rioja',
    'CEUTA': 'Ceuta',
    'MELILLA': 'Melilla',
  };

  if (MAP[u]) return MAP[u];

  // Intent parcial
  for (const [key, val] of Object.entries(MAP)) {
    if (u.includes(key) || key.includes(u)) return val;
  }

  return null;
}

// Noms de província → CCAA (el CGPJ pot enviar-los en MAJÚSCULES)
function normalizeProvincia(raw: string): { nom: string; ccaa: string } | null {
  const s = raw.trim();
  const u = s.toUpperCase();

  const MAP: Record<string, { nom: string; ccaa: string }> = {
    'ÁLAVA': { nom: 'Araba/Álava', ccaa: 'Euskadi' },
    'ARABA/ALAVA': { nom: 'Araba/Álava', ccaa: 'Euskadi' },
    'ALBACETE': { nom: 'Albacete', ccaa: 'Castilla-La Mancha' },
    'ALICANTE': { nom: 'Alacant/Alicante', ccaa: 'Comunitat Valenciana' },
    'ALMERÍA': { nom: 'Almería', ccaa: 'Andalucía' },
    'ALMERIA': { nom: 'Almería', ccaa: 'Andalucía' },
    'ÁVILA': { nom: 'Àvila', ccaa: 'Castilla y León' },
    'AVILA': { nom: 'Àvila', ccaa: 'Castilla y León' },
    'BADAJOZ': { nom: 'Badajoz', ccaa: 'Extremadura' },
    'BALEARES': { nom: 'Illes Balears', ccaa: 'Illes Balears' },
    'ILLES BALEARS': { nom: 'Illes Balears', ccaa: 'Illes Balears' },
    'BARCELONA': { nom: 'Barcelona', ccaa: 'Catalunya' },
    'BURGOS': { nom: 'Burgos', ccaa: 'Castilla y León' },
    'CÁCERES': { nom: 'Càceres', ccaa: 'Extremadura' },
    'CACERES': { nom: 'Càceres', ccaa: 'Extremadura' },
    'CÁDIZ': { nom: 'Cadis', ccaa: 'Andalucía' },
    'CADIZ': { nom: 'Cadis', ccaa: 'Andalucía' },
    'CASTELLÓN': { nom: 'Castelló', ccaa: 'Comunitat Valenciana' },
    'CASTELLON': { nom: 'Castelló', ccaa: 'Comunitat Valenciana' },
    'CIUDAD REAL': { nom: 'Ciudad Real', ccaa: 'Castilla-La Mancha' },
    'CÓRDOBA': { nom: 'Còrdova', ccaa: 'Andalucía' },
    'CORDOBA': { nom: 'Còrdova', ccaa: 'Andalucía' },
    'CORUÑA (A)': { nom: 'A Coruña', ccaa: 'Galicia' },
    'A CORUÑA': { nom: 'A Coruña', ccaa: 'Galicia' },
    'CUENCA': { nom: 'Conca', ccaa: 'Castilla-La Mancha' },
    'GIRONA': { nom: 'Girona', ccaa: 'Catalunya' },
    'GRANADA': { nom: 'Granada', ccaa: 'Andalucía' },
    'GUADALAJARA': { nom: 'Guadalajara', ccaa: 'Castilla-La Mancha' },
    'GUIPÚZCOA': { nom: 'Gipuzkoa', ccaa: 'Euskadi' },
    'GIPUZKOA': { nom: 'Gipuzkoa', ccaa: 'Euskadi' },
    'HUELVA': { nom: 'Huelva', ccaa: 'Andalucía' },
    'HUESCA': { nom: 'Osca', ccaa: 'Aragón' },
    'JAÉN': { nom: 'Jaén', ccaa: 'Andalucía' },
    'JAEN': { nom: 'Jaén', ccaa: 'Andalucía' },
    'LEÓN': { nom: 'Lleó', ccaa: 'Castilla y León' },
    'LEON': { nom: 'Lleó', ccaa: 'Castilla y León' },
    'LLEIDA': { nom: 'Lleida', ccaa: 'Catalunya' },
    'LÉRIDA': { nom: 'Lleida', ccaa: 'Catalunya' },
    'LERIDA': { nom: 'Lleida', ccaa: 'Catalunya' },
    'LA RIOJA': { nom: 'La Rioja', ccaa: 'La Rioja' },
    'RIOJA (LA)': { nom: 'La Rioja', ccaa: 'La Rioja' },
    'LUGO': { nom: 'Lugo', ccaa: 'Galicia' },
    'MADRID': { nom: 'Madrid', ccaa: 'Comunidad de Madrid' },
    'MÁLAGA': { nom: 'Màlaga', ccaa: 'Andalucía' },
    'MALAGA': { nom: 'Màlaga', ccaa: 'Andalucía' },
    'MURCIA': { nom: 'Múrcia', ccaa: 'Región de Murcia' },
    'NAVARRA': { nom: 'Navarra', ccaa: 'Comunidad Foral de Navarra' },
    'OURENSE': { nom: 'Ourense', ccaa: 'Galicia' },
    'ORENSE': { nom: 'Ourense', ccaa: 'Galicia' },
    'ASTURIAS': { nom: 'Astúries', ccaa: 'Principado de Asturias' },
    'PALENCIA': { nom: 'Palència', ccaa: 'Castilla y León' },
    'PALMAS (LAS)': { nom: 'Las Palmas', ccaa: 'Canarias' },
    'LAS PALMAS': { nom: 'Las Palmas', ccaa: 'Canarias' },
    'PONTEVEDRA': { nom: 'Pontevedra', ccaa: 'Galicia' },
    'SALAMANCA': { nom: 'Salamanca', ccaa: 'Castilla y León' },
    'SANTA CRUZ DE TENERIFE': { nom: 'Santa Cruz de Tenerife', ccaa: 'Canarias' },
    'S.C. TENERIFE': { nom: 'Santa Cruz de Tenerife', ccaa: 'Canarias' },
    'CANTABRIA': { nom: 'Cantàbria', ccaa: 'Cantabria' },
    'SEGOVIA': { nom: 'Segòvia', ccaa: 'Castilla y León' },
    'SEVILLA': { nom: 'Sevilla', ccaa: 'Andalucía' },
    'SORIA': { nom: 'Sòria', ccaa: 'Castilla y León' },
    'TARRAGONA': { nom: 'Tarragona', ccaa: 'Catalunya' },
    'TERUEL': { nom: 'Terol', ccaa: 'Aragón' },
    'TOLEDO': { nom: 'Toledo', ccaa: 'Castilla-La Mancha' },
    'VALENCIA': { nom: 'València', ccaa: 'Comunitat Valenciana' },
    'VALLADOLID': { nom: 'Valladolid', ccaa: 'Castilla y León' },
    'VIZCAYA': { nom: 'Bizkaia', ccaa: 'Euskadi' },
    'BIZKAIA': { nom: 'Bizkaia', ccaa: 'Euskadi' },
    'ZAMORA': { nom: 'Zamora', ccaa: 'Castilla y León' },
    'ZARAGOZA': { nom: 'Saragossa', ccaa: 'Aragón' },
    'CEUTA': { nom: 'Ceuta', ccaa: 'Ceuta' },
    'MELILLA': { nom: 'Melilla', ccaa: 'Melilla' },
  };

  if (MAP[u]) return MAP[u];

  // Fallback: cerca parcial
  for (const [key, val] of Object.entries(MAP)) {
    if (u.includes(key) || key.includes(u)) return val;
  }

  return null;
}

// ===== Helpers =====

/** Busca un full per nom parcial (case-insensitive, ignora espais extra) */
function findSheet(workbook: XLSX.WorkBook, ...keywords: string[]): string | null {
  return workbook.SheetNames.find(name => {
    const n = name.toLowerCase().replace(/\s+/g, ' ').trim();
    return keywords.every(kw => n.includes(kw.toLowerCase()));
  }) || null;
}

// ===== Parseig de les dades CCAA =====

interface DadesCCAA {
  nom: string;
  any: number;
  lanzaments_total: number;
  lanzaments_hipotecaria: number;
  lanzaments_lau: number;
  lanzaments_altres: number;
  ocupacio_verbal: number;
  evolucio_percentual: number | null;
  poblacio: number | null;
  taxa_per_100k: number | null;
}

interface DadesProvincia {
  nom: string;
  any: number;
  lanzaments_total: number;
  lanzaments_hipotecaria: number;
  lanzaments_lau: number;
  lanzaments_altres: number;
  ocupacio_verbal: number;
  execucions_hipotecaries: number;
  concursos_total: number;
  monitoris: number;
}

// ===== Descàrrega del fitxer Excel =====

async function downloadExcel(year: number): Promise<ArrayBuffer> {
  const url = `${BASE_URL}${FILE_PATTERN}${year}.xlsx`;
  console.log(`📡 Descarregant fitxer CGPJ: ${url}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'AlertaDesnona/1.0 (projecte social open-source)',
    },
  });

  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status} descarregant any ${year}: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  console.log(`✅ Descarregat: ${(buffer.byteLength / 1024).toFixed(0)} KB`);
  return buffer;
}

// ===== Parseig de les dades CCAA =====

function parseAllCCAAData(workbook: XLSX.WorkBook): DadesCCAA[] {
  const result: DadesCCAA[] = [];

  // Find sheets using fuzzy matching
  const totalSheetName = findSheet(workbook, 'lanzamiento', 'total', 'tsj');
  const ehSheetName = findSheet(workbook, 'lanzamiento', 'hipotecaria', 'tsj');
  const lauSheetName = findSheet(workbook, 'lanzamiento', 'l.a.u', 'tsj');
  const altresSheetName = findSheet(workbook, 'lanzamiento', 'otro', 'tsj');
  const ocupacioSheetName = findSheet(workbook, 'verb', 'ocupaci');

  console.log(`  Fulls detectats:`);
  console.log(`    Total:   ${totalSheetName || '❌ no trobat'}`);
  console.log(`    Hipot.:  ${ehSheetName || '❌ no trobat'}`);
  console.log(`    LAU:     ${lauSheetName || '❌ no trobat'}`);
  console.log(`    Altres:  ${altresSheetName || '❌ no trobat'}`);
  console.log(`    Ocupac.: ${ocupacioSheetName || '❌ no trobat'}`);

  const totalSheet = totalSheetName ? parseLanzamientosSheet(workbook, totalSheetName) : null;
  const ehSheet = ehSheetName ? parseLanzamientosSheet(workbook, ehSheetName) : null;
  const lauSheet = lauSheetName ? parseLanzamientosSheet(workbook, lauSheetName) : null;
  const altresSheet = altresSheetName ? parseLanzamientosSheet(workbook, altresSheetName) : null;
  const ocupacioSheet = ocupacioSheetName ? parseLanzamientosSheet(workbook, ocupacioSheetName) : null;

  if (!totalSheet) {
    console.error('❌ No s\'ha pogut parsejar el full de llançaments totals');
    return result;
  }

  // Combinar totes les dades
  for (const [ccaaRaw, anyDades] of totalSheet.entries()) {
    const ccaaNorm = normalizeCCAA(ccaaRaw);
    if (!ccaaNorm) {
      console.warn(`⚠️ CCAA no reconeguda: "${ccaaRaw}"`);
      continue;
    }

    for (const [any, total] of anyDades.entries()) {
      // Buscar les dades de desglossament amb el nom exacte del full original
      const eh = ehSheet?.get(ccaaRaw)?.get(any) || 0;
      const lau = lauSheet?.get(ccaaRaw)?.get(any) || 0;
      const altres = altresSheet?.get(ccaaRaw)?.get(any) || 0;
      const ocup = ocupacioSheet?.get(ccaaRaw)?.get(any) || 0;

      result.push({
        nom: ccaaNorm,
        any,
        lanzaments_total: total,
        lanzaments_hipotecaria: eh,
        lanzaments_lau: lau,
        lanzaments_altres: altres,
        ocupacio_verbal: ocup,
        evolucio_percentual: null,
        poblacio: null,
        taxa_per_100k: null,
      });
    }
  }

  // Extreure evolució i per-càpita del full total
  if (totalSheetName) {
    parseEvolucioPoblacio(workbook, totalSheetName, result);
  }

  return result;
}

/**
 * Parseja un full de llançaments CGPJ.
 * Estructura detectada:
 *   - Full "total": CCAA a col 0, anys a col 1+
 *   - Fulls de desglossament (EH, LAU, Otros): CCAA a col 1, anys a col 2+
 *   - El nom de CCAA pot estar en MAJÚSCULES
 * Retorna Map<ccaa_nom_original, Map<any, valor>>
 */
function parseLanzamientosSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
): Map<string, Map<number, number>> | null {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return null;

  const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  const result = new Map<string, Map<number, number>>();

  // Detectar la fila capçalera (conté anys com 2023, 2024, 2025)
  let headerRow = -1;
  let nameCol = -1;  // Columna on trobar el nom de la CCAA

  for (let i = 0; i < Math.min(10, json.length); i++) {
    const row = json[i];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      if (typeof row[c] === 'number' && row[c] >= 2018 && row[c] <= 2030) {
        headerRow = i;
        break;
      }
    }
    if (headerRow >= 0) break;
  }

  if (headerRow === -1) return null;

  const headers = json[headerRow];

  // Trobar les columnes d'anys
  const anyCols: { col: number; any: number }[] = [];
  for (let c = 0; c < headers.length; c++) {
    if (typeof headers[c] === 'number' && headers[c] >= 2018 && headers[c] <= 2030) {
      anyCols.push({ col: c, any: headers[c] });
    }
  }

  if (anyCols.length === 0) return null;

  // Detectar en quina columna estan els noms de CCAA mirant la primera fila de dades
  // Pot ser col 0 (full total) o col 1 (fulls de desglossament)
  for (let i = headerRow + 1; i < Math.min(headerRow + 5, json.length); i++) {
    const row = json[i];
    if (!row) continue;
    for (let c = 0; c < Math.min(3, row.length); c++) {
      if (typeof row[c] === 'string' && row[c].trim().length > 2) {
        const nom = row[c].trim().toUpperCase();
        if (normalizeCCAA(nom)) {
          nameCol = c;
          break;
        }
      }
    }
    if (nameCol >= 0) break;
  }

  if (nameCol < 0) {
    console.warn(`  ⚠️ No s'ha pogut determinar la columna de noms a "${sheetName}"`);
    return null;
  }

  // Llegir files de CCAA
  for (let i = headerRow + 1; i < Math.min(headerRow + 25, json.length); i++) {
    const row = json[i];
    if (!row || !row[nameCol]) continue;

    const nom = String(row[nameCol]).trim();
    if (nom.toUpperCase().includes('TOTAL') || nom === '') break;
    if (nom.toUpperCase().includes('EVOLUC') || nom.toUpperCase().includes('TASA') || nom.toUpperCase().includes('POR 100')) break;

    const anyMap = new Map<number, number>();
    for (const ac of anyCols) {
      const v = row[ac.col];
      if (typeof v === 'number') {
        anyMap.set(ac.any, Math.round(v));
      }
    }

    if (anyMap.size > 0) {
      result.set(nom, anyMap);
    }
  }

  return result;
}

/**
 * Parseja les seccions d'evolució % i per-càpita del full total
 */
function parseEvolucioPoblacio(
  workbook: XLSX.WorkBook,
  sheetName: string,
  dades: DadesCCAA[],
): void {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return;

  const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  // Buscar la secció "Evolución" (files ~28-46)
  // Buscar "Tasa" o "100.000" per la secció per-càpita (files ~52-70)
  let evolucioStart = -1;
  let taxaStart = -1;

  for (let i = 0; i < json.length; i++) {
    const row = json[i];
    if (!row || !row[0]) continue;
    const label = String(row[0]).trim().toUpperCase();

    if (label.includes('EVOLUC') && evolucioStart === -1) {
      // La fila següent amb anys és l'inici real
      evolucioStart = i;
    }
    if ((label.includes('TASA') || label.includes('100.000') || label.includes('POR 100')) && taxaStart === -1) {
      taxaStart = i;
    }
  }

  // Per ara, les dades d'evolució es calcularan des dels valors absoluts
  // i la taxa es calcularà si tenim població

  // Buscar la secció de població (normalment dins la secció de taxa)
  if (taxaStart !== -1) {
    // Buscar "Población" dins la secció
    for (let i = taxaStart; i < Math.min(taxaStart + 30, json.length); i++) {
      const row = json[i];
      if (!row) continue;

      // Files de CCAA amb taxa
      const nom = row[0] ? String(row[0]).trim() : '';
      if (!nom || nom.toUpperCase().includes('TOTAL') || nom.toUpperCase().includes('TASA')) continue;

      const ccaaNorm = normalizeCCAA(nom);
      if (!ccaaNorm) continue;

      // Buscar si hi ha columna de taxa i població
      // La taxa típicament és l'última columna numérica de la secció
      for (const d of dades) {
        if (d.nom === ccaaNorm) {
          // Intentar assinar taxa si coincideix
          for (let c = 1; c < row.length; c++) {
            if (typeof row[c] === 'number' && row[c] > 0 && row[c] < 500) {
              // Probablement una taxa per 100k
              d.taxa_per_100k = row[c];
            }
            if (typeof row[c] === 'number' && row[c] > 100000) {
              // Probablement població
              d.poblacio = row[c];
            }
          }
        }
      }
    }
  }
}

// ===== Parseig de dades per Província =====

function parseProvinciaData(workbook: XLSX.WorkBook): DadesProvincia[] {
  const result: DadesProvincia[] = [];

  // Full "Provincias" — totes les dades per província de l'últim any
  const provSheetName = findSheet(workbook, 'provincia');
  if (!provSheetName) {
    console.warn('⚠️ Full "Provincias" no trobat');
    return result;
  }
  const sheet = workbook.Sheets[provSheetName];
  if (!sheet) return result;

  const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  // El full "Provincias" té estructura:
  //   Col 0: TSJ (agrupador, buit per la majoria de files)
  //   Col 1: Nom de la província (en MAJÚSCULES)
  //   Col 2+: Dades numèriques
  // Capçalera (fila 3 aprox): noms de columnes llargs
  // Les dades comencen a la fila 5+ fins a "TOTAL"

  // Buscar capçalera
  let headerRow = -1;
  for (let i = 0; i < Math.min(10, json.length); i++) {
    const row = json[i];
    if (!row) continue;
    const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ');
    if (rowStr.includes('lanzamiento') || rowStr.includes('concurso')) {
      headerRow = i;
      break;
    }
  }

  if (headerRow === -1) headerRow = 3;

  const headers = json[headerRow] || [];

  // Detectar columnes per text de capçalera
  const colMap = {
    concursos: -1,
    execHipot: -1,
    monitoris: -1,
    lanzTotal: -1,
    lanzEH: -1,
    lanzLAU: -1,
    lanzAltres: -1,
    ocupacio: -1,
  };

  for (let c = 0; c < headers.length; c++) {
    const h = String(headers[c] || '').toLowerCase();
    if (h.includes('total') && h.includes('concurso')) colMap.concursos = c;
    else if (h.includes('ejecucion') && h.includes('hipotecaria')) colMap.execHipot = c;
    else if (h.includes('monitorio')) colMap.monitoris = c;
    else if (h.includes('total') && h.includes('lanzamiento')) colMap.lanzTotal = c;
    else if (h.includes('lanzamiento') && h.includes('eh')) colMap.lanzEH = c;
    else if ((h.includes('lanzamiento') && h.includes('lau')) || (h.includes('derivado') && h.includes('lau'))) colMap.lanzLAU = c;
    else if (h.includes('resto') && h.includes('lanzamiento')) colMap.lanzAltres = c;
    else if (h.includes('ocupaci')) colMap.ocupacio = c;
  }

  // Si no hem trobat per text, intentar posicions absolutes (basades en l'estructura CGPJ 2024)
  if (colMap.lanzTotal === -1) {
    colMap.concursos = 5;
    colMap.execHipot = 8;
    colMap.monitoris = 9;
    colMap.lanzTotal = 10;
    colMap.lanzEH = 11;
    colMap.lanzLAU = 12;
    colMap.lanzAltres = 13;
    colMap.ocupacio = 15;
  }

  console.log(`  Columnes provincials: total=${colMap.lanzTotal} EH=${colMap.lanzEH} LAU=${colMap.lanzLAU} Alt=${colMap.lanzAltres} Ocup=${colMap.ocupacio}`);

  // Detectar la columna de nom de província (pot ser col 0 o col 1)
  let nameCol = 1;  // Per defecte col 1 (el més habitual al CGPJ)
  for (let i = headerRow + 1; i < Math.min(headerRow + 10, json.length); i++) {
    const row = json[i];
    if (!row) continue;
    // Provar col 1 primer, després col 0
    for (const c of [1, 0]) {
      if (typeof row[c] === 'string' && row[c].trim().length > 2) {
        if (normalizeProvincia(row[c].trim())) {
          nameCol = c;
          break;
        }
      }
    }
    if (nameCol >= 0) break;
  }

  // Llegir files de províncies
  for (let i = headerRow + 1; i < json.length; i++) {
    const row = json[i];
    if (!row) continue;

    const rawNom = row[nameCol] ? String(row[nameCol]).trim() : '';
    if (!rawNom) continue;
    if (rawNom.toUpperCase().includes('TOTAL') || rawNom.toUpperCase().includes('NACIONAL')) break;

    const provInfo = normalizeProvincia(rawNom);
    if (!provInfo) continue;  // Skip TSJ separadors o files no reconegudes

    const getVal = (col: number) => {
      if (col < 0 || col >= row.length) return 0;
      const v = row[col];
      return typeof v === 'number' ? Math.round(v) : 0;
    };

    result.push({
      nom: provInfo.nom,
      any: 0,
      lanzaments_total: getVal(colMap.lanzTotal),
      lanzaments_hipotecaria: getVal(colMap.lanzEH),
      lanzaments_lau: getVal(colMap.lanzLAU),
      lanzaments_altres: getVal(colMap.lanzAltres),
      ocupacio_verbal: getVal(colMap.ocupacio),
      execucions_hipotecaries: getVal(colMap.execHipot),
      concursos_total: getVal(colMap.concursos),
      monitoris: getVal(colMap.monitoris),
    });
  }

  return result;
}

// ===== Inserció a la BD =====

function insertCGPJData(ccaaData: DadesCCAA[], provData: DadesProvincia[]): number {
  const db = getDB();
  let count = 0;

  const insert = db.prepare(`
    INSERT OR REPLACE INTO estadistiques_cgpj 
      (ambit, nom, any, lanzaments_total, lanzaments_hipotecaria, lanzaments_lau,
       lanzaments_altres, ocupacio_verbal, evolucio_percentual, poblacio, taxa_per_100k,
       execucions_hipotecaries, concursos_total, monitoris)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const runInsert = db.transaction(() => {
    // Inserir dades CCAA
    for (const d of ccaaData) {
      insert.run(
        'ccaa', d.nom, d.any,
        d.lanzaments_total, d.lanzaments_hipotecaria, d.lanzaments_lau,
        d.lanzaments_altres, d.ocupacio_verbal,
        d.evolucio_percentual, d.poblacio, d.taxa_per_100k,
        null, null, null,  // Camps de província
      );
      count++;
    }

    // Inserir dades de província
    for (const d of provData) {
      insert.run(
        'provincia', d.nom, d.any,
        d.lanzaments_total, d.lanzaments_hipotecaria, d.lanzaments_lau,
        d.lanzaments_altres, d.ocupacio_verbal,
        null, null, null,  // Camps de CCAA (evolucio, poblacio, taxa)
        d.execucions_hipotecaries, d.concursos_total, d.monitoris,
      );
      count++;
    }
  });

  runInsert();
  return count;
}

// ===== Calcular evolució interanual =====

function calcularEvolucio(): void {
  const db = getDB();

  // Per cada CCAA, calcular evolució respecte a l'any anterior
  const anys = db.prepare(`
    SELECT DISTINCT any FROM estadistiques_cgpj WHERE ambit = 'ccaa' ORDER BY any ASC
  `).all() as { any: number }[];

  for (let i = 1; i < anys.length; i++) {
    const anyActual = anys[i].any;
    const anyAnterior = anys[i - 1].any;

    db.exec(`
      UPDATE estadistiques_cgpj AS c
      SET evolucio_percentual = ROUND(
        ((c.lanzaments_total - prev.lanzaments_total) * 100.0 / prev.lanzaments_total), 1
      )
      FROM estadistiques_cgpj AS prev
      WHERE c.ambit = 'ccaa'
        AND c.any = ${anyActual}
        AND prev.ambit = 'ccaa'
        AND prev.any = ${anyAnterior}
        AND prev.nom = c.nom
        AND prev.lanzaments_total > 0
    `);
  }

  console.log('📊 Evolució interanual calculada');
}

// ===== Main =====

async function main() {
  const args = process.argv.slice(2);
  const fetchAll = args.includes('--all');
  const yearArg = args.find(a => a.startsWith('--year'))
    ? parseInt(args[args.indexOf('--year') + 1] || '')
    : null;

  console.log('⚖️  Alerta Desnona — Importació de dades CGPJ');
  console.log('   Font: Consejo General del Poder Judicial');
  console.log('   Dades: Llançaments judicials (desnonaments executats)');
  console.log('   Llicència: Dades públiques del Poder Judicial\n');

  try {
    initDB();

    // Determinar quins anys descarregar
    let yearsToFetch: number[];
    if (fetchAll) {
      yearsToFetch = [...ANYS_DISPONIBLES];
    } else if (yearArg && ANYS_DISPONIBLES.includes(yearArg)) {
      yearsToFetch = [yearArg];
    } else {
      // Per defecte, l'últim disponible (conté dades de 2 anys)
      yearsToFetch = [ANYS_DISPONIBLES[ANYS_DISPONIBLES.length - 1]];
    }

    console.log(`📅 Anys a processar: ${yearsToFetch.join(', ')}\n`);

    let totalRecords = 0;

    for (const year of yearsToFetch) {
      console.log(`\n${'─'.repeat(50)}`);
      console.log(`📅 Processant fitxer Anual ${year}`);
      console.log('─'.repeat(50));

      try {
        const buffer = await downloadExcel(year);
        const workbook = XLSX.read(buffer, { type: 'array' });

        console.log(`📄 Fulls trobats: ${workbook.SheetNames.length}`);

        // Parsejar dades CCAA
        const ccaaData = parseAllCCAAData(workbook);
        console.log(`📊 Dades CCAA: ${ccaaData.length} registres`);

        // Parsejar dades per província
        const provData = parseProvinciaData(workbook);

        // Determinar l'any de les dades provincials a partir de les CCAA
        // El fitxer "Anual 2025" conté dades 2024 i 2025
        // Les províncies solen ser de l'últim any del fitxer
        const maxAny = ccaaData.reduce((max, d) => Math.max(max, d.any), 0);
        for (const p of provData) {
          p.any = maxAny || year;
        }

        console.log(`📊 Dades provincials: ${provData.length} províncies (any ${maxAny || year})`);

        // Inserir a la BD
        const count = insertCGPJData(ccaaData, provData);
        totalRecords += count;
        console.log(`✅ ${count} registres inserits`);

        // Mostrar resum de dades CCAA
        const latestYear = ccaaData.filter(d => d.any === maxAny);
        if (latestYear.length > 0) {
          const totalLanz = latestYear.reduce((s, d) => s + d.lanzaments_total, 0);
          const totalEH = latestYear.reduce((s, d) => s + d.lanzaments_hipotecaria, 0);
          const totalLAU = latestYear.reduce((s, d) => s + d.lanzaments_lau, 0);
          const totalAltres = latestYear.reduce((s, d) => s + d.lanzaments_altres, 0);

          console.log(`\n📋 Resum ${maxAny}:`);
          console.log(`  Total llançaments: ${totalLanz.toLocaleString('ca-ES')}`);
          console.log(`  → Hipotecaris:     ${totalEH.toLocaleString('ca-ES')} (${((totalEH / totalLanz) * 100).toFixed(1)}%)`);
          console.log(`  → Lloguer (LAU):   ${totalLAU.toLocaleString('ca-ES')} (${((totalLAU / totalLanz) * 100).toFixed(1)}%)`);
          console.log(`  → Altres:          ${totalAltres.toLocaleString('ca-ES')} (${((totalAltres / totalLanz) * 100).toFixed(1)}%)`);

          console.log('\n  Per CCAA (top 5):');
          latestYear.sort((a, b) => b.lanzaments_total - a.lanzaments_total);
          for (const d of latestYear.slice(0, 5)) {
            console.log(`    ${d.nom.padEnd(30)} ${String(d.lanzaments_total).padStart(6)}`);
          }
        }
      } catch (err: any) {
        console.error(`❌ Error processant any ${year}: ${err.message}`);
      }
    }

    // Calcular evolucions interanuals
    calcularEvolucio();

    console.log(`\n${'═'.repeat(50)}`);
    console.log(`🎉 Importació CGPJ completada: ${totalRecords} registres totals`);
    console.log('═'.repeat(50));

    // Mostrar resum final de la BD
    const db = getDB();
    const resum = db.prepare(`
      SELECT ambit, COUNT(*) as registres, 
             MIN(any) as primer_any, MAX(any) as ultim_any,
             SUM(lanzaments_total) as total_lanzaments
      FROM estadistiques_cgpj
      GROUP BY ambit
    `).all() as any[];

    console.log('\n📊 Contingut BD:');
    for (const r of resum) {
      console.log(`  ${r.ambit}: ${r.registres} registres (${r.primer_any}-${r.ultim_any}), sum=${r.total_lanzaments?.toLocaleString('ca-ES')}`);
    }

  } catch (error) {
    console.error('❌ Error durant la importació CGPJ:', error);
    process.exit(1);
  }
}

main();
