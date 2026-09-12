import { describe, it, expect } from 'vitest';
import {
  carriedPlaybackFor,
  playbackInEffect,
  NO_CARRY,
  DEFAULT_SWING_AMOUNT,
} from '../../../src/core/playback-defaults.js';
import { create, setSwingAmount, setSwingFeel, setGroupSwing } from '../../../src/core/pattern.js';
import { DEFAULT_SWING_FEEL } from '../../../src/core/swing.js';

const CARRIED = { tempo: 150, swingAmount: 33, swingFeel: 'sixteenth' };

describe('carriedPlaybackFor', () => {
  it('AC-4.2.3/1 — A Pattern with no tempo of its own loads at the tempo in effect on the Pattern just left: the resolver', () => {
    expect(carriedPlaybackFor({ pattern: create('Plain'), carried: CARRIED }).tempo).toBe(150);
  });

  it('AC-4.2.3/2 — A tempo the Musician has set on a Pattern outranks the carried tempo: the resolver', () => {
    const applied = carriedPlaybackFor({
      pattern: create('Plain'),
      overlay: { tempo: 120 },
      carried: CARRIED,
    });
    expect(applied.tempo).toBeUndefined();
  });

  it('AC-4.2.3/3 — An authored tempo differing from the 80 BPM default outranks the carried tempo: the resolver', () => {
    const authored = { ...create('Authored'), tempo: 200 };
    expect(carriedPlaybackFor({ pattern: authored, carried: CARRIED }).tempo).toBeUndefined();
    // And exactly 80 reads as absent, deliberately (AC-4.2.3's parenthetical).
    expect(carriedPlaybackFor({ pattern: create('Plain'), carried: CARRIED }).tempo).toBe(150);
  });

  it('AC-4.4.17/1 — A Pattern with no swing of its own loads at the swing amount in effect on the Pattern just left: the resolver', () => {
    expect(carriedPlaybackFor({ pattern: create('Plain'), carried: CARRIED }).swingAmount).toBe(33);
  });

  it('AC-4.4.17/2 — The swing feel carries the same way: the resolver', () => {
    expect(carriedPlaybackFor({ pattern: create('Plain'), carried: CARRIED }).swingFeel).toBe(
      'sixteenth'
    );
    const own = setSwingFeel(create('Own feel'), 'quarter');
    expect(carriedPlaybackFor({ pattern: own, carried: CARRIED }).swingFeel).toBeUndefined();
  });

  it("AC-4.4.17/3 — A Pattern's own swing — remembered, Pattern-wide, or per-group — outranks the carried values: the resolver", () => {
    const remembered = carriedPlaybackFor({
      pattern: create('Plain'),
      overlay: { swingAmount: 15 },
      carried: CARRIED,
    });
    expect(remembered.swingAmount).toBeUndefined();

    const wide = carriedPlaybackFor({ pattern: setSwingAmount(create('Wide'), 25), carried: CARRIED });
    expect(wide.swingAmount).toBeUndefined();

    const perGroup = carriedPlaybackFor({
      pattern: setGroupSwing(create('Grouped'), 0, 0, 0, 40),
      carried: CARRIED,
    });
    expect(perGroup.swingAmount).toBeUndefined();
  });

  it('carries nothing when nothing has been carried yet', () => {
    expect(carriedPlaybackFor({ pattern: create('Plain'), carried: {} })).toEqual({});
    expect(carriedPlaybackFor({ pattern: create('Plain'), carried: NO_CARRY })).toEqual({
      tempo: 80,
      swingAmount: DEFAULT_SWING_AMOUNT,
      swingFeel: DEFAULT_SWING_FEEL,
    });
  });
});

describe('playbackInEffect', () => {
  it('AC-4.2.3/4 — The tempo carries even when the Musician never touched the tempo control on the Pattern just left: the resolver', () => {
    expect(playbackInEffect({ ...create('Authored'), tempo: 200 }).tempo).toBe(200);
  });

  it('reports the defaults for a Pattern that states neither swing nor feel', () => {
    expect(playbackInEffect(create('Plain'))).toEqual({
      tempo: 80,
      swingAmount: 0,
      swingFeel: DEFAULT_SWING_FEEL,
    });
  });
});
