/**
 * WobbleLayer – lightweight moving bass
 *
 * Keeps the moving psy bass feel with a very small graph: two oscillators,
 * one resonant lowpass, one LFO, one gain. No chorus, no delay, no reverb.
 *
 * This restores motion and tension without rebuilding the heavy previous stack.
 */

import * as Tone from "tone";
import type { MappedSensorData } from "../SensorInputMapper";

const RING_BASS_FREQS = [32.70, 41.20, 49.00, 55.00, 65.41, 73.42, 82.41, 98.00];

export class WobbleLayer {
  private oscSaw:  Tone.Oscillator;
  private oscSub:  Tone.Oscillator;
  private resLP:   Tone.Filter;
  private lfo:     Tone.LFO;
  private panner:  Tone.Panner;
  private gain:    Tone.Gain;
  private started  = false;

  constructor() {
    this.oscSaw = new Tone.Oscillator({ type: "sawtooth", frequency: 55, detune:  3, volume: -23 });
    this.oscSub = new Tone.Oscillator({ type: "sine",     frequency: 55, detune: -2, volume: -27 });

    this.resLP  = new Tone.Filter({ type: "lowpass", frequency: 120, Q: 6, rolloff: -24 });
    this.lfo    = new Tone.LFO({ frequency: 0.22, min: 90, max: 480, type: "triangle" });
    this.panner = new Tone.Panner(0);
    this.gain   = new Tone.Gain(0.02);

    this.oscSaw.connect(this.resLP);
    this.oscSub.connect(this.resLP);
    this.resLP.connect(this.panner);
    this.panner.connect(this.gain);
    this.gain.toDestination();
  }

  start(): void {
    if (this.started) return;
    this.oscSaw.start();
    this.oscSub.start();
    this.lfo.connect(this.resLP.frequency);
    this.lfo.start();
    this.started = true;
  }

  update(data: MappedSensorData): void {
    const intensity = data.touch ? data.intensity : 0;
    const g = 0.02 + intensity * 0.18;
    this.gain.gain.rampTo(g, 0.18);

    const targetFreq = RING_BASS_FREQS[Math.min(data.ringIndex, RING_BASS_FREQS.length - 1)];
    this.oscSaw.frequency.rampTo(targetFreq, 0.14);
    this.oscSub.frequency.rampTo(targetFreq * 0.5, 0.16);
    this.lfo.min = Math.max(70, targetFreq * 1.2);
    this.lfo.max = Math.min(520, targetFreq * (4.4 + intensity * 2.2));

    this.lfo.frequency.value = 0.18 + intensity * 0.72;
    this.resLP.Q.value = 4.5 + intensity * 4.5;
    this.panner.pan.rampTo(data.positionX * 0.8 - 0.4, 0.12);
  }

  dispose(): void {
    this.oscSaw.dispose();
    this.oscSub.dispose();
    this.resLP.dispose();
    this.lfo.dispose();
    this.panner.dispose();
    this.gain.dispose();
  }
}

