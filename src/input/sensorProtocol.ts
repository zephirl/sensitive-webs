/**
 * Wire protocol shared by every transport (Web Serial now, WebSocket later).
 *
 * The firmware emits one JSON line per sample with RAW touchRead values:
 *     {"ch":[58231, 57044, 58102, 58219]}
 * Direction is NOT assumed — on the XIAO ESP32-S3 the value drops on touch.
 * Per-wire rest/touch range + thresholds are applied in the webapp (see
 * page.tsx), which is direction-agnostic, so they tune live without re-flashing.
 */

/**
 * Minimum raw span |touch - rest| for a wire to count as calibrated. Below
 * this, normalization returns 0 so an un-calibrated wire reads empty until you
 * capture its rest + touch levels. Kept small because weakly-coupled wires can
 * have a swing of only a few hundred raw counts.
 */
export const MIN_SPAN = 80;

/**
 * Parse a single firmware line into the raw per-wire deviation array.
 * Returns null for malformed or partial lines (caller ignores them).
 */
export function parseSensorLine(line: string): number[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return null;

  let obj: unknown;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const channels = (obj as { ch?: unknown }).ch;
  if (!Array.isArray(channels) || channels.length === 0) return null;

  return channels.map((v) => (typeof v === "number" && v > 0 ? v : 0));
}
