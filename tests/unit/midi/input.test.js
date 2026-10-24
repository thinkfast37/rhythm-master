import { describe, it, expect, vi, afterEach } from 'vitest';
import { createMidiInput } from '../../../src/midi/input.js';

function fakeAccess(names) {
  const inputs = new Map(names.map((name, i) => [`in${i}`, { id: `in${i}`, name, state: 'connected', onmidimessage: null }]));
  return { inputs, outputs: new Map(), onstatechange: null };
}

afterEach(() => vi.unstubAllGlobals());

describe('midi/input — the Web MIDI adapter (US-19.10, research.md D-019)', () => {
  it('reports unsupported where the browser has no Web MIDI', async () => {
    vi.stubGlobal('navigator', {});
    const onChange = vi.fn();
    await createMidiInput({ onNote: vi.fn(), onChange }).request();
    expect(onChange).toHaveBeenLastCalledWith('unsupported', []);
  });

  it('reports denied when access is refused', async () => {
    vi.stubGlobal('navigator', { requestMIDIAccess: () => Promise.reject(new Error('no')) });
    const onChange = vi.fn();
    await createMidiInput({ onNote: vi.fn(), onChange }).request();
    expect(onChange).toHaveBeenLastCalledWith('denied', []);
  });

  it('asks once, without sysex, lists the devices and hands on each note-on with its device', async () => {
    const access = fakeAccess(['Keystation 49', 'TriplePlay']);
    const requestMIDIAccess = vi.fn(() => Promise.resolve(access));
    vi.stubGlobal('navigator', { requestMIDIAccess });
    const onNote = vi.fn();
    const onChange = vi.fn();
    const input = createMidiInput({ onNote, onChange });
    await input.request();
    await input.request();
    expect(requestMIDIAccess).toHaveBeenCalledTimes(1);
    expect(requestMIDIAccess).toHaveBeenCalledWith({ sysex: false });
    expect(onChange).toHaveBeenLastCalledWith('ready', [
      { id: 'in0', name: 'Keystation 49' },
      { id: 'in1', name: 'TriplePlay' },
    ]);
    access.inputs.get('in1').onmidimessage({ data: new Uint8Array([0x90, 64, 80]) });
    access.inputs.get('in1').onmidimessage({ data: new Uint8Array([0x80, 64, 0]) });
    expect(onNote).toHaveBeenCalledTimes(1);
    expect(onNote).toHaveBeenCalledWith(64, 'TriplePlay');
  });

  it('follows devices as they are connected and disconnected, listening to the new ones', async () => {
    const access = fakeAccess(['Keystation 49']);
    vi.stubGlobal('navigator', { requestMIDIAccess: () => Promise.resolve(access) });
    const onNote = vi.fn();
    const onChange = vi.fn();
    await createMidiInput({ onNote, onChange }).request();
    access.inputs.set('in9', { id: 'in9', name: 'TriplePlay', state: 'connected', onmidimessage: null });
    access.onstatechange({});
    expect(onChange).toHaveBeenLastCalledWith('ready', [
      { id: 'in0', name: 'Keystation 49' },
      { id: 'in9', name: 'TriplePlay' },
    ]);
    access.inputs.get('in9').onmidimessage({ data: [0x90, 60, 1] });
    expect(onNote).toHaveBeenCalledWith(60, 'TriplePlay');
    access.inputs.get('in0').state = 'disconnected';
    access.onstatechange({});
    expect(onChange).toHaveBeenLastCalledWith('ready', [{ id: 'in9', name: 'TriplePlay' }]);
  });
});
