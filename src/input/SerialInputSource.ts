import { parseSensorLine } from "./sensorProtocol";
import type { SensorInputSource, SensorReadingHandler } from "./SensorInputSource";

/**
 * Web Serial transport — reads newline-delimited JSON from a USB-tethered
 * XIAO ESP32-S3. Supported in Chromium browsers (Chrome / Edge) over HTTPS
 * or http://localhost.
 *
 * To switch to WebSocket later, add a WebSocketInputSource implementing the
 * same SensorInputSource interface and reuse parseSensorLine().
 */

// Web Serial types are not in the default DOM lib; declare the minimum we use.
interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
}
interface SerialLike {
  requestPort(): Promise<SerialPortLike>;
}

export class SerialInputSource implements SensorInputSource {
  private port: SerialPortLike | null = null;
  private reader: ReadableStreamDefaultReader<string> | null = null;
  private keepReading = false;
  connected = false;

  constructor(
    private readonly onReading: SensorReadingHandler,
    private readonly baudRate = 115200,
  ) {}

  static isSupported(): boolean {
    return typeof navigator !== "undefined" && "serial" in navigator;
  }

  async start(): Promise<void> {
    if (!SerialInputSource.isSupported()) {
      throw new Error("Web Serial not supported — use Chrome or Edge.");
    }
    const serial = (navigator as unknown as { serial: SerialLike }).serial;
    this.port = await serial.requestPort();
    await this.port.open({ baudRate: this.baudRate });
    this.connected = true;
    this.keepReading = true;
    void this.readLoop();
  }

  private async readLoop(): Promise<void> {
    if (!this.port?.readable) return;
    const decoder = new TextDecoderStream();
    const writable = decoder.writable as unknown as WritableStream<Uint8Array>;
    const piped = this.port.readable.pipeTo(writable).catch(() => {});
    this.reader = decoder.readable.getReader();

    let buffer = "";
    try {
      while (this.keepReading) {
        const { value, done } = await this.reader.read();
        if (done) break;
        buffer += value;
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          const reading = parseSensorLine(line);
          if (reading) this.onReading(reading);
        }
      }
    } catch {
      // Device unplugged or stream error — fall through to cleanup.
    } finally {
      this.reader.releaseLock();
      await piped;
    }
  }

  async stop(): Promise<void> {
    this.keepReading = false;
    this.connected = false;
    try {
      await this.reader?.cancel();
    } catch {
      /* already closed */
    }
    try {
      await this.port?.close();
    } catch {
      /* already closed */
    }
    this.reader = null;
    this.port = null;
  }
}
