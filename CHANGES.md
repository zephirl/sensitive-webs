# Changes since the original project

Summary of everything changed since the `Initial project commit`
(**52 files changed, +1,219 / −512 lines**).

The original was a screen-only, click-to-play spider-web instrument. It is now a
**hardware-driven (capacitive web on XIAO ESP32-S3) guided-meditation interface**
with proximity-vs-touch sound, a full per-wire calibration system, and the mouse
demoted to an optional emulator.

## 1. Interaction model (`src/app/page.tsx`)
- **Hover / proximity → music, touch → voice cue** (was: click plays a note, hold swells it).
- Hovering drives the ambient pad per ring; clicking (or touching a wire) fires that ring's voice-cue sample.
- The mouse is now an **optional emulator** that can be disabled entirely.

## 2. Hardware integration (new)
- **`firmware/xiao-sensor-web/xiao-sensor-web.ino`** — reads the capacitive wires (currently 4 on D0–D3) and streams **raw `touchRead`** as JSON lines over USB Serial. No on-device calibration; direction-agnostic.
- **`src/input/sensorProtocol.ts`** — JSON line parser + shared constants.
- **`src/input/SensorInputSource.ts`** — transport-agnostic interface (WebSocket could be added later).
- **`src/input/SerialInputSource.ts`** — Web Serial (USB) reader (Chrome/Edge).
- **Connect web** button feeds hardware readings into the same audio pipeline as the mouse.

## 3. Audio engine
- **`src/audio/layers/BreathCueLayer.ts`** (new) — plays per-ring voice-cue MP3s, **randomly picks** among multiple files per ring, with a synth fallback if none.
- **`src/app/api/breath-cues/route.ts`** (new) — server route that lists the MP3s so filenames can be free-form (`ring-{n}-{k}_anything.mp3`).
- **`SoundscapeEngine.ts`** — added `playBreathCue()`, `silenceAll()`, `setMuted()`, wired in `BreathCueLayer`.
- **`GrainLayer.ts`** — boosted proximity-music volume (~2.5×) so it sits under the voice cues.

## 4. Calibration / Settings panel
- Per-wire, all in **raw units**: **Min prox → Max prox** ramps the music volume; **Touch** triggers the voice cue.
- Live **colour bar** (grey → yellow → green) + **raw signal strip** with min/max/touch ticks and a live marker.
- **Set min / Set max / Set touch** capture buttons (Set min adds +30 headroom); sliders constrained `Min ≤ Max ≤ Touch`, never below 0.
- **Save / Reset** to `localStorage` (auto-loaded on next launch).
- Direction-agnostic normalization (handles the signal *dropping* on approach).
- Defaults: **Min prox 41000 · Max prox 42000 · Touch 50000**.

## 5. Visual web structure
- Spoke/vertex count and ring count are now **dynamic 1–8** (defaults: Vertices 6, Rings 4), via `+/−` controls in the Settings panel under "Visual Web Structure".
- Audio indexing decoupled from the visual ring count (changing rings no longer shifts which file plays).

## 6. Global controls (top-right)
- **🖱 Mouse on/off**, **🔊 Sound on/off** (muted by default), **◼ Reset voices** (panic stop).

## 7. Numbering & terminology
- Wires/rings are **1-based in the UI**; voice-cue files are 1-based to match (`ring-1-…` = Wire 1).
- Standardized terms: "cable" → **wire**, "circle" → **ring**, "breath cue" → **voice cue**.

## 8. Cleanup
- Removed unused `HypnoLayer.ts`, `SensorMockPanel.tsx`, empty `AlienLayer.ts`, and unused exports (`RING_FREQS`, `DEFAULT_PROXIMITY/TOUCH_THRESHOLD`).

## 9. Assets & docs
- Added **voice-cue MP3s** (`ring-1-1` … `ring-5-4`), an `OG/` folder of source audio, the **interface screenshot**, and **demo photos**.
- **README** fully rewritten in English: hackathon credits/links, interface overview, hardware + calibration + voice-cue docs, embedded images.
