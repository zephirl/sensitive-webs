/**
 * GrainLayer – lightweight melodic FM voice
 *
 * Keeps the ring-based melodic interaction but uses a much smaller graph than
 * the previous psy stack. The goal is to keep the forest/meditative character
 * while avoiding browser overload.
 */

import * as Tone from "tone";
import type { MappedSensorData } from "../SensorInputMapper";

interface RingData { freq: number; harm: number; modIdx: number; attack: number }

// Low-note minor-pentatonic mapping for a calm but still hypnotic melody.
const RING_DATA: RingData[] = [
  { freq:  55.00, harm: 0.501, modIdx:  4, attack: 0.30 },
  { freq:  65.41, harm: 1.001, modIdx:  7, attack: 0.28 },
  { freq:  73.42, harm: 1.500, modIdx: 10, attack: 0.26 },
  { freq:  82.41, harm: 2.000, modIdx: 13, attack: 0.24 },
  { freq:  98.00, harm: 2.414, modIdx: 16, attack: 0.22 },
  { freq: 110.00, harm: 2.802, modIdx: 18, attack: 0.20 },
  { freq: 130.81, harm: 3.141, modIdx: 20, attack: 0.18 },
  { freq: 164.81, harm: 3.732, modIdx: 22, attack: 0.16 },
];

const MOD_IDX_MAX = 34;
const HARM_MAX = 4.2;

export const RING_FREQS = RING_DATA.map(r => r.freq);

export class GrainLayer {
  private mainSynth: Tone.FMSynth;
  private padSynth:  Tone.Synth;
  private filter:    Tone.Filter;
  private chorus:    Tone.Chorus;
  private delay:     Tone.FeedbackDelay;
  private panner:    Tone.Panner;
  private gain:      Tone.Gain;
  private isPlaying   = false;
  private currentRing = -1;

  constructor() {
    this.mainSynth = new Tone.FMSynth({
      harmonicity:        0.501,
      modulationIndex:    4,
      oscillator:         { type: "sine" },
      envelope:           { attack: 0.30, decay: 1.8, sustain: 0.16, release: 10.0 },
      modulation:         { type: "triangle" },
      modulationEnvelope: { attack: 0.3, decay: 1.2, sustain: 0.0,  release: 8.0 },
      volume: -11,
    });

    this.padSynth = new Tone.Synth({
      oscillator: { type: "triangle" },
      envelope:   { attack: 0.45, decay: 1.2, sustain: 0.20, release: 12.0 },
      volume: -16,
    });

    this.filter = new Tone.Filter({ type: "lowpass", frequency: 700, Q: 1.2, rolloff: -24 });
    this.chorus = new Tone.Chorus({ frequency: 0.12, delayTime: 4.5, depth: 0.42, wet: 0.24 });
    this.delay  = new Tone.FeedbackDelay({ delayTime: 0.42, feedback: 0.18, wet: 0.16 });
    this.panner = new Tone.Panner(0);
    this.gain   = new Tone.Gain(0.52);

    this.mainSynth.connect(this.filter);
    this.padSynth.connect(this.filter);
    this.filter.connect(this.chorus);
    this.chorus.connect(this.delay);
    this.delay.connect(this.panner);
    this.panner.connect(this.gain);
    this.gain.toDestination();
  }

  start() {
    this.chorus.start();
  }

  triggerAttack(ringIndex: number): void {
    const rd = RING_DATA[Math.min(ringIndex, RING_DATA.length - 1)];
    const t  = Tone.now() + 0.01;
    this.mainSynth.harmonicity.rampTo(rd.harm, 0.08, t);
    this.mainSynth.modulationIndex.rampTo(rd.modIdx, 0.08, t);
    this.mainSynth.envelope.attack = rd.attack;
    this.mainSynth.triggerAttack(rd.freq, t);
    this.padSynth.triggerAttack(rd.freq, t);
    this.isPlaying   = true;
    this.currentRing = ringIndex;
  }

  triggerRelease(): void {
    if (!this.isPlaying) return;
    const t = Tone.now() + 0.01;
    this.mainSynth.triggerRelease(t);
    this.padSynth.triggerRelease(t);
    this.isPlaying   = false;
    this.currentRing = -1;
  }

  update(data: MappedSensorData) {
    if (this.isPlaying && data.ringIndex !== this.currentRing && data.ringIndex >= 0) {
      const rd = RING_DATA[Math.min(data.ringIndex, RING_DATA.length - 1)];
      this.mainSynth.frequency.rampTo(rd.freq, 0.16);
      this.padSynth.frequency.rampTo(rd.freq, 0.18);
      this.mainSynth.harmonicity.rampTo(rd.harm, 0.16);
      this.mainSynth.modulationIndex.rampTo(rd.modIdx, 0.16);
      this.currentRing = data.ringIndex;
    }

    const intensity = data.touch ? data.intensity : 0;

    if (this.isPlaying) {
      const rd = RING_DATA[Math.min(this.currentRing >= 0 ? this.currentRing : 0, RING_DATA.length - 1)];
      const sweep = intensity * intensity;
      const targetMod = rd.modIdx + sweep * (MOD_IDX_MAX - rd.modIdx);
      const targetHarm = rd.harm + sweep * (HARM_MAX - rd.harm);
      this.mainSynth.modulationIndex.rampTo(targetMod, 0.10);
      this.mainSynth.harmonicity.rampTo(targetHarm, 0.12);
      this.mainSynth.volume.rampTo(-11 + intensity * 7, 0.12);
      this.padSynth.volume.rampTo(-16 + intensity * 5, 0.14);
    }

    this.filter.frequency.rampTo(320 + intensity * 1180, 0.14);
    this.chorus.wet.rampTo(0.16 + intensity * 0.18, 0.14);
    this.delay.wet.rampTo(0.10 + intensity * 0.10, 0.14);
    this.delay.feedback.rampTo(0.14 + intensity * 0.16, 0.16);
    this.panner.pan.rampTo(data.positionX * 2 - 1, 0.10);
    this.gain.gain.rampTo(0.52 + intensity * 0.20, 0.14);
  }

  dispose() {
    this.mainSynth.dispose();
    this.padSynth.dispose();
    this.filter.dispose();
    this.chorus.dispose();
    this.delay.dispose();
    this.panner.dispose();
    this.gain.dispose();
  }
}



