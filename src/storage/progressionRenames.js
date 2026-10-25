/**
 * Catalogue progressions whose id changed, and the entries that took their
 * place (AC-2.12.1/4). A song progression's id is its numerals, so re-spelling
 * a song (AC-2.6.1/19) renames its entry; this map carries a tick on My list to
 * the entry that now holds that song's section. Written by
 * `npm run chords -- respell`, which keeps every rename already here whose
 * successor still exists; the three-chord entries of the headings' own retired
 * for their four-chord forms (AC-2.6.1/20, T432) were added by hand, since no
 * song carries them over.
 */
export const PROGRESSION_RENAMES = {
  'I-V-IV': ['I-I-V-IV'],
  'i-bVI-bVII': ['i-i-bVI-bVII'],
  'i-bVII-bVI': ['i-i-bVII-bVI'],
  'bVI-bVII-i': ['bVI-bVII-i-i'],
  'iio-V-i': ['iio-V-V-i'],
  'I7-IV7-V7': ['I7-IV7-IV7-V7'],
  'bVI-bVII-I': ['bVI-bVII-I-I'],
  'I-bIII-IV': ['I-bIII-IV-IV'],
  'vi-V-I': ['vi-vi-V-I'],
  'vi-IV-V': ['vi-IV-V-V'],
  'bVII-IV-I': ['bVII-IV-IV-I'],
  'i-bVII-IV': ['i-bVII-bVII-IV'],
  'i-bIII-iv': ['i-i-bIII-iv'],
  'Isus2-Isus4-I': ['Isus2-Isus2-Isus4-I'],
  'Vsus4-V-I': ['Vsus4-V-I-I'],
  'V7sus4-V7-I': ['V7sus4-V7-I-I'],
  'ii7-V7sus4-Imaj7': ['ii7-ii7-V7sus4-Imaj7'],
  'Isus2-IVsus2-Vsus4': ['Isus2-IVsus2-IVsus2-Vsus4'],
  'I-bVIIsus2-IVsus2': ['I-bVIIsus2-bVIIsus2-IVsus2'],
  'i-bVIIsus2-bVIsus2': ['i-bVIIsus2-bVIIsus2-bVIsus2'],
  'Iadd9-IVadd9-V': ['Iadd9-IVadd9-IVadd9-V'],
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
  'I-IV-vi-IV': ['vi-I-IV-IV'],
  'i-bIII-bVI-iv': ['vi-I-IV-ii'],
  'I-I-vi-III-IV-I-V': ['I-vi-vimMaj7-IV-I-V'],
  'i-bVII6-bVI-V': ['vi-V6-IV-III'],
  'iv-bVII-viio7-i': ['ii-V-bvio7-vi'],
  'bIII-bVI': ['I-IV'],
  'ii7-IVmaj7': ['vi7-Imaj7'],
  'ii7-IVmaj7-I-vi7': ['vi7-Imaj7-V-iii7'],
  'Vsus4-I-IVadd9': ['IIsus4-V-Iadd9'],
  'Vsus4-vi7-IV': ['IIsus4-iii7-I'],
  'i7-bVII-bVI': ['vi7-V-IV-IV'],
  'bIII-bVII-i7-bVI': ['I-V-vi7-IV'],
  'bVI-bVII-i-bVII': ['IV-V-vi-V'],
  'vi7-IV-I-Vsus4': ['vi7-IV-I-Isus2'],
  'iv-bVII-i': ['ii-V-vi-vi'],
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
  'bVI-V-i': ['IV-III-IV-III-vi-V-IV-III'],
  'ii7-iii7-V': ['ii7-iii7-V-IVmaj7'],
  'vi-IV-I': ['vi-IV-I-I'],
  'vi-I-IV': ['vi-I-IV-IV'],
  'III-vi-IV': ['I-III-vi-IV'],
  'vi7-V-IV': ['vi7-V-IV-IV'],
  'I-V6-IVmaj7': ['I-V6-IVmaj7-I'],
  'ii-V-vi': ['ii-V-vi-vi'],
  'IV-I-V': ['IV-I-V-I'],
  'V-vi-I': ['V-vi-I-I'],
  'IV-III-vi': ['IV-III-IV-III-vi-V-IV-III'],
};

/** A list of progression ids with every renamed one replaced by its successors, once each. */
export function renameProgressions(ids) {
  if (!Array.isArray(ids)) return ids;
  return [...new Set(ids.flatMap((id) => PROGRESSION_RENAMES[id] ?? [id]))];
}
