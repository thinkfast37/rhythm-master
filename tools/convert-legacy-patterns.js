/*
 * One-time migration: legacy TAKADIMI pattern format -> Rhythm Master seed library.
 *
 * Legacy shape:  { name, cat, disp, ts, bpm, beats:[{type:'S'|'T', slots:[syl|null],
 *                   accents?:[0-3]}], soundScheme?, key?, melodyContinues?, customSchemeData? }
 * Target shape:  Pattern per the spec's Key Entities section.
 *
 * Deliberate conversions:
 *  - ts applies to every Measure (legacy had one Pattern-wide meter)
 *  - beats chunked into Measures by the ts numerator
 *  - S(4 slots) -> "straight-16ths" Recipe;  T(3 slots) -> "triplet-8ths" Recipe
 *  - explicit legacy accents are preserved as overrides; patterns without them emit
 *    on/off only, so the new metric-accent defaults (FR-003) apply
 *  - melodic patterns have their arpeggio resolved to explicit per-Slot Pitch, since
 *    the new model has no runtime pitch cycling
 *  - `cat` becomes a Tag;  `disp` is dropped (it was search-only metadata)
 */
const fs = require('fs'), vm = require('vm');

const ROOT = process.env.LEGACY_APP_PATH || '../takadimi_app';
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ROOT + '/js/patterns.js', 'utf8') + ';globalThis.__P=PATTERNS;', ctx);
const LEGACY = ctx.__P;

// Melodic scheme table, lifted from the legacy audio engine.
const MELODIC_SCHEMES = {
  '1-3-5-7': [1,3,5,7], '1-3-5-8': [1,3,5,8], '1-5-3-5': [1,5,3,5],
  '1-8-5-8': [1,8,5,8], '1-8-3-8': [1,8,3,8], '1-7-3-7': [1,7,3,7],
  '1-3-9-8': [1,3,9,8], '1-b3-5-b3': [1,'b3',5,'b3'], '1-b7-5-3': [1,'b7',5,3],
  '1-5-9-5-9-5-7': [1,5,9,5,9,5,7],
  '1-5-8-b10-13-b10-8-5': [1,5,8,'b10',13,'b10',8,5],
};

const RECIPE = { S: 'straight-16ths', T: 'triplet-8ths' };
const SLOTS  = { S: 4, T: 3 };

const warnings = [];
const cellRepeats = [];
const trimmed = [];

/* Legacy degree token -> { degree, octaveOffset }.
   Trailing commas meant "drop an octave"; a leading b meant flat. */
function parseDegree(tok) {
  const s = String(tok);
  const commas = (s.match(/,+$/) || [''])[0].length;
  return { degree: s.replace(/,+$/, ''), octaveOffset: -commas };
}

/* Legacy custom schemes exist in two historical shapes: a flat array of tokens,
   and a nested array where each step is a chord (post-chord-syntax migration).
   Chords are gone in the new model, so a multi-tone step keeps its first tone. */
function normalizeCustom(data, patternName) {
  return data.map(step => {
    if (Array.isArray(step)) {
      if (step.length > 1) {
        warnings.push(`${patternName}: chord step [${step.join('+')}] reduced to "${step[0]}" (chords removed in new model)`);
      }
      return parseDegree(step[0]);
    }
    return parseDegree(step);
  });
}

