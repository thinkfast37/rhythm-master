/**
 * MIDI input through the browser's Web MIDI API (US-19.10, research.md D-019).
 *
 * The only module that touches `navigator.requestMIDIAccess`. It asks once a
 * page load (AC-19.10.5/1), listens to every input, follows devices as they
 * come and go (AC-19.10.4/4), and hands each note-on to `onNote` with the name
 * of the device it came from; deciding what to do with it is the caller's.
 * The store builds' native MIDI, when it comes, is another adapter of this
 * shape.
 */
import { parseNoteOn } from '../core/midi.js';

/**
 * @param {{
 *   onNote: (midi: number, deviceName: string) => void,
 *   onChange: (status: 'idle'|'pending'|'ready'|'unsupported'|'denied', devices: {id: string, name: string}[]) => void,
 * }} handlers
 */
export function createMidiInput({ onNote, onChange }) {
  let requested = false;
  let access = null;

  const devices = () =>
    access ? [...access.inputs.values()].filter((i) => i.state !== 'disconnected').map((i) => ({ id: i.id, name: i.name || 'MIDI device' })) : [];

  const listen = () => {
    for (const input of access.inputs.values()) {
      input.onmidimessage = (e) => {
        const on = parseNoteOn(e.data);
        if (on) onNote(on.note, input.name || 'MIDI device');
      };
    }
  };

  return {
    /** Ask for access, the first time only. Never throws: absence is a status. */
    async request() {
      if (requested) return;
      requested = true;
      const nav = typeof navigator !== 'undefined' ? navigator : undefined;
      if (!nav || typeof nav.requestMIDIAccess !== 'function') {
        onChange('unsupported', []);
        return;
      }
      onChange('pending', []);
      try {
        access = await nav.requestMIDIAccess({ sysex: false });
      } catch {
        onChange('denied', []);
        return;
      }
      listen();
      access.onstatechange = () => {
        listen();
        onChange('ready', devices());
      };
      onChange('ready', devices());
    },
  };
}
