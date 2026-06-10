# Sensitive Webs

Sensitive Webs is an interactive web that responds to gesture and turns it into a sonic atmosphere.

The idea isn't to "play" an instrument in the classic sense. The project is after a sensation — something between the web, the breath, the vibration, and a slow music that moves with the hand.

## What it does

On screen, a symmetric web breathes gently. You can interact in two ways:

- **With the mouse / touchscreen:** hovering over the web starts a musical pad that changes per ring; clicking plays a *breath cue* specific to the ring you touched.
- **With a real capacitive web** (enameled copper wires wired into a XIAO ESP32-S3): bringing your hand near a wire starts the proximity music, and firmly touching the wire fires the breath cue.

The output blends several layers:

- a deep, stable drone, like a bed
- a melodic part tied to the web's rings (the "proximity music")
- a lighter breath that gives air around it
- *breath cues* (samples) triggered on contact

## The two core gestures

The interface deliberately distinguishes two thresholds:

1. **Proximity** → starts the background music (the ring's melodic pad).
2. **Touch** → fires the breath cue (a sample, played once per contact).

With the mouse, "proximity" = hover and "touch" = click. On the physical web, these are two capacitance levels on the same wire.

## The capacitive web (XIAO ESP32-S3)

Each enameled copper wire maps to a ring (wire 0 → ring 0, etc.). The firmware (`firmware/xiao-sensor-web/`) reads every touch input and continuously streams the **raw** `touchRead` value over USB:

```json
{"ch":[58231, 57044, 58102, 58219]}
```

No calibration happens on the Arduino: all normalization and thresholds live in the web app, per wire, and stay adjustable live without re-flashing. On the ESP32-S3 the value **drops** as a hand approaches — the app handles the direction automatically.

### Connecting the web

1. Flash `firmware/xiao-sensor-web/xiao-sensor-web.ino` onto the XIAO ESP32-S3.
2. Open the app in **Chrome or Edge** (Web Serial isn't available in Safari/Firefox).
3. Click **Connect web** and pick the XIAO's serial port.

## The calibration panel

The **Calibrate** button opens a panel with one block per wire. Everything is in **raw** units, with three sliders:

- **Min prox** — start of proximity sensing: music volume is 0 here.
- **Max prox** — end of proximity sensing: music volume is full here.
- **Touch** — level where the breath cue fires.

So the **music volume ramps from Min prox to Max prox**: `volume = (raw − minProx) / (maxProx − minProx)`, clamped 0–1. Below Min prox the wire is silent; from Max prox onward the music is at full volume. The **breath cue** fires once the signal reaches the **Touch** level.

To calibrate a wire:

1. With your hand far, click **Set min** (the idle / far level).
2. Hold your hand at the closest "music" distance, click **Set max**.
3. Touch the wire, click **Set touch**.
4. Fine-tune the three sliders. The `seen lo–hi` line shows the observed raw range, which helps place them.

Defaults per wire are **Min prox 30000 · Max prox 31000 · Touch 100000**.

Each block shows two visualizers:

- A **colour bar** of the music volume (Min prox→Max prox). Grey at zero, yellow while the music plays, green once the signal reaches Touch.
- A **raw signal strip** with tick marks for min prox / max prox / touch and a white marker for the live raw value.

The mapping is direction-agnostic — it works whether approaching raises or lowers the raw value.

**Save / Reset** (top of the panel) persist the current calibration to the browser's localStorage, or restore the defaults. Saved settings are reloaded automatically next time you open the app.

## Silence all

The **Silence all** button (top-right) immediately stops the ambient note and every playing breath cue — a panic/stop control for performances.

## Breath cues (mp3)

You can drop your own samples into `public/audio/breath-cues/`, named:

```
ring-{ring}-{n}_anything.mp3
```

For example `ring-0-1_inhale.mp3`, `ring-0-2_inhale-soft.mp3`, `ring-1-1_exhale.mp3`. Multiple files per ring are allowed — one is picked at random on each contact. If a ring has no file, a synthesized fallback tone is played.

## Web geometry

Two `−` / `+` controls (bottom-left) adjust the drawn web:

- **Vertices** — number of branches (spokes), from **1 to 8**. Default **6**.
- **Rings** — number of concentric rings, from **1 to 8**. Default **4**, matching the 4-wire physical web.

These controls are **purely visual** — the audio mapping (which note / breath-cue file plays) is fixed and does not shift when you add or remove rings. Each hardware wire always maps to its own ring index (wire 0 → `ring-0`, etc.).

## Running the project

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Then open the URL shown in the terminal (usually `http://localhost:3000`, or `3001` if the port is taken).

## Stack

- Next.js
- React
- TypeScript
- Tone.js
- Web Serial API (reading the XIAO ESP32-S3)

## Intent

The project was conceived as a sensory experience, not a technical demo. The goal is for the gesture to stay legible, for the sound to respond immediately, and for the whole thing to keep something calm, strange, and alive.
