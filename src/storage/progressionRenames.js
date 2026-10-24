/**
 * Catalogue progressions whose id changed, and the entries that took their
 * place (AC-2.12.1/4). A song progression's id is its numerals, so re-spelling
 * a song (AC-2.6.1/19) renames its entry; this map carries a tick on My list to
 * the entry that now holds that song's section. Written by
 * `npm run chords -- respell`; never edited by hand.
 */
export const PROGRESSION_RENAMES = {
  'i-IV-v-bVII-i-bVI-v-bVII': ['ii-V-vi-I-ii-bVII-vi-I'],
  'bIII-IV-bVII-VI7': ['IV-V-I-VII7'],
  'ii-IV-bVII-IV-bVII-IV-V7': ['iii-V-I-V-I-V-VI7'],
  'I-bIImaj7-bIII': ['III-IVmaj7-V'],
  'i-v': ['vi-iii'],
  'bIII-v-i-i': ['I-iii-vi-vi'],
  'i-bVII-bVI-i-bVI': ['vi-V-IV-vi-IV'],
  'iii-i-iv-bVImaj7-V': ['IV-vi-III'],
  'i-iv-bIII-v-i-bVI-bIII-v': ['vi-ii-I-iii-vi-IV-I-iii'],
  'IV-i-IV-i-IV-i-bVI-V7': ['II-vi-II-vi-II-vi-IV-III7'],
  'I-ii-IV-V-IV-ii': ['V-vi7-I-ii7-I-vi7'],
  'IV-I-ii-V': ['vi-I-iii-V'],
  'I-IV-vi-IV': ['vi-I-IV'],
  'i-bIII-bVI-iv': ['vi-I-IV-ii'],
  'I-I-vi-III-IV-I-V': ['I-vi-vimMaj7-IV-I-V'],
  'i-bVII6-bVI-V': ['vi-V6-IV-III'],
  'iv-bVII-viio7-i': ['ii-V-bvio7-vi'],
  'bIII-bVI': ['I-IV'],
  'ii7-IVmaj7': ['vi7-Imaj7'],
  'ii7-IVmaj7-I-vi7': ['vi7-Imaj7-V-iii7'],
  'Vsus4-I-IVadd9': ['IIsus4-V-Iadd9'],
  'Vsus4-vi7-IV': ['IIsus4-iii7-I'],
  'i7-bVII-bVI': ['vi7-V-IV'],
  'bIII-bVII-i7-bVI': ['I-V-vi7-IV'],
  'bVI-bVII-i-bVII': ['IV-V-vi-V'],
  'vi7-IV-I-Vsus4': ['vi7-IV-I-Isus2'],
  'iv-bVII-i': ['ii-V-vi'],
  'i-bVI-iv-bVII': ['vi-IV-ii-V'],
  'bIIImaj7-i': ['Imaj7-vi'],
  'i-imMaj7-i9-i6-bVImaj7': ['vi-vimMaj7-vi9-vi6-IVmaj7'],
  'I-v-v-ii': ['V-ii-ii-vi'],
  'I-v-IV': ['IVmaj7-I-V'],
  'i-bIII-iv-bVI': ['iii-V-vi-I'],
  'I-V-vi-II7-V-V7': ['IV-I-ii-V7-I-I7'],
  'i-bVI': ['vi-IV'],
  'v-i-bVI-bIII-bVII': ['iii-vi-IV-I-V'],
  'I-ii-iii-ii-I': ['I-IV-I-V'],
  'bVI-V-i': ['IV-III-vi'],
};

/** A list of progression ids with every renamed one replaced by its successors, once each. */
export function renameProgressions(ids) {
  if (!Array.isArray(ids)) return ids;
  return [...new Set(ids.flatMap((id) => PROGRESSION_RENAMES[id] ?? [id]))];
}
