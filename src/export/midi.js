/**
 * MIDI export. US-12.1, contracts/file-formats.md §2.
 *
 * The exporter consumes `core/timeline.buildTimeline` — the identical event
 * list the scheduler plays. It does not re-derive timing, pitch, or accent.
 * That is what makes SC-003 enforceable: a divergence between the .mid and
 * playback would require two timelines, and there is only one.
 *
 * Format 0, single track, 480 ticks per quarter note — except an Arrangement,
 * which is Format 1 with a track for each part (US-20.3).
 *
 * How long a note lasts is a choice (US-12.5): Staccato, the sixty ticks every
 * note has always had, or Legato, worked out by `core/articulation.js`. Notes
 * are gathered where they fall among the other events and written only once
 * every note of the file is known, so Staccato stays byte for byte what it was.
 */
import { buildTimeline, loopDurationSeconds } from '../core/timeline.js';
import { beatDurationSeconds, beatCount, quarterSeconds, tempoUnitOf } from '../core/meter.js';
import { cyclePasses } from '../core/harmony.js';
import { totalPasses, entryAt, playingAt } from '../core/chain.js';
import { buildZip } from '../core/zip.js';
import { passesPerLoop, timelineOf, loopDurationOf } from '../core/section.js';
import { hasFixedNotes, ringSeconds, normaliseVoice, GM_PROGRAM } from '../core/voice.js';
import { normaliseArticulation, legatoTicks } from '../core/articulation.js';
import { autoDrumNote } from '../core/drums.js';

export const TICKS_PER_QUARTER = 480;

/** Note-on velocity per Accent Level — Weak 48, Medium 80, Strong 112 (AC-12.1.3). */
export const VELOCITY = { 1: 48, 2: 80, 3: 112 };

/** Percussive Patterns export at one fixed pitch — the rhythm is the content. */
const PERCUSSIVE_NOTE = 37; // side stick

/**
 * Percussive Patterns go on the General MIDI drum channel (channel 10, index 9),
 * Melodic ones on channel 1, so a DAW reads each as what it is (AC-12.1.2).
 */
const DRUM_CHANNEL = 9;
const MELODIC_CHANNEL = 0;
const channelFor = (pattern) => (pattern.soundMode === 'melodic' ? MELODIC_CHANNEL : DRUM_CHANNEL);

const NOTE_LENGTH_TICKS = 60;

/**
 * A note gathered for writing: where it starts, what it is, and what Legato
 * needs to know to lengthen it — the part it belongs to and its instrument's
 * ring at the tempo it sounds at. A drum has neither (AC-12.5.2/4).
 */
function noteAt(tick, { pitch, velocity, channel, part = 0, drum = false, voice = null, accent = 1, secondsPerQuarter = 0.5 }) {
  const ringTicks = drum ? 0 : (ringSeconds(voice, accent) / secondsPerQuarter) * TICKS_PER_QUARTER;
  return { tick, note: { pitch: pitch & 0x7f, velocity, channel, part, drum, ringTicks } };
}

/**
 * Turn every gathered note into its note-on and note-off, in place among the
 * other events. Staccato: sixty ticks each, as ever (AC-12.5.1/3). Legato: each
 * pitched note by the notes of its own part (AC-12.5.2), drums as on Staccato.
 */
function writeNotes(timed, endTick, articulation) {
  const lengths = new Map();
  if (normaliseArticulation(articulation) === 'legato') {
    const byPart = new Map();
    for (const item of timed) {
      if (!item.note || item.note.drum) continue;
      if (!byPart.has(item.note.part)) byPart.set(item.note.part, []);
      byPart.get(item.note.part).push(item);
    }
    for (const items of byPart.values()) {
      const ticks = legatoTicks(items.map((i) => ({ tick: i.tick, pitch: i.note.pitch, ringTicks: i.note.ringTicks })), endTick);
      items.forEach((item, k) => lengths.set(item, ticks[k]));
    }
  }
  return timed.flatMap((item) => {
    if (!item.note) return [item];
    const { pitch, velocity, channel } = item.note;
    const length = lengths.get(item) ?? NOTE_LENGTH_TICKS;
    return [
      { tick: item.tick, bytes: [0x90 | channel, pitch, velocity] },
      { tick: item.tick + length, bytes: [0x80 | channel, pitch, 0] },
    ];
  });
}

