import { readFileSync, writeFileSync } from 'node:fs';
const f = 'client/src/i18n/translations.ts';
let s = readFileSync(f, 'utf8');

const subs = [
  // Catalan
  ["stats_subtitle: 'Dades del CGPJ (Consejo General del Poder Judicial) sobre llançaments judicials executats',",
   "stats_subtitle: 'Desnonaments executats pels jutjats (anomenats «llançaments» en l\\'estadística oficial). Font: Consejo General del Poder Judicial (CGPJ).',"],
  ["stats_evictions_executed: 'Llançaments judicials executats',",
   "stats_evictions_executed: 'Desnonaments executats',"],
  ["stats_data_note: 'Les xifres reflecteixen llançaments judicials efectivament executats als jutjats de tot l\\'Estat, segons el CGPJ. Inclouen desnonaments per lloguer (LAU), per hipoteca i per altres causes. Els casos individuals del BOE són un subconjunt publicat.',",
   "stats_data_note: 'Les xifres mostren desnonaments efectivament practicats pels jutjats de tot l\\'Estat — el CGPJ els anomena «llançaments practicats». Es publiquen anualment i el darrer any disponible pot incloure dades parcials. Inclouen desnonaments per lloguer (LAU), per execució hipotecària i per altres causes (precaris, ocupació amb sentència, etc.). Els casos individuals al BOE són només un subconjunt: només hi apareixen els que arriben a subhasta pública.',"],
  ["stats_variation: 'Variació',", "stats_variation: 'Variació vs any anterior',"],
  ["cgpj_total: 'Total',", "cgpj_total: 'Total desnonaments',"],
  ["cgpj_lanzaments: 'llançaments',", "cgpj_lanzaments: 'desnonaments',"],
  // Spanish
  ["stats_subtitle: 'Datos del CGPJ (Consejo General del Poder Judicial) sobre lanzamientos judiciales ejecutados',",
   "stats_subtitle: 'Desahucios ejecutados por los juzgados (llamados «lanzamientos» en la estadística oficial). Fuente: Consejo General del Poder Judicial (CGPJ).',"],
  ["stats_evictions_executed: 'Lanzamientos judiciales ejecutados',",
   "stats_evictions_executed: 'Desahucios ejecutados',"],
  ["stats_variation: 'Variación',", "stats_variation: 'Variación vs año anterior',"],
  ["cgpj_total: 'Total',\n  cgpj_lau: 'Alquiler (LAU)',", "cgpj_total: 'Total desahucios',\n  cgpj_lau: 'Alquiler (LAU)',"],
  ["cgpj_lanzaments: 'lanzamientos',", "cgpj_lanzaments: 'desahucios',"],
  // Galician
  ["stats_evictions_executed: 'Lanzamentos xudiciais executados',",
   "stats_evictions_executed: 'Desafiuzamentos executados',"],
  ["stats_variation: 'Variación',\n  stats_historical:",
   "stats_variation: 'Variación vs ano anterior',\n  stats_historical:"],
  ["cgpj_total: 'Total',\n  cgpj_lau: 'Alugueiro (LAU)',", "cgpj_total: 'Total desafiuzamentos',\n  cgpj_lau: 'Alugueiro (LAU)',"],
  ["cgpj_lanzaments: 'lanzamentos',", "cgpj_lanzaments: 'desafiuzamentos',"],
  // Basque
  ["cgpj_total: 'Guztira',", "cgpj_total: 'Etxegabetzeak guztira',"],
  ["cgpj_lanzaments: 'lanzamenduak',", "cgpj_lanzaments: 'etxegabetzeak',"],
  ["stats_variation: 'Aldaketa',", "stats_variation: 'Aurreko urtearekiko aldaketa',"],
];

let changed = 0;
for (const [a, b] of subs) {
  if (s.includes(a)) { s = s.replace(a, b); changed++; }
  else console.log('MISS:', a.slice(0,80));
}
writeFileSync(f, s);
console.log(`applied ${changed}/${subs.length}`);
