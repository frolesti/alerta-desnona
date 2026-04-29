import { readFileSync, writeFileSync } from 'node:fs';

const files = [
  'client/src/i18n/translations.ts',
  'client/src/pages/CasDetallPage.tsx',
  'client/src/pages/InfoPage.tsx',
  'client/src/pages/MapaPage.tsx',
  'client/src/components/PushToggle.tsx',
  'client/src/hooks/useNativePush.ts',
  'server/src/services/email.ts',
];

// Match emoji + variation selectors + ZWJ + optional trailing space
const re = /([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{1F000}-\u{1F2FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u2764\u{1F004}\u{1F0CF}]+[\uFE0F\u200D]*)+ ?/gu;

for (const f of files) {
  try {
    const orig = readFileSync(f, 'utf8');
    const next = orig.replace(re, '');
    if (next !== orig) {
      writeFileSync(f, next, 'utf8');
      console.log(`cleaned: ${f}`);
    } else {
      console.log(`no change: ${f}`);
    }
  } catch (e) {
    console.error(`skip ${f}: ${e.message}`);
  }
}
