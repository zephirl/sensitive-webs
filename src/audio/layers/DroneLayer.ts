/**
 * DroneLayer – lightweight forest bed
 *
 * Reduced to two oscillators plus a small AM movement. The old version stacked
 * more oscillators, chorus and reverb, which was expensive for limited payoff.
 */

import * as Tone from "tone";
import type { MappedSensorData } from "../SensorInputMapper";

export class DroneLayer {
  private sub:       Tone.Oscillator;
  private osc1:      Tone.Oscillator;
  private amLfo:     Tone.LFO;
  private amGain:    Tone.Gain;
  private filter:    Tone.Filter;
  private tremolo:   Tone.Tremolo;
  private gain:      Tone.Gain;
  private started = false;

  constructor() {
    this.tremolo = new Tone.Tremolo({ frequency: 0.06, depth: 0.12 });
    this.filter  = new Tone.Filter({ type: "lowpass", frequency: 420, rolloff: -24 });
    this.gain    = new Tone.Gain(0.12);
    this.amGain  = new Tone.Gain(1);
    this.amLfo   = new Tone.LFO({ frequency: 0.11, min: 0.68, max: 1.0, type: "sine" });

    this.sub  = new Tone.Oscillator({ type: "sine",     frequency: 32.70, detune: 0, volume: -18 });
    this.osc1 = new Tone.Oscillator({ type: "triangle", frequency: 65.41, detune: 4, volume: -22 });

    [this.sub, this.osc1].forEach(o => o.connect(this.filter));
    this.filter.connect(this.tremolo);
    this.tremolo.connect(this.amGain);
    this.amGain.connect(this.gain);
    this.gain.toDestination();
  }

  start() {
    if (this.started) return;
    this.sub.start();
    this.osc1.start();
    this.tremolo.start();
    // Connect AM LFO here – AudioContext is fully running
    this.amLfo.connect(this.amGain.gain);
    this.amLfo.start();
    this.started = true;
  }

  update(data: MappedSensorData) {
    const targetGain = 0.10 + (data.touch ? data.intensity * 0.20 : 0);
    this.gain.gain.rampTo(targetGain, 0.12);

    this.filter.frequency.rampTo(180 + data.intensity * 620, 0.12);
    this.osc1.detune.rampTo((data.positionX - 0.5) * 10, 0.16);

    this.amLfo.frequency.value = 0.09 + data.intensity * 0.28;
  }

  dispose() {
    this.sub.dispose();
    this.osc1.dispose();
    this.filter.dispose();
    this.tremolo.dispose();
    this.amLfo.dispose();
    this.amGain.dispose();
    this.gain.dispose();
  }
}

