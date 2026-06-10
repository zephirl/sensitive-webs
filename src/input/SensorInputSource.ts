/**
 * Transport-agnostic source of sensor readings. Implement this once per
 * transport (Web Serial, WebSocket, …); the UI only depends on this interface,
 * so swapping transports later means constructing a different class — nothing
 * downstream changes.
 */
export interface SensorInputSource {
  /** Open the connection. Must be called from a user gesture for Web Serial. */
  start(): Promise<void>;
  /** Close the connection and release resources. */
  stop(): Promise<void>;
  readonly connected: boolean;
}

/** Called for every parsed sample: the raw per-wire deviation array. */
export type SensorReadingHandler = (channels: number[]) => void;