function convert(p) {
  const num = parseInt(p.ts.split('/')[0], 10);
  const isMelodic = !!(p.soundScheme && p.soundScheme !== 'percussive');

  // Resolve the pitch sequence the legacy engine would have produced.
  let pitchSeq = null;
  if (isMelodic) {
    if (p.soundScheme === 'custom') {
      pitchSeq = normalizeCustom(p.customSchemeData || [], p.name);
    } else if (MELODIC_SCHEMES[p.soundScheme]) {
      pitchSeq = MELODIC_SCHEMES[p.soundScheme].map(d => parseDegree(d));
    } else {
      warnings.push(`${p.name}: unknown soundScheme "${p.soundScheme}" — converted as Percussive`);
    }
  }

  // Legacy Patterns shorter than one Measure were drill cells that looped every
  // beat or two. A Measure must hold exactly `num` Beats, so repeat the cell to
  // fill one Measure — audibly equivalent to the old looping, but now carrying
  // the new metric accents rather than a uniformly strong downbeat per beat.
  let sourceBeats = p.beats;
  if (p.beats.length < num) {
    if (num % p.beats.length !== 0) {
      warnings.push(`${p.name}: ${p.beats.length}-beat cell does not divide evenly into ${p.ts} — padded with rests instead of repeated`);
      sourceBeats = p.beats.concat(
        Array.from({ length: num - p.beats.length }, () => ({ type: 'S', slots: [null, null, null, null] }))
      );
    } else {
      const reps = num / p.beats.length;
      sourceBeats = Array.from({ length: reps }, () => p.beats).flat();
      cellRepeats.push(`${p.name}: ${p.beats.length}-beat cell repeated ${reps}× to fill ${p.ts}`);
    }
  }

  let arpPos = 0;
  const measures = [];
  for (let i = 0; i < sourceBeats.length; i += num) {
    const beats = sourceBeats.slice(i, i + num).map(b => {
      const expected = SLOTS[b.type];
      if (b.slots.length !== expected) {
        warnings.push(`${p.name}: ${b.type} beat had ${b.slots.length} slots, expected ${expected}`);
      }
      const slots = b.slots.map((syl, si) => {
        if (!syl) return { on: false };
        const slot = { on: true };
        // Preserve a deliberate authorial accent; otherwise let the new
        // metric defaults compute it (FR-003).
        if (b.accents && b.accents[si] !== undefined) slot.accent = b.accents[si];
        if (pitchSeq && pitchSeq.length) {
          slot.pitch = pitchSeq[arpPos % pitchSeq.length];
          arpPos++;
        }
        return slot;
      });
      return { recipe: RECIPE[b.type], slots };
    });
    measures.push({ timeSignature: p.ts, beats });
  }

  // Legacy Patterns sometimes carried trailing all-rest Measures (padding, not
  // musical content). Drop them so the Pattern reflects its real length.
  while (measures.length > 1 &&
         measures[measures.length - 1].beats.every(b => b.slots.every(s => !s.on))) {
    measures.pop();
    trimmed.push(p.name);
  }

  const out = {
    name: p.name,
    soundMode: pitchSeq ? 'melodic' : 'percussive',
    tempo: p.bpm || 80,
    tags: [p.cat].filter(Boolean),
    rating: 0,
    measures,
  };
  if (pitchSeq) out.key = p.key || 'C';
  if (p.swing) out.swing = p.swing;
  return out;
}

const converted = LEGACY.map(convert);

// --- validation -------------------------------------------------------------
const SUPPORTED_TS = ['2/4','3/4','4/4','5/4','6/4','7/4','6/8','7/8','9/8','12/8'];
const errors = [];
converted.forEach(p => {
  if (p.measures.length > 6) {
    errors.push(`${p.name}: ${p.measures.length} Measures exceeds the 6-Measure cap (AC-1.1.3)`);
  }
  p.measures.forEach(m => {
    if (!SUPPORTED_TS.includes(m.timeSignature)) {
      errors.push(`${p.name}: unsupported time signature ${m.timeSignature}`);
    }
  });
});

fs.writeFileSync(__dirname + '/../data/seed-patterns.json', JSON.stringify(converted, null, 2));

const noteOns = converted.reduce((a,p) => a + p.measures.reduce((b,m) =>
  b + m.beats.reduce((c,bt) => c + bt.slots.filter(s => s.on).length, 0), 0), 0);

console.log(`converted:        ${converted.length} patterns`);
console.log(`total note-ons:   ${noteOns}`);
console.log(`percussive:       ${converted.filter(p=>p.soundMode==='percussive').length}`);
console.log(`melodic:          ${converted.filter(p=>p.soundMode==='melodic').length}`);
console.log(`explicit accents: ${converted.filter(p=>p.measures.some(m=>m.beats.some(b=>b.slots.some(s=>s.accent!==undefined)))).length}`);
console.log(`\ncells repeated to fill a Measure (${cellRepeats.length}):`);
cellRepeats.forEach(c => console.log('  -', c));
console.log(`\ntrailing silent Measures trimmed (${[...new Set(trimmed)].length}):`);
[...new Set(trimmed)].forEach(t => console.log('  -', t));
console.log(`\nwarnings (${warnings.length}):`);
warnings.forEach(w => console.log('  -', w));
console.log(`\nblocking errors (${errors.length}):`);
errors.forEach(e => console.log('  !', e));
