// ultrasonic.h — HC-SR04 sensor helper (ESP32-safe, no pulseIn)
// Place this file in the same folder as cameraweb.ino

#ifndef ULTRASONIC_H
#define ULTRASONIC_H

#include <Arduino.h>

// ── Pin config ──────────────────────────────────────
#define TRIG_PIN        14
#define ECHO_PIN        38   // was 19 (USB D- pin — conflicts with WiFi/stream)
#define MAX_DISTANCE_CM 150   // ignore anything farther than this

// ── Setup (call once in setup()) ────────────────────
inline void ultrasonicSetup() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);
  delay(50); // let sensor stabilise
}

// ── Read distance in cm ──────────────────────────────
// Uses esp_timer_get_time() instead of pulseIn() to avoid
// cache conflicts with the ESP32-S3 camera DMA driver.
// Returns 999 if no object detected within range.
inline long getDistance() {
  const uint64_t TIMEOUT_US = 30000UL; // 30 ms = ~5 m max

  // Send 10µs trigger pulse
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  // Wait for ECHO to go HIGH (with timeout)
  uint64_t t0 = esp_timer_get_time();
  while (digitalRead(ECHO_PIN) == LOW) {
    if ((esp_timer_get_time() - t0) > TIMEOUT_US) return 999;
  }

  // Measure how long ECHO stays HIGH
  uint64_t start = esp_timer_get_time();
  while (digitalRead(ECHO_PIN) == HIGH) {
    if ((esp_timer_get_time() - start) > TIMEOUT_US) return 999;
  }
  uint64_t duration = esp_timer_get_time() - start;

  // Convert µs to cm: speed of sound = 0.034 cm/µs, divide by 2 (round trip)
  return (long)(duration * 0.034 / 2.0);
}

// ── Check if a car is within detection range ─────────
inline bool carInRange() {
  return getDistance() <= MAX_DISTANCE_CM;
}

#endif // ULTRASONIC_H
