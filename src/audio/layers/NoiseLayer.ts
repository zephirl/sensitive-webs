/**
 * NoiseLayer – lightweight forest air
 *
 * One brown-noise source, two filters and one panner. This keeps the air and
 * foliage texture without the heavy parallel/reverb graph.
 */

import * as Tone from "tone";
import type { MappedSensorData } from "../SensorInputMapper";

export class NoiseLayer {
  private noise:   Tone.Noise;
  private lowpass: Tone.Filter;
  private bandpass: Tone.Filter;
  private lfoMid:  Tone.LFO;
  private gain:    Tone.Gain;
  private panner:  Tone.Panner;
  private started = false;

  constructor() {
    this.noise   = new Tone.Noise({ type: "brown", volume: -28 });
    this.lowpass = new Tone.Filter({ type: "lowpass", frequency: 2400, rolloff: -12 });
    this.bandpass = new Tone.Filter({ type: "bandpass", frequency: 1400, Q: 1.8 });
    this.lfoMid  = new Tone.LFO({ frequency: 0.025, min: 700, max: 2200, type: "sine" });
    this.gain    = new Tone.Gain(0.10);
    this.panner  = new Tone.Panner(0);

    this.noise.connect(this.lowpass);
    this.lowpass.connect(this.bandpass);
    this.bandpass.connect(this.gain);
    this.gain.connect(this.panner);
    this.panner.toDestination();
  }

  start() {
    if (this.started) return;
    this.lfoMid.connect(this.bandpass.frequency);
    this.noise.start();
    this.lfoMid.start();
    this.started = true;
  }

  update(data: MappedSensorData) {
    const g = 0.08 + (data.touch ? data.intensity * 0.05 : 0);
    this.gain.gain.rampTo(g, 0.15);

    this.lfoMid.frequency.value = 0.025 + data.intensity * 0.04;
    this.lowpass.frequency.rampTo(1400 + data.intensity * 1800, 0.14);

    this.panner.pan.rampTo(data.positionX * 2 - 1, 0.1);
  }

  dispose() {
    this.noise.dispose();
    this.lowpass.dispose();
    this.bandpass.dispose();
    this.lfoMid.dispose();
    this.gain.dispose();
    this.panner.dispose();
  }
}

