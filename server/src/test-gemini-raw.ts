// Diagnòstic de la connexió Gemini
// Provar diferents models per trobar quota activa
const models = ['gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-2.0-flash'];
const key = 'AIzaSyCkfkaeISrHiNPfNVbjzZqtVeYJf-o_vzQ';
const body = JSON.stringify({ contents: [{ parts: [{ text: 'Diga exactament: test OK' }] }] });

async function main() {
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    console.log(`\n=== Provant model: ${model} ===`);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    console.log('Status:', res.status, res.statusText);
    const json = await res.json();
    if (res.ok) {
      console.log('FUNCIONA! Resposta:', json.candidates?.[0]?.content?.parts?.[0]?.text);
      break;
    } else {
      const violations = json.error?.details?.find((d: any) => d.violations)?.violations || [];
      for (const v of violations) {
        console.log(`  Quota: ${v.quotaId}, limit info in metric: ${v.quotaMetric}`);
      }
      const retry = json.error?.details?.find((d: any) => d.retryDelay);
      if (retry) console.log(`  Retry in: ${retry.retryDelay}`);
    }
    // Petit delay entre models
    await new Promise(r => setTimeout(r, 2000));
  }
}

main().catch(console.error);
