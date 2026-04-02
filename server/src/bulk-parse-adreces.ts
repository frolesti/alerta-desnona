/**
 * BULK PARSE: Normalitza TOTES les adreces pendents amb Gemini.
 *
 * Estratègia:
 *   1. Llegeix totes les adreces amb nom_via IS NULL
 *   2. Les envia a Gemini en batches de 50 (equilibri velocitat/fiabilitat)
 *   3. Escriu els resultats directament a la BD
 *   4. Si un batch falla, espera i reintenta (rate limit friendly)
 *   5. Mai falla completament — el que no es pot parsejar queda marcat
 *
 * Usage:
 *   npx tsx src/bulk-parse-adreces.ts
 *   npx tsx src/bulk-parse-adreces.ts --limit 500
 *   npx tsx src/bulk-parse-adreces.ts --batch-size 30
 */

import 'dotenv/config';
import { initDB, getDB } from './db/database';
import OpenAI from 'openai';

// ─── Config ─────────────────────────────────────────────────────

function getArg(name: string, fallback: string): number {
  const eqArg = process.argv.find(a => a.startsWith(`--${name}=`));
  if (eqArg) return parseInt(eqArg.split('=')[1], 10);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return parseInt(process.argv[idx + 1], 10);
  return parseInt(fallback, 10);
}

const BATCH_SIZE = getArg('batch-size', '30');
const LIMIT = getArg('limit', '999999');

const MAX_RETRIES = 5;
const BASE_WAIT_MS = 15000; // 15s base wait on rate limit
const INTER_BATCH_DELAY_MS = 2000; // petit delay entre batches

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'ollama',
  baseURL: process.env.AI_BASE_URL || undefined,
});
const AI_MODEL = process.env.AI_MODEL || 'gemini-2.0-flash';

// ─── System prompt optimitzat per batch ─────────────────────────

