/*
 * Sensitive Webs — XIAO ESP32-S3 capacitive web firmware
 * ------------------------------------------------------------
 * Reads capacitive channels (one enameled-copper ring-wire per touch GPIO)
 * and streams the RAW touchRead value per wire to the browser app as one JSON
 * line per sample, e.g.:
 *
 *     {"ch":[58231,57044,58102,58219]}
 *
 * ch[i] = raw touchRead for wire i. On the XIAO ESP32-S3 this value DROPS as a
 * hand approaches/touches. All normalization and thresholds live in the WEBAPP
 * (direction-agnostic) — open the "Calibrate" panel to set them live without
 * re-flashing this firmware.
 *
 * BOARD: Seeed Studio XIAO ESP32-S3   (Arduino-ESP32 core 3.x)
 *
 * CURRENT WIRING — 4 enameled copper wires, enamel SCRAPED OFF at the pad:
 *   Ring 0 -> D0 (GPIO1)
 *   Ring 1 -> D1 (GPIO2)
 *   Ring 2 -> D2 (GPIO3)
 *   Ring 3 -> D3 (GPIO4)
 *
 * To add more rings later, append touch GPIOs to TOUCH_PINS, e.g. the next
 * touch-capable XIAO pads are D4(GPIO5), D5(GPIO6), D8(GPIO7), D9(GPIO8).
 *
 * CALIBRATION:
 *   - No firmware-side calibration. Per-cable rest/touch range + thresholds are
 *     all captured in the webapp "Calibrate" panel (direction-agnostic).
 */

#include <Arduino.h>

// Touch GPIOs, one per ring (index 0..NUM_CH-1). Edit to match your wiring.
const int   TOUCH_PINS[] = {4, 3, 2, 1};   // D3, D2, D1, D0
const int   NUM_CH       = sizeof(TOUCH_PINS) / sizeof(TOUCH_PINS[0]);

// The firmware emits the RAW touchRead value per wire (integers), with NO
// baseline subtraction and NO abs() — this preserves the true direction of the
// signal (on the XIAO ESP32-S3 the reading DROPS as a hand approaches/touches).
// All normalization + thresholds live in the webapp, per cable, and the webapp
// is direction-agnostic, so it works whether touch raises or lowers the value.

const int   SAMPLE_DELAY_MS = 20;     // ~50 Hz output

static long readChannel(int pin) {
  // Average a few samples to reduce jitter.
  long sum = 0;
  for (int s = 0; s < 4; s++) sum += touchRead(pin);
  return sum / 4;
}


void setup() {
  Serial.begin(115200);
  delay(800);  // let USB-CDC settle
}

void loop() {
  Serial.print("{\"ch\":[");
  for (int i = 0; i < NUM_CH; i++) {
    Serial.print(readChannel(TOUCH_PINS[i]));
    if (i < NUM_CH - 1) Serial.print(',');
  }
  Serial.println("]}");

  delay(SAMPLE_DELAY_MS);
}
