/**
 * DEDUP — Detecta i marca desnonaments duplicats.
 *
 * Estratègia (de més segur a més incert):
 *
 *   FASE 1 — Fingerprint exacte (sense IA, sense cost):
 *     Mateixa adreça (mateixa lat/lng amb tolerància 0.0001 ≈ 11m)
 *     + mateixa data_desnonament
 *     + mateix jutjat (o NULL als dos costats)
 *     ⇒ duplicat segur. Es manté el més antic (creat_el ASC).
 *
 *   FASE 2 — Mateix `inscripcio_registral` o `idufir`:
 *     Si dos casos comparteixen aquests identificadors únics del registre
 *     ⇒ duplicat segur (és la mateixa finca i, si la data també coincideix,
 *     el mateix procediment).
 *
 *   FASE 3 — LLM (Gemini) per a candidats ambigus:
 *     Casos amb mateixa lat/lng però dates diferents (potser és un
 *     procediment refet o realment dos casos diferents). Pregunta a l'IA.
 *
 * Marca la columna `duplicat_de` apuntant a l'ID del cas canònic.
 *
 * Usage:
 *   npx tsx src/dedup-desnonaments.ts
 *   npx tsx src/dedup-desnonaments.ts --skip-llm  # només fases 1+2
 *   npx tsx src/dedup-desnonaments.ts --dry-run
 */

import 'dotenv/config';
import { initDB, getDB } from './db/database';
import OpenAI from 'openai';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_LLM = args.includes('--skip-llm');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'ollama',
  baseURL: process.env.AI_BASE_URL || undefined,
});
const AI_MODEL = process.env.AI_MODEL || 'gemini-2.0-flash';

interface Cas {
  id: string;
  adreca_id: string;
  latitud: number | null;
  longitud: number | null;
  data_desnonament: string | null;
  jutjat: string | null;
  num_procediment: string | null;
  inscripcio_registral: string | null;
  idufir: string | null;
  creat_el: string;
  descripcio: string | null;
}

function markDup(stmt: any, dupId: string, canonicalId: string): void {
  if (DRY_RUN) return;
  stmt.run(canonicalId, dupId);
}