const SYSTEM_PROMPT = `Ets un expert en adreces postals d'Espanya. Interpretes adreces RAW del BOE (Boletín Oficial del Estado).

TASCA: Per cada adreça numerada, retorna un objecte JSON amb:
- tipus_via: forma completa (Calle, Avenida, Paseo, Plaza, Carrer, Passeig, Plaça, Rambla, Ronda, Camino, Carretera, Travesía, Urbanización, Partida, Polígono, Kalea, Gran Vía, Bulevar, Rúa, etc.) o null
- nom_via: nom net i ben capitalitzat, o null
- numero: número del portal (mai pis/porta), o null
- bloc: bloc si n'hi ha, o null
- escala: escala (Derecha, Izquierda, A, B...), o null
- pis: pis (1, 2, Bajo, Ático, Entresuelo, Sótano...), o null
- porta: porta/lletra, o null

REGLES:
- C/, CL → Calle | AV., AVDA → Avenida | PZ., PLZ → Plaza | CTRA → Carretera | URB → Urbanización | PG → Polígono | GV → Gran Vía | RBLA → Rambla
- Ignora text legal (FINCA, VIVIENDA, situado en, término municipal, etc.)
- Ignora CP i noms de ciutat
- "esc. dcha." → escala: "Derecha"
- No inventis res. Si no existeix, null.

RESPOSTA: JSON amb clau "r" (array d'objectes en el MATEIX ORDRE que les adreces d'entrada). RES MÉS.
Exemple: {"r":[{"tipus_via":"Calle","nom_via":"Mayor","numero":"5","bloc":null,"escala":null,"pis":"2","porta":"A"},{"tipus_via":null,"nom_via":null,"numero":null,"bloc":null,"escala":null,"pis":null,"porta":null}]}`;

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  initDB();
  const db = getDB();

  console.log('🚀 BULK PARSE — Normalització massiva d\'adreces amb IA\n');

  // 1. Llegir pendents (sense tipus_via = no parsejada correctament per IA)
  const unparsed = db.prepare(`
    SELECT id, adreca_original
    FROM adreces
    WHERE tipus_via IS NULL
      AND adreca_original IS NOT NULL
      AND length(adreca_original) >= 5
    ORDER BY creat_el DESC
  `).all() as Array<{ id: string; adreca_original: string }>;

  const toProcess = unparsed.slice(0, LIMIT);
  const totalBatches = Math.ceil(toProcess.length / BATCH_SIZE);

  console.log(`📊 Pendents: ${unparsed.length} | A processar: ${toProcess.length}`);
  console.log(`📦 Batches: ${totalBatches} × ${BATCH_SIZE} adreces`);
  console.log(`🤖 Model: ${AI_MODEL}\n`);

  if (toProcess.length === 0) {
    console.log('✅ Totes les adreces ja estan parsejades!');
    return;
  }

  // 2. Preparar update statement
  const updateStmt = db.prepare(`
    UPDATE adreces SET
      tipus_via = ?, nom_via = ?, numero = ?, bloc = ?, escala = ?, pis = ?, porta = ?,
      actualitzat_el = datetime('now')
    WHERE id = ?
  `);

  // Marcar les que no es poden parsejar (massa curtes, buides, etc.)
  const markUnparseable = db.prepare(`
    UPDATE adreces SET
      nom_via = '???',
      actualitzat_el = datetime('now')
    WHERE id = ?
  `);

  let totalOk = 0;
  let totalFail = 0;
  let totalSkipped = 0;
  const startTime = Date.now();

  // 3. Processar en batches
  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const start = batchIdx * BATCH_SIZE;
    const batch = toProcess.slice(start, start + BATCH_SIZE);

    const numbered = batch.map((a, i) => `${i + 1}. ${a.adreca_original.trim()}`).join('\n');

    let results: any[] | null = null;
    let retries = MAX_RETRIES;

    while (retries > 0 && !results) {
      try {
        const response = await openai.chat.completions.create({
          model: AI_MODEL,
          temperature: 0,
          max_tokens: 16384, // suficient per qualsevol batch (gemini-2.0-flash, sense thinking)
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: numbered },
          ],
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error('Resposta buida');

        // Detectar resposta truncada
        const finishReason = response.choices[0]?.finish_reason;
        if (finishReason === 'length') {
          throw new Error(`Resposta truncada (finish_reason=length, ${content.length} chars)`);
        }

        // Netejar resposta
        const cleaned = content
          .replace(/<think>[\s\S]*?<\/think>/gi, '')
          .replace(/```json\s*/gi, '')
          .replace(/```\s*/g, '')
          .trim();

        // Estratègia 0: JSON.parse directe (la resposta sencera és JSON)
        try {
          const parsed = JSON.parse(cleaned);
          const arr = parsed.r || parsed.adreces || parsed.results || parsed.addresses;
          if (Array.isArray(arr) && arr.length >= batch.length * 0.5) {
            results = arr;
          }
        } catch { /* no és JSON directe, provem regex */ }

        // Estratègia 1: Buscar {"r": [...]} amb regex
        if (!results) {
          const match1 = cleaned.match(/\{[\s\S]*"r"\s*:\s*\[[\s\S]*\]\s*\}/);
          if (match1) {
            try {
              const parsed = JSON.parse(match1[0]);
              if (Array.isArray(parsed.r) && parsed.r.length >= batch.length * 0.5) {
                results = parsed.r;
              }
            } catch { /* regex match but invalid JSON */ }
          }
        }

        // Estratègia 2: Buscar {"adreces": [...]} o {"results": [...]}
        if (!results) {
          const match2 = cleaned.match(/\{[\s\S]*"(?:adreces|results|addresses)"\s*:\s*\[[\s\S]*\]\s*\}/);
          if (match2) {
            try {
              const parsed = JSON.parse(match2[0]);
              const arr = parsed.adreces || parsed.results || parsed.addresses;
              if (Array.isArray(arr) && arr.length >= batch.length * 0.5) {
                results = arr;
              }
            } catch { /* no match */ }
          }
        }

        // Estratègia 3: Extreure objectes individuals
        if (!results) {
          const objects = [...cleaned.matchAll(/\{[^{}]*(?:"tipus_via"|"nom_via")[^{}]*\}/gs)];
          if (objects.length >= batch.length * 0.5) {
            results = objects.map(m => {
              try { return JSON.parse(m[0]); } catch { return null; }
            }).filter(Boolean);
          }
        }

        if (!results) {
          console.warn(`  🔍 DEBUG (${cleaned.length} chars): ${cleaned.slice(0, 200)}...`);
          throw new Error(`No s'ha pogut parsejar (${cleaned.length} chars)`);
        }

      } catch (err: any) {
        retries--;
        const msg = err?.message || String(err);

        if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('rate') || msg.includes('quota')) {
          const wait = BASE_WAIT_MS * (MAX_RETRIES - retries);
          console.warn(`  ⏳ Rate limit — esperant ${Math.round(wait / 1000)}s (intent ${MAX_RETRIES - retries}/${MAX_RETRIES})...`);
          await new Promise(r => setTimeout(r, wait));
        } else if (retries > 0) {
          console.warn(`  ⚠️  Error: ${msg.slice(0, 100)} — reintentant (${retries} left)...`);
          await new Promise(r => setTimeout(r, 3000));
        } else {
          console.error(`  ❌ BATCH ${batchIdx + 1} FALLIT: ${msg.slice(0, 100)}`);
        }
      }
    }

    // 4. Actualitzar BD
    if (results) {
      const updateBatch = db.transaction(() => {
        for (let j = 0; j < batch.length; j++) {
          const item = results![j];
          if (item && (item.tipus_via || item.nom_via)) {
            updateStmt.run(
              item.tipus_via || null,
              item.nom_via || null,
              item.numero || null,
              item.bloc || null,
              item.escala || null,
              item.pis || null,
              item.porta || null,
              batch[j].id,
            );
            totalOk++;
          } else {
            // Adreça no parsejable — marcar-la per no reprovar
            markUnparseable.run(batch[j].id);
            totalFail++;
          }
        }
      });
      updateBatch();
    } else {
      // Tot el batch ha fallat — saltar, no marcar (es reprovarà)
      totalSkipped += batch.length;
    }

    // 5. Progrés
    // Esperar entre batches per no superar rate limit (10 RPM)
    if (batchIdx < totalBatches - 1) {
      await new Promise(r => setTimeout(r, INTER_BATCH_DELAY_MS));
    }

    const done = Math.min(start + BATCH_SIZE, toProcess.length);
    const pct = ((done / toProcess.length) * 100).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const rate = (done / ((Date.now() - startTime) / 1000)).toFixed(1);
    const eta = totalOk > 0
      ? Math.round(((toProcess.length - done) / (done / ((Date.now() - startTime) / 1000))))
      : '?';
    console.log(`  [${pct}%] ${done}/${toProcess.length} | ✅ ${totalOk} | ❌ ${totalFail} | ⏭️ ${totalSkipped} | ⏱️ ${elapsed}s | ${rate}/s | ETA: ${eta}s`);
  }

  // 6. Resum final
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '═'.repeat(60));
  console.log('📊 RESUM FINAL');
  console.log('═'.repeat(60));
  console.log(`  ✅ Parsejades OK:  ${totalOk}`);
  console.log(`  ❌ No parsejables: ${totalFail}`);
  console.log(`  ⏭️  Saltades:       ${totalSkipped}`);
  console.log(`  ⏱️  Temps total:    ${totalTime}s`);
  console.log(`  📦 Batches:        ${totalBatches} × ${BATCH_SIZE}`);
  console.log(`  🚀 Velocitat:      ${(totalOk / parseFloat(totalTime)).toFixed(1)} adr/s`);

  // Quantes queden?
  const remaining = db.prepare(`
    SELECT COUNT(*) as c FROM adreces
    WHERE nom_via IS NULL AND adreca_original IS NOT NULL AND length(adreca_original) >= 3
  `).get() as any;
  if (remaining.c > 0) {
    console.log(`\n⚠️  Encara queden ${remaining.c} adreces pendents. Torna a executar!`);
  } else {
    console.log('\n🎉 TOTES les adreces han estat processades!');
  }
}

main().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});
