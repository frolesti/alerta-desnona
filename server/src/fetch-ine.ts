/**
 * Fetcher de dades REALS de l'INE (Instituto Nacional de Estadística)
 * 
 * Font: Estadística sobre Ejecuciones Hipotecarias (EH)
 * Taula 10743: Ejecuciones hipotecarias iniciadas e inscritas en los registros 
 *              de la propiedad sobre fincas rústicas y urbanas por provincia
 * 
 * API pública: https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/10743?tip=AM
 * Llicència: CC BY-SA 4.0 — INE (Instituto Nacional de Estadística)
 * 
 * Execució: npx tsx src/fetch-ine.ts
 */

import { initDB, getDB } from './db/database';

// ===== Mapatge de codis INE de província a comunitat autònoma =====
const PROVINCIA_A_COMUNITAT: Record<string, { comunitat: string; nom_ca: string }> = {
  '01': { comunitat: 'Euskadi', nom_ca: 'Araba/Àlaba' },
  '02': { comunitat: 'Castilla-La Mancha', nom_ca: 'Albacete' },
  '03': { comunitat: 'Comunitat Valenciana', nom_ca: 'Alacant/Alicante' },
  '04': { comunitat: 'Andalucía', nom_ca: 'Almería' },
  '05': { comunitat: 'Castilla y León', nom_ca: 'Àvila' },
  '06': { comunitat: 'Extremadura', nom_ca: 'Badajoz' },
  '07': { comunitat: 'Illes Balears', nom_ca: 'Illes Balears' },
  '08': { comunitat: 'Catalunya', nom_ca: 'Barcelona' },
  '09': { comunitat: 'Castilla y León', nom_ca: 'Burgos' },
  '10': { comunitat: 'Extremadura', nom_ca: 'Càceres' },
  '11': { comunitat: 'Andalucía', nom_ca: 'Cadis' },
  '12': { comunitat: 'Comunitat Valenciana', nom_ca: 'Castelló' },
  '13': { comunitat: 'Castilla-La Mancha', nom_ca: 'Ciudad Real' },
  '14': { comunitat: 'Andalucía', nom_ca: 'Còrdova' },
  '15': { comunitat: 'Galicia', nom_ca: 'A Coruña' },
  '16': { comunitat: 'Castilla-La Mancha', nom_ca: 'Conca' },
  '17': { comunitat: 'Catalunya', nom_ca: 'Girona' },
  '18': { comunitat: 'Andalucía', nom_ca: 'Granada' },
  '19': { comunitat: 'Castilla-La Mancha', nom_ca: 'Guadalajara' },
  '20': { comunitat: 'Euskadi', nom_ca: 'Gipuzkoa' },
  '21': { comunitat: 'Andalucía', nom_ca: 'Huelva' },
  '22': { comunitat: 'Aragón', nom_ca: 'Osca' },
  '23': { comunitat: 'Andalucía', nom_ca: 'Jaén' },
  '24': { comunitat: 'Castilla y León', nom_ca: 'Lleó' },
  '25': { comunitat: 'Catalunya', nom_ca: 'Lleida' },
  '26': { comunitat: 'La Rioja', nom_ca: 'La Rioja' },
  '27': { comunitat: 'Galicia', nom_ca: 'Lugo' },
  '28': { comunitat: 'Comunidad de Madrid', nom_ca: 'Madrid' },
  '29': { comunitat: 'Andalucía', nom_ca: 'Màlaga' },
  '30': { comunitat: 'Región de Murcia', nom_ca: 'Múrcia' },
  '31': { comunitat: 'Comunidad Foral de Navarra', nom_ca: 'Navarra' },
  '32': { comunitat: 'Galicia', nom_ca: 'Ourense' },
  '33': { comunitat: 'Principado de Asturias', nom_ca: 'Astúries' },
  '34': { comunitat: 'Castilla y León', nom_ca: 'Palència' },
  '35': { comunitat: 'Canarias', nom_ca: 'Las Palmas' },
  '36': { comunitat: 'Galicia', nom_ca: 'Pontevedra' },
  '37': { comunitat: 'Castilla y León', nom_ca: 'Salamanca' },
  '38': { comunitat: 'Canarias', nom_ca: 'Santa Cruz de Tenerife' },
  '39': { comunitat: 'Cantabria', nom_ca: 'Cantàbria' },
  '40': { comunitat: 'Castilla y León', nom_ca: 'Segòvia' },
  '41': { comunitat: 'Andalucía', nom_ca: 'Sevilla' },
  '42': { comunitat: 'Castilla y León', nom_ca: 'Sòria' },
  '43': { comunitat: 'Catalunya', nom_ca: 'Tarragona' },
  '44': { comunitat: 'Aragón', nom_ca: 'Terol' },
  '45': { comunitat: 'Castilla-La Mancha', nom_ca: 'Toledo' },
  '46': { comunitat: 'Comunitat Valenciana', nom_ca: 'València' },
  '47': { comunitat: 'Castilla y León', nom_ca: 'Valladolid' },
  '48': { comunitat: 'Euskadi', nom_ca: 'Bizkaia' },
  '49': { comunitat: 'Castilla y León', nom_ca: 'Zamora' },
  '50': { comunitat: 'Aragón', nom_ca: 'Saragossa' },
  '51': { comunitat: 'Ceuta', nom_ca: 'Ceuta' },
  '52': { comunitat: 'Melilla', nom_ca: 'Melilla' },
};