async function main() {
  initDB();
  const db = getDB();

  const updateDup = db.prepare(`
    UPDATE desnonaments SET duplicat_de = ?, actualitzat_el = datetime('now') WHERE id = ?
  `);

  console.log('🧹 DEDUP — Detecció de desnonaments duplicats');
  if (DRY_RUN) console.log('🏃 DRY RUN — no es marcarà res');
  console.log('');

  // ────────────────────────────────────────────────────────────
  // FASE 1: Fingerprint = adreca_id + data_desnonament + jutjat
  // ────────────────────────────────────────────────────────────
  console.log('▶ Fase 1: Fingerprint exacte (adreça + data + jutjat)');

  const groups1 = db.prepare(`
    SELECT
      adreca_id,
      data_desnonament,
      COALESCE(jutjat, '') AS jutjat_key,
      COUNT(*) AS n,
      GROUP_CONCAT(id || '|' || creat_el, '##') AS ids_creats
    FROM desnonaments
    WHERE duplicat_de IS NULL
      AND adreca_id IS NOT NULL
      AND data_desnonament IS NOT NULL
    GROUP BY adreca_id, data_desnonament, jutjat_key
    HAVING n > 1
  `).all() as Array<{ adreca_id: string; data_desnonament: string; jutjat_key: string; n: number; ids_creats: string }>;

  let phase1Marked = 0;
  for (const g of groups1) {
    const items = g.ids_creats.split('##').map(s => {
      const [id, creat_el] = s.split('|');
      return { id, creat_el };
    }).sort((a, b) => a.creat_el.localeCompare(b.creat_el));
    const canonical = items[0];
    for (const dup of items.slice(1)) {
      markDup(updateDup, dup.id, canonical.id);
      phase1Marked++;
    }
  }
  console.log(`  ✅ Marcats ${phase1Marked} duplicats en ${groups1.length} grups`);

  // ────────────────────────────────────────────────────────────
  // FASE 2: Mateix idufir o inscripcio_registral
  // ────────────────────────────────────────────────────────────
  console.log('\n▶ Fase 2: Identificadors registrals (idufir / inscripcio_registral)');

  let phase2Marked = 0;
  for (const col of ['idufir', 'inscripcio_registral']) {
    const groups = db.prepare(`
      SELECT
        ${col} AS key,
        COUNT(*) AS n,
        GROUP_CONCAT(id || '|' || creat_el, '##') AS ids_creats
      FROM desnonaments
      WHERE duplicat_de IS NULL
        AND ${col} IS NOT NULL
        AND length(${col}) >= 8
      GROUP BY ${col}
      HAVING n > 1
    `).all() as Array<{ key: string; n: number; ids_creats: string }>;

    for (const g of groups) {
      const items = g.ids_creats.split('##').map(s => {
        const [id, creat_el] = s.split('|');
        return { id, creat_el };
      }).sort((a, b) => a.creat_el.localeCompare(b.creat_el));
      const canonical = items[0];
      for (const dup of items.slice(1)) {
        markDup(updateDup, dup.id, canonical.id);
        phase2Marked++;
      }
    }
  }
  console.log(`  ✅ Marcats ${phase2Marked} duplicats addicionals`);

  // ────────────────────────────────────────────────────────────
  // FASE 3: LLM per candidats ambigus
  //   Mateix adreca_id + mateix mes (però data diferent)
  // ────────────────────────────────────────────────────────────
  if (SKIP_LLM) {
    console.log('\n⏭️  Fase 3 (LLM): omesa (--skip-llm)');
  } else if (!process.env.OPENAI_API_KEY) {
    console.log('\n⏭️  Fase 3 (LLM): omesa (sense OPENAI_API_KEY)');
  } else {
    console.log('\n▶ Fase 3: Candidats ambigus (mateixa adreça + mes proper) → IA');

    const candidates = db.prepare(`
      SELECT
        adreca_id,
        substr(data_desnonament, 1, 7) AS month_key,
        COUNT(*) AS n,
        GROUP_CONCAT(id, '##') AS ids
      FROM desnonaments
      WHERE duplicat_de IS NULL
        AND adreca_id IS NOT NULL
        AND data_desnonament IS NOT NULL
      GROUP BY adreca_id, month_key
      HAVING n > 1
    `).all() as Array<{ adreca_id: string; month_key: string; n: number; ids: string }>;

    console.log(`  Candidats: ${candidates.length} grups (mateixa adreça + mes)`);

    let phase3Marked = 0;
    let llmCalls = 0;
    const detailStmt = db.prepare(`
      SELECT d.id, d.adreca_id, a.latitud, a.longitud, d.data_desnonament, d.jutjat,
             d.num_procediment, d.inscripcio_registral, d.idufir, d.creat_el, d.descripcio
      FROM desnonaments d
      LEFT JOIN adreces a ON a.id = d.adreca_id
      WHERE d.id = ?
    `);

    for (const grp of candidates) {
      const ids = grp.ids.split('##');
      const cases: Cas[] = ids.map(id => detailStmt.get(id) as Cas).filter(Boolean);
      if (cases.length < 2) continue;

      // Demana a l'IA quins són duplicats entre ells
      const prompt = cases.map((c, i) => `[${i + 1}] data=${c.data_desnonament} jutjat="${c.jutjat || ''}" proc="${c.num_procediment || ''}" desc="${(c.descripcio || '').slice(0, 200).replace(/\s+/g, ' ')}"`).join('\n');

      try {
        const resp = await openai.chat.completions.create({
          model: AI_MODEL,
          temperature: 0,
          max_tokens: 500,
          messages: [
            {
              role: 'system',
              content: `Ets un expert en procediments judicials espanyols. Et donaré una llista numerada de casos de desnonament que tenen LA MATEIXA ADREÇA i van al MATEIX MES. Has de decidir quins casos són EL MATEIX procediment (duplicats per re-publicació, edicte i acta, suspensió i represa, etc.) i quins són casos DIFERENTS.

Retorna un JSON: {"groups": [[1,3], [2]], "reason": "breu"}
Cada subarray és un grup de casos que són EL MATEIX. Si tots són diferents, retorna grups d'un sol element. Si dubtes, considera'ls DIFERENTS (és més segur). Respon NOMÉS amb JSON.`,
            },
            { role: 'user', content: prompt },
          ],
        });
        llmCalls++;
        const content = resp.choices[0]?.message?.content || '';
        const m = content.match(/\{[\s\S]*"groups"[\s\S]*\}/);
        if (!m) continue;
        const parsed = JSON.parse(m[0]) as { groups: number[][] };
        for (const group of parsed.groups || []) {
          if (group.length < 2) continue;
          const sorted = group.map(i => cases[i - 1]).filter(Boolean).sort((a, b) => a.creat_el.localeCompare(b.creat_el));
          if (sorted.length < 2) continue;
          const canonical = sorted[0];
          for (const dup of sorted.slice(1)) {
            markDup(updateDup, dup.id, canonical.id);
            phase3Marked++;
          }
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
          console.warn('  ⚠️  Rate limit IA — esperant 30s...');
          await new Promise(r => setTimeout(r, 30000));
        } else {
          console.warn(`  ⚠️  Error IA grup ${grp.adreca_id.slice(0, 8)}: ${msg.slice(0, 120)}`);
        }
      }
    }
    console.log(`  ✅ Marcats ${phase3Marked} duplicats addicionals (${llmCalls} crides IA)`);
  }

  // ────────────────────────────────────────────────────────────
  // Resum
  // ────────────────────────────────────────────────────────────
  const totals = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM desnonaments) AS total,
      (SELECT COUNT(*) FROM desnonaments WHERE duplicat_de IS NOT NULL) AS dups,
      (SELECT COUNT(*) FROM desnonaments WHERE duplicat_de IS NULL) AS canonics
  `).get() as { total: number; dups: number; canonics: number };

  console.log('\n' + '═'.repeat(50));
  console.log('📊 RESUM DEDUP');
  console.log(`  Total desnonaments:   ${totals.total}`);
  console.log(`  Marcats com a dup:    ${totals.dups}`);
  console.log(`  Canònics (visibles):  ${totals.canonics}`);
  console.log('═'.repeat(50));
}

main().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});