function variableLength(value) {
  const bytes = [value & 0x7f];
  let v = value >> 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return bytes;
}

const text = (s) => [...s].map((c) => c.charCodeAt(0) & 0x7f);

function chunk(id, data) {
  const len = data.length;
  return [...text(id), (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff, ...data];
}

/**
 * Build a .mid for a Pattern: one loop pass, or under a progression every pass
 * of its harmonic cycle, so the file carries the whole progression rather than
 * its first chord (AC-2.6.10). Each pass comes from the same `buildTimeline`
 * playback uses, offset by whole passes. A layer of a Section passes its
 * repeats in the combined loop instead (AC-19.11.5/2).
 *
 * `channel` overrides the channel the Pattern's Sound Mode would choose — a
 * part on Drums is written on the drum channel (AC-19.11.5/5). `articulation`
 * is the note-length choice, and `voice` the instrument Legato lengthens by
 * (AC-12.5.2/6).
 *
 * @returns {Uint8Array}
 */
export function buildMidi(pattern, passes = cyclePasses(pattern), { channel = channelFor(pattern), articulation = 'staccato', voice = 'piano' } = {}) {
  const passSeconds = loopDurationSeconds(pattern);
  const events = [];
  for (let pass = 0; pass < passes; pass++) {
    for (const event of buildTimeline(pattern, pass)) {
      events.push({ ...event, timeSeconds: event.timeSeconds + pass * passSeconds });
    }
  }

  // Seconds are converted to ticks against the Pattern's own tempo, so swing
  // offsets survive the conversion rather than being quantised away.
  const secondsPerQuarter = quarterSeconds(pattern.tempo, tempoUnitOf(pattern));
  const toTicks = (seconds) => Math.round((seconds / secondsPerQuarter) * TICKS_PER_QUARTER);

  /** @type {Array<{tick: number, bytes: number[]}>} */
  const timed = [];

  // Tempo, as microseconds per quarter note.
  const usPerQuarter = Math.round(secondsPerQuarter * 1e6);
  timed.push({
    tick: 0,
    bytes: [0xff, 0x51, 0x03, (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff],
  });

  // A Time Signature meta event at every Measure boundary, since meter is
  // per-Measure in this app (US-1.1) — in every pass the file holds.
  let measureStart = 0;
  for (let pass = 0; pass < passes; pass++) {
    for (const measure of pattern.measures) {
      const [numerator, denominator] = measure.timeSignature.split('/').map(Number);
      timed.push({
        tick: toTicks(measureStart),
        bytes: [0xff, 0x58, 0x04, numerator, Math.log2(denominator), 24, 8],
      });
      measureStart +=
        beatCount(measure.timeSignature) * beatDurationSeconds(measure.timeSignature, pattern.tempo, tempoUnitOf(pattern));
    }
  }

  for (const event of events) {
    const note = event.pitch ? event.pitch.midiNote : PERCUSSIVE_NOTE;
    const velocity = VELOCITY[event.accent] ?? VELOCITY[1];
    const onTick = toTicks(event.timeSeconds);
    // A note on the drum channel is a drum, whatever wrote it: it has no length to give.
    timed.push(noteAt(onTick, { pitch: note, velocity, channel, drum: !event.pitch || channel === DRUM_CHANNEL, voice, accent: event.accent, secondsPerQuarter }));
  }

  // End of track, one cycle after the start so the file's duration is the
  // Pattern's, not merely the last note's.
  const endTick = toTicks(passes * passSeconds);
  return assemble(writeNotes(timed, endTick, articulation), endTick);
}

/**
 * Delta-encode timed events into one Format-0 file, closing the track at
 * `endTick` or the last event, whichever is later.
 */
function assemble(timed, endTick) {
  return new Uint8Array([...fileHeader(0, 1), ...trackChunk(timed, endTick)]);
}

/** Delta-encode timed events into one track, closed at `endTick` or its last event, whichever is later. */
function trackChunk(timed, endTick) {
  timed.sort((a, b) => a.tick - b.tick);
  const track = [];
  let previous = 0;
  for (const item of timed) {
    track.push(...variableLength(item.tick - previous), ...item.bytes);
    previous = item.tick;
  }
  const end = Math.max(previous, endTick);
  track.push(...variableLength(end - previous), 0xff, 0x2f, 0x00);
  return chunk('MTrk', track);
}

const fileHeader = (format, tracks) => chunk('MThd', [0, format, (tracks >> 8) & 0xff, tracks & 0xff, (TICKS_PER_QUARTER >> 8) & 0xff, TICKS_PER_QUARTER & 0xff]);

const tempoMeta = (secondsPerQuarter) => {
  const usPerQuarter = Math.round(secondsPerQuarter * 1e6);
  return [0xff, 0x51, 0x03, (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff];
};

/**
 * Build a .mid for a Chain (AC-18.1.5/1): every entry's passes in order, each
 * entry for its repeats with its fill in force, once through and not looped.
 * Each pass is the same `buildTimeline` playback sounds for it, offset by the
 * passes before it, so the file cannot disagree with what the Chain plays.
 * The Pattern's own export is untouched (AC-18.1.5/3).
 *
 * @param {object} chain
 * @param {(id: string) => object|null} patternById
 * @param {{articulation?: string, voice?: string}} [options]  the note-length choice, and the voice Legato lengthens by
 * @returns {Uint8Array}
 */
export function buildChainMidi(chain, patternById, { articulation = 'staccato', voice = 'piano' } = {}) {
  const passes = totalPasses(chain, patternById);
  const timed = [];
  let startTick = 0;
  let previousTempo = null;
  for (let loop = 0; loop < passes; loop++) {
    const at = entryAt(chain, patternById, loop);
    const pattern = playingAt(chain, patternById, loop);
    const secondsPerQuarter = quarterSeconds(pattern.tempo, tempoUnitOf(pattern));
    const toTicks = (seconds) => startTick + Math.round((seconds / secondsPerQuarter) * TICKS_PER_QUARTER);

    // Compared as seconds per quarter, so ♪ = 160 after ♩ = 80 is no change (AC-4.2.7).
    if (secondsPerQuarter !== previousTempo) {
      timed.push({ tick: startTick, bytes: tempoMeta(secondsPerQuarter) });
      previousTempo = secondsPerQuarter;
    }

    let measureStart = 0;
    for (const measure of pattern.measures) {
      const [numerator, denominator] = measure.timeSignature.split('/').map(Number);
      timed.push({ tick: toTicks(measureStart), bytes: [0xff, 0x58, 0x04, numerator, Math.log2(denominator), 24, 8] });
      measureStart += beatCount(measure.timeSignature) * beatDurationSeconds(measure.timeSignature, pattern.tempo, tempoUnitOf(pattern));
    }

    // The pass within the entry's own harmonic cycles: the progression restarts
    // at its first chord when an entry takes over.
    for (const event of buildTimeline(pattern, at.passInEntry)) {
      const note = event.pitch ? event.pitch.midiNote : PERCUSSIVE_NOTE;
      const velocity = VELOCITY[event.accent] ?? VELOCITY[1];
      const onTick = toTicks(event.timeSeconds);
      const channel = channelFor(pattern);
      timed.push(noteAt(onTick, { pitch: note, velocity, channel, drum: !event.pitch || channel === DRUM_CHANNEL, voice, accent: event.accent, secondsPerQuarter }));
    }
    startTick = toTicks(loopDurationSeconds(pattern));
  }
  return assemble(writeNotes(timed, startTick, articulation), startTick);
}

/** A filename-safe version of the Pattern's name. */
export function midiFilename(pattern) {
  const base = pattern.name.trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase();
  return `${base || 'pattern'}.mid`;
}

/**
 * The Chain's file is named after the Chain once it has been saved, and after
 * the Pattern otherwise (AC-18.1.5/2).
 */
export function chainMidiFilename(chain, pattern) {
  const named = chain?.id && typeof chain.name === 'string' && chain.name.trim() !== '';
  return midiFilename(named ? chain : pattern);
}

function download(bytes, filename) {
  const blob = new Blob([bytes], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadMidi(pattern, options = {}) {
  download(buildMidi(pattern, cyclePasses(pattern), options), midiFilename(pattern));
}

export function downloadChainMidi(chain, patternById, pattern = patternById(chain.sections[0]?.patternId), options = {}) {
  download(buildChainMidi(chain, patternById, options), chainMidiFilename(chain, pattern));
}

/* --- a Section: one file per layer (AC-19.11.5) ---------------------- */

/** A filename-safe stem, as `midiFilename` makes it, without the extension. */
const stem = (name) => name.trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase() || 'layer';

/**
 * One .mid per layer of the layered set the transport plays, the composition
 * first, each spanning one combined loop: the layer's own `buildTimeline` for
 * each of its repeats, at the composition's tempo, swing and Key, which the
 * set already applied (AC-19.11.5/1, /2). Muted layers are exported too — the
 * export is the Section, not the audition. Names are numbered so a DAW
 * lists them in order.
 *
 * @param {object} set  from `core/section.layered`
 * @param {{articulation?: string}} [options]  the note-length choice; each part is lengthened by its own instrument
 * @returns {Array<{name: string, bytes: Uint8Array}>}
 */
export function buildSectionMidi(set, { articulation = 'staccato' } = {}) {
  const width = String(set.layers.length).length;
  return set.layers.map((layer, i) => ({
    name: `${String(i + 1).padStart(Math.max(2, width), '0')}-${stem(layer.pattern.name)}.mid`,
    // A part on Drums goes on the drum channel at its own note numbers, so a DAW
    // opens a kit for it (AC-19.11.5/5); every other part as its Pattern is.
    bytes: buildMidi(layer.pattern, passesPerLoop(layer), { ...(hasFixedNotes(layer.instrument) ? { channel: DRUM_CHANNEL } : {}), articulation, voice: normaliseVoice(layer.instrument) }),
  }));
}

/** The archive is named after the Section once saved, and after the composition otherwise (AC-19.11.5/3). */
export function sectionZipFilename(section, composition) {
  const named = section?.id && typeof section.name === 'string' && section.name.trim() !== '';
  return `${stem(named ? section.name : composition.name)}.zip`;
}

export function downloadSectionMidi(set, filename, options = {}) {
  const blob = new Blob([buildZip(buildSectionMidi(set, options))], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* --- an Arrangement: one Format 1 file, a track for each part (US-20.3) ------ */

/** The channels pitched tracks are dealt, in order: every one but the drums'. */
const PITCHED_CHANNELS = Object.freeze(Array.from({ length: 16 }, (_, c) => c).filter((c) => c !== DRUM_CHANNEL));

/** A text meta event. A name is written as UTF-8, so a dash or an accent in it survives; DAWs read track names so. */
const metaText = (type, value) => {
  const bytes = [...new TextEncoder().encode(value)];
  return [0xff, type, ...variableLength(bytes.length), ...bytes];
};

/**
 * Build the Arrangement's .mid from the passes Play sounds (AC-20.3.1): each
 * an `arranged` pass from `core/section.js`, in order, the sequence once
 * through. Every event comes from `timelineOf` — the list the transport plays
 * — so the file cannot disagree with what is heard (AC-20.3.1/6).
 *
 * A pass says which track each of its events belongs to in `mark.tracks`: one
 * entry for a bare Pattern or a Chain, one for each layer of a Section, each
 * `{ key, name, voice, kit?, drums? }`. A track is made the first time its key
 * is met and gathers its notes wherever they fall (AC-20.3.1/3).
 *
 * @param {object[]} passes
 * @param {{articulation?: string}} [options]
 * @returns {Uint8Array}
 */
export function buildArrangementMidi(passes, { articulation = 'staccato' } = {}) {
  const conductor = [];
  /** @type {Map<string, {name: string, channel: number, program: number|null, timed: object[]}>} */
  const tracks = new Map();
  let pitched = 0;
  const trackFor = (info) => {
    if (!tracks.has(info.key)) {
      const voice = normaliseVoice(info.voice);
      // A rhythm on the kit and a part on Drums are drums alone: no channel of their own to take.
      const drumsOnly = Boolean(info.kit || info.drums || hasFixedNotes(voice));
      const channel = drumsOnly ? DRUM_CHANNEL : PITCHED_CHANNELS[pitched++ % PITCHED_CHANNELS.length];
      const program = drumsOnly ? null : (GM_PROGRAM[voice] ?? GM_PROGRAM.piano);
      const timed = [{ tick: 0, bytes: metaText(0x03, info.name) }];
      if (program !== null) timed.push({ tick: 0, bytes: [0xc0 | channel, program] });
      tracks.set(info.key, { name: info.name, channel, program, voice, drumsOnly, kit: Boolean(info.kit), timed });
    }
    return tracks.get(info.key);
  };

  let startTick = 0;
  let previousTempo = null;
  for (const pass of passes) {
    const secondsPerQuarter = quarterSeconds(pass.tempo, pass.tempoUnit);
    const toTicks = (seconds) => startTick + Math.round((seconds / secondsPerQuarter) * TICKS_PER_QUARTER);
    if (secondsPerQuarter !== previousTempo) {
      conductor.push({ tick: startTick, bytes: tempoMeta(secondsPerQuarter) });
      previousTempo = secondsPerQuarter;
    }

    // A time signature at every Measure boundary of the pass; a Section's
    // combined loop may run its composition's Measures more than once.
    const passSeconds = loopDurationOf(pass);
    let measureStart = 0;
    while (measureStart < passSeconds - 1e-9) {
      for (const measure of pass.measures) {
        if (measureStart >= passSeconds - 1e-9) break;
        const [numerator, denominator] = measure.timeSignature.split('/').map(Number);
        conductor.push({ tick: toTicks(measureStart), bytes: [0xff, 0x58, 0x04, numerator, Math.log2(denominator), 24, 8] });
        measureStart += beatCount(measure.timeSignature) * beatDurationSeconds(measure.timeSignature, pass.tempo, pass.tempoUnit);
      }
    }

    const infos = pass.mark?.tracks ?? [];
    for (const event of timelineOf(pass)) {
      const info = infos[event.layer ?? 0] ?? infos[0];
      if (!info) continue;
      const track = trackFor(info);
      const velocity = VELOCITY[event.accent] ?? VELOCITY[1];
      const onTick = toTicks(event.timeSeconds);
      if (event.pitch && !track.drumsOnly) {
        track.timed.push(noteAt(onTick, { pitch: event.pitch.midiNote, velocity, channel: track.channel, part: info.key, voice: track.voice, accent: event.accent, secondsPerQuarter }));
      } else {
        // A drum: the note a part on Drums was written with, the drum a rhythm
        // on the kit plays for its accent (AC-20.3.1/5), or the side stick an
        // unpitched note has always exported as.
        const pitch = event.pitch ? event.pitch.midiNote : track.kit ? (autoDrumNote(event.accent) ?? PERCUSSIVE_NOTE) : PERCUSSIVE_NOTE;
        track.timed.push(noteAt(onTick, { pitch, velocity, channel: DRUM_CHANNEL, part: info.key, drum: true }));
      }
    }
    startTick = toTicks(passSeconds);
  }

  const chunks = [trackChunk(conductor, startTick), ...[...tracks.values()].map((t) => trackChunk(writeNotes(t.timed, startTick, articulation), startTick))];
  return new Uint8Array([...fileHeader(1, chunks.length), ...chunks.flat()]);
}

/** The Arrangement's file is named after it once it has a name (AC-20.3.1/1). */
export function arrangementMidiFilename(arrangement) {
  const named = typeof arrangement?.name === 'string' && arrangement.name.trim() !== '';
  return `${named ? stem(arrangement.name) : 'arrangement'}.mid`;
}

export function downloadArrangementMidi(passes, arrangement, options = {}) {
  download(buildArrangementMidi(passes, options), arrangementMidiFilename(arrangement));
}
