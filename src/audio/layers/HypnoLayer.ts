/**
 * HypnoLayer – Dark Forest Drone Arpeggios
 *
 * Sawtooth PolySynth through a deep lowpass filter + Phaser sweep.
 * Notes drawn from Phrygian Dominant + chromatic inflections — dark,
 * exotic, non-Western.  Very slow (6.5 s intervals), enormous reverb.
 * A slow LFO continuously breathes the filter for organic movement.
 * Always running at a whisper; swells on touch.
 */

import * as Tone from "tone";
import type { MappedSensorData } from "../SensorInputMapper";

// Phrygian Dominant – low range, max C3/F3, dark forest floor
const NOTES = [
  "C2", "Db3", "G2", "Ab2", "Eb3", "F2",
  "Bb2", "Eb2", "C3", "F3",  "G2", "Db2",
  "Eb2", "Bb2", "C3", "Gb2",
];

export class HypnoLayer {
  private synth:    Tone.PolySynth<Tone.Synth>;
  private filter:   Tone.Filter;
  private phaser:   Tone.Phaser;
  private autoFilt: Tone.AutoFilter;
  private chorus:   Tone.Chorus;
  private delay:    Tone.PingPongDelay;
  private reverb:   Tone.Reverb;
  private gain:     Tone.Gain;
  private lfo:      Tone.LFO;
  private pattern:  Tone.Pattern<string>;

  constructor() {
    // 4-partial sawtooth – warm, filterable, not piano-ish
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sawtooth4" },
      envelope: {
        attack:  4.5,
        decay:   2.0,
        sustain: 0.22,
        release: 16.0,
      },
      volume: -30,
    });

    this.filter   = new Tone.Filter({ type: "lowpass", frequency: 280, rolloff: -24 });
    this.phaser   = new Tone.Phaser({ frequency: 0.06, octaves: 6, baseFrequency: 120, wet: 0.75 });
    // AutoFilter: slow psytrance wobble on the low synth pads
    this.autoFilt = new Tone.AutoFilter({
      frequency:     0.14,
      baseFrequency: 90,
      octaves:       3.2,
      type:          "sine",
      filter:        { type: "lowpass", rolloff: -24, Q: 1 },
      wet:           0.70,
    });
    this.chorus   = new Tone.Chorus({ frequency: 0.22, delayTime: 5.5, depth: 0.75, wet: 0.50 });
    this.delay   = new Tone.PingPongDelay({ delayTime: 2.1, feedback: 0.42, wet: 0.28 });
    this.reverb  = new Tone.Reverb({ decay: 28, preDelay: 0.22, wet: 0.92 });
    this.gain    = new Tone.Gain(0.5);

    // LFO breathes the filter cutoff for an alive, organic quality
    this.lfo = new Tone.LFO({ frequency: 0.02, min: 150, max: 560, type: "sine" });

    this.synth.connect(this.filter);
    this.filter.connect(this.phaser);
    this.phaser.connect(this.autoFilt);
    this.autoFilt.connect(this.chorus);
    this.chorus.connect(this.delay);
    this.delay.connect(this.reverb);
    this.reverb.connect(this.gain);
    this.gain.toDestination();

    this.pattern = new Tone.Pattern<string>(
      (time, note) => {
        if (!note) return;
        const velocity = 0.15 + Math.random() * 0.22; // very soft
        const dur = 4.0 + Math.random() * 5.0;         // 4–9 s
        this.synth.triggerAttackRelease(note, dur, time, velocity);
      },
      NOTES,
      "random",
    );
    this.pattern.interval = 6.5;
  }

  start() {
    this.chorus.start();
    this.autoFilt.start();
    this.lfo.connect(this.filter.frequency);
    this.lfo.start();
    this.pattern.start(0);
  }

  update(data: MappedSensorData) {
    // Gentle ambient presence; surges on touch
    const targetGain = 0.30 + (data.touch ? data.intensity * 0.55 : 0);
    this.gain.gain.rampTo(targetGain, 0.5);
    // Phaser rate: slow forest drone → swirling psychedelic with touch
    this.phaser.frequency.value = 0.06 + (data.touch ? data.intensity * 0.28 : 0);
    // AutoFilter wobble: barely moving at rest (0.14 Hz) → slow groove on touch (0.60 Hz)
    this.autoFilt.frequency.value = 0.14 + (data.touch ? data.intensity * 0.46 : 0);
    // Pattern fires faster: 6.5 s at rest → 1.5 s at max intensity
    if (data.touch) {
      this.pattern.interval = Math.max(1.5, 6.5 - data.intensity * 5.0);
    } else {
      this.pattern.interval = 6.5;
    }
  }

  dispose() {
    this.pattern.dispose();
    this.synth.dispose();
    this.filter.dispose();
    this.phaser.dispose();
    this.autoFilt.dispose();
    this.chorus.dispose();
    this.delay.dispose();
    this.reverb.dispose();
    this.gain.dispose();
    this.lfo.dispose();
  }
}
