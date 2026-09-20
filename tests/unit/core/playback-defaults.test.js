import { describe, it, expect } from 'vitest';
import { carriedPlaybackFor, playbackInEffect, NO_CARRY } from '../../../src/core/playback-defaults.js';
import { create, setSwingAmount, setSwingFeel, setGroupSwing } from '../../../src/core/pattern.js';

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

  it('AC-4.4.17/1 — A Pattern with no swing of its own loads straight, whatever swing amount was in effect on the Pattern just left: the resolver', () => {
    const applied = carriedPlaybackFor({ pattern: create('Plain'), carried: CARRIED });
    expect(applied.swingAmount).toBeUndefined();
    expect(applied).toEqual({ tempo: 150 });
  });

  it('AC-4.4.17/2 — The swing feel does not carry either: a Pattern with no feel of its own loads on the 8ths feel: the resolver', () => {
    expect(carriedPlaybackFor({ pattern: create('Plain'), carried: CARRIED }).swingFeel).toBeUndefined();
    const own = setSwingFeel(create('Own feel'), 'quarter');
    expect(carriedPlaybackFor({ pattern: own, carried: CARRIED }).swingFeel).toBeUndefined();
  });

  it("AC-4.4.17/3 — A Pattern's own swing — remembered, Pattern-wide, or per-group — loads as it is: the resolver", () => {
    // The resolver never touches swing, so each of the three is left exactly as the Pattern and its overlay say.
    const remembered = carriedPlaybackFor({
      pattern: create('Plain'),
      overlay: { swingAmount: 15 },
      carried: CARRIED,
    });
    expect(remembered).toEqual({});

    const wide = carriedPlaybackFor({ pattern: setSwingAmount(create('Wide'), 25), carried: CARRIED });
    expect(wide.swingAmount).toBeUndefined();
    expect(wide.swingFeel).toBeUndefined();

    const perGroup = carriedPlaybackFor({
      pattern: setGroupSwing(create('Grouped'), 0, 0, 0, 40),
      carried: CARRIED,
    });
    expect(perGroup.swingAmount).toBeUndefined();
  });

  it('AC-4.2.3/6 — A Pattern with any remembered playback setting takes no carried tempo, even when what was remembered is its swing: the resolver', () => {
    const applied = carriedPlaybackFor({
      pattern: create('Plain'),
      overlay: { swingAmount: 15 },
      carried: CARRIED,
    });
    expect(applied.tempo).toBeUndefined();
    expect(applied).toEqual({});
  });

  it('carries nothing when nothing has been carried yet', () => {
    expect(carriedPlaybackFor({ pattern: create('Plain'), carried: {} })).toEqual({});
    expect(carriedPlaybackFor({ pattern: create('Plain'), carried: NO_CARRY })).toEqual({ tempo: 80 });
  });

  it('AC-4.4.17/4 — No swing is stored to carry, so a reload starts an untouched Pattern straight: the fresh-install carry holds a tempo alone', () => {
    expect(NO_CARRY).toEqual({ tempo: 80 });
  });
});

describe('playbackInEffect', () => {
  it('AC-4.2.3/4 — The tempo carries even when the Musician never touched the tempo control on the Pattern just left: the resolver', () => {
    expect(playbackInEffect({ ...create('Authored'), tempo: 200 }).tempo).toBe(200);
  });

  it('reports the tempo alone — swing is never part of what carries (AC-4.4.17)', () => {
    expect(playbackInEffect(create('Plain'))).toEqual({ tempo: 80 });
    expect(playbackInEffect(setSwingAmount(create('Swung'), 33))).toEqual({ tempo: 80 });
  });
});