// Tipus de finca per ID de metadada
const NATURALESA_FINCA_IDS: Record<number, string> = {
  12362: 'total',        // Total fincas
  12368: 'rustiques',    // Total fincas rústicas
  12374: 'vivendes',     // Fincas urbanas: viviendas
  12375: 'solars',       // Fincas urbanas: solares
  12376: 'altres',       // Fincas urbanas: otros
};

interface INEMetaData {
  Id: number;
  T3_Variable: string;
  Nombre: string;
  Codigo: string;
}

interface INEDataPoint {
  Fecha: string;
  T3_TipoDato: string;
  T3_Periodo: string;
  Anyo: number;
  Valor: number;
}

interface YearData {
  total: number;
  rustiques: number;
  vivendes: number;
  solars: number;
  altres: number;
  tipus_dada: string;
  [key: string]: number | string;
}

interface INESerie {
  COD: string;
  Nombre: string;
  T3_Unidad: string;
  T3_Escala: string;
  MetaData: INEMetaData[];
  Data: INEDataPoint[];
}

async function fetchINEData(): Promise<INESerie[]> {
  const url = 'https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/10743?tip=AM';
  console.log(`📡 Descarregant dades de l'INE: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'AlertaDesnona/1.0 (projecte social open-source)',
    },
  });

  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json() as INESerie[];
  console.log(`✅ Rebudes ${data.length} sèries de dades`);
  return data;
}

function parseINEData(series: INESerie[]): Map<string, Map<number, YearData>> {
  // Map: codiProvincia -> any -> { total, rustiques, vivendes, solars, altres }
  const result = new Map<string, Map<number, YearData>>();

  for (const serie of series) {
    // Trobar codi de província
    const provinciaMetadata = serie.MetaData.find(m => m.T3_Variable === 'Provincias');
    if (!provinciaMetadata) continue;
    const codiProvincia = provinciaMetadata.Codigo;
    if (!codiProvincia || codiProvincia === '' || codiProvincia === '00') continue; // Skip nacional totals

    // Trobar tipus de finca
    const fincaMetadata = serie.MetaData.find(m => m.T3_Variable === 'Naturaleza de la finca');
    if (!fincaMetadata) continue;
    const tipusFinca = NATURALESA_FINCA_IDS[fincaMetadata.Id];
    if (!tipusFinca) continue;

    // Processar cada punt de dades (any)
    for (const dp of serie.Data) {
      if (dp.T3_Periodo !== 'A') continue; // Només dades anuals
      if (dp.Valor === null || dp.Valor === undefined) continue;

      if (!result.has(codiProvincia)) {
        result.set(codiProvincia, new Map());
      }
      const provinciaData = result.get(codiProvincia)!;
      
      if (!provinciaData.has(dp.Anyo)) {
        provinciaData.set(dp.Anyo, {
          total: 0, rustiques: 0, vivendes: 0, solars: 0, altres: 0,
          tipus_dada: dp.T3_TipoDato,
        });
      }
      const yearData = provinciaData.get(dp.Anyo)!;
      yearData[tipusFinca] = dp.Valor;
      yearData.tipus_dada = dp.T3_TipoDato;
    }
  }

  return result;
}

function insertIntoDB(parsedData: Map<string, Map<number, YearData>>): number {
  const db = getDB();
  
  // Netejar dades anteriors
  db.exec('DELETE FROM estadistiques_ine');
  
  const insert = db.prepare(`
    INSERT OR REPLACE INTO estadistiques_ine 
      (provincia, codi_provincia, comunitat_autonoma, any, trimestre,
       total_finques, finques_vivendes, finques_solars, finques_altres, finques_rustiques,
       tipus_dada, font, url_font)
    VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 
      'INE — Estadística sobre Ejecuciones Hipotecarias',
      'https://www.ine.es/jaxiT3/Tabla.htm?t=10743')
  `);

  let count = 0;
  const insertMany = db.transaction(() => {
    for (const [codiProvincia, anyData] of parsedData) {
      const info = PROVINCIA_A_COMUNITAT[codiProvincia];
      if (!info) {
        console.warn(`⚠️ Codi de província desconegut: ${codiProvincia}`);
        continue;
      }

      for (const [any_, valors] of anyData) {
        insert.run(
          info.nom_ca,
          codiProvincia,
          info.comunitat,
          any_,
          valors.total || 0,
          valors.vivendes || 0,
          valors.solars || 0,
          valors.altres || 0,
          valors.rustiques || 0,
          valors.tipus_dada || 'Definitivo',
        );
        count++;
      }
    }
  });

  insertMany();
  return count;
}

async function main() {
  console.log('🏠 Alerta Desnona — Importació de dades reals INE\n');
  console.log('   Font: Instituto Nacional de Estadística (INE)');
  console.log('   Taula: 10743 — Ejecuciones hipotecarias sobre fincas');
  console.log('   Llicència: CC BY-SA 4.0\n');

  try {
    initDB();
    
    const rawData = await fetchINEData();
    const parsed = parseINEData(rawData);
    
    console.log(`\n📊 Dades processades: ${parsed.size} províncies`);
    
    const count = insertIntoDB(parsed);
    console.log(`✅ ${count} registres inserits a la base de dades`);

    // Mostrar resum
    const db = getDB();
    const resum = db.prepare(`
      SELECT comunitat_autonoma, 
             SUM(finques_vivendes) as total_vivendes,
             MAX(any) as darrer_any
      FROM estadistiques_ine 
      WHERE any = (SELECT MAX(any) FROM estadistiques_ine)
      GROUP BY comunitat_autonoma 
      ORDER BY total_vivendes DESC
    `).all() as any[];

    console.log('\n📋 Resum per comunitat autònoma (darrer any disponible):');
    console.log('─'.repeat(60));
    for (const r of resum) {
      const bar = '█'.repeat(Math.ceil(r.total_vivendes / 100));
      console.log(`  ${r.comunitat_autonoma.padEnd(30)} ${String(r.total_vivendes).padStart(6)} vivendes ${bar}`);
    }

    const totalNacional = db.prepare(`
      SELECT SUM(finques_vivendes) as total, MAX(any) as any
      FROM estadistiques_ine 
      WHERE any = (SELECT MAX(any) FROM estadistiques_ine)
    `).get() as any;
    
    console.log('─'.repeat(60));
    console.log(`  ${'TOTAL NACIONAL'.padEnd(30)} ${String(totalNacional.total).padStart(6)} vivendes (${totalNacional.any})`);
    
    console.log('\n🎉 Importació completada amb èxit!');
    console.log('   Les dades són REALS i provenen de l\'INE (ine.es).\n');

  } catch (error) {
    console.error('❌ Error durant la importació:', error);
    process.exit(1);
  }
}

main();
