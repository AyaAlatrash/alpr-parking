#include "esp_camera.h"
#include <WiFi.h>
#include <HTTPClient.h>

#include "board_config.h"
#include "ultrasonic.h"   // ← ultrasonic sensor

const char* serverName = "http://209.74.89.108/upload";

const char* ssid     = "Mohsen malaknet05480305";
const char* password = "alimadad12345";

// ===========================
// Motion detection settings
// ===========================
const int WIDTH  = 240;
const int HEIGHT = 240;

const int MOTION_THRESHOLD        = 15;    // per-pixel difference
const int CHANGED_PIXELS_THRESHOLD = 2000; // lowered from 4000 → easier trigger

unsigned long lastUpload = 0;
const unsigned long COOLDOWN_MS = 5000;   // 5 s between uploads

uint8_t* previousFrame = NULL;

// ===========================
void setup() {
  Serial.begin(115200);
  Serial.setDebugOutput(true);
  Serial.println("\n\n=== ParkGuard ESP32-S3 starting ===");

  // ── Camera config ──────────────────────────────────────────
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0       = Y2_GPIO_NUM;
  config.pin_d1       = Y3_GPIO_NUM;
  config.pin_d2       = Y4_GPIO_NUM;
  config.pin_d3       = Y5_GPIO_NUM;
  config.pin_d4       = Y6_GPIO_NUM;
  config.pin_d5       = Y7_GPIO_NUM;
  config.pin_d6       = Y8_GPIO_NUM;
  config.pin_d7       = Y9_GPIO_NUM;
  config.pin_xclk     = XCLK_GPIO_NUM;
  config.pin_pclk     = PCLK_GPIO_NUM;
  config.pin_vsync    = VSYNC_GPIO_NUM;
  config.pin_href     = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn     = PWDN_GPIO_NUM;
  config.pin_reset    = RESET_GPIO_NUM;

  config.xclk_freq_hz = 20000000;
  config.frame_size   = FRAMESIZE_240X240;
  config.pixel_format = PIXFORMAT_GRAYSCALE;
  config.grab_mode    = CAMERA_GRAB_WHEN_EMPTY;
  config.jpeg_quality = 12;
  config.fb_count     = 1;

  // Use PSRAM only if available — prevents brownout crashes
  if (psramFound()) {
    Serial.println("PSRAM found — using PSRAM frame buffer");
    config.fb_location = CAMERA_FB_IN_PSRAM;
  } else {
    Serial.println("No PSRAM — using DRAM frame buffer");
    config.fb_location = CAMERA_FB_IN_DRAM;
    config.frame_size  = FRAMESIZE_240X240; // keep small to fit in DRAM
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed: 0x%x — restarting in 3s\n", err);
    delay(3000);
    ESP.restart();
    return;
  }
  Serial.println("Camera init OK");

  // Optional sensor tweaks for ESP32S3 Eye
#if defined(CAMERA_MODEL_ESP32S3_EYE)
  sensor_t* s = esp_camera_sensor_get();
  s->set_hmirror(s, 1);
  s->set_vflip(s, 1);
#endif

  // ── WiFi ────────────────────────────────────────────────────
  WiFi.begin(ssid, password);
  WiFi.setSleep(false);

  // Reduce TX power → lower current draw → fewer brownouts
  WiFi.setTxPower(WIFI_POWER_11dBm);   // was 20 dBm by default

  Serial.print("Connecting to WiFi");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    if (++attempts > 40) {
      Serial.println("\nWiFi failed — restarting");
      ESP.restart();
    }
  }
  Serial.println();
  Serial.println("WiFi connected: " + WiFi.localIP().toString());
  Serial.printf("RSSI: %d dBm\n", WiFi.RSSI());

  // Warm-up delay: let power settle before first capture
  Serial.println("Warming up camera (2 s)...");
  ultrasonicSetup();   // ← init ultrasonic
  delay(2000);

  Serial.println("=== Ready — monitoring for motion + proximity ===");
}

// ===========================
void loop() {
  // ── Check distance first (cheap, skips camera if no car nearby) ──
  long dist = getDistance();
  Serial.printf("Distance: %ld cm\n", dist);

  if (!carInRange()) {
    // No car nearby — reset reference frame and skip
    if (previousFrame != NULL) {
      free(previousFrame);
      previousFrame = NULL;
    }
    delay(200);
    return;
  }

  // ── Car is close — now run motion detection ──
  camera_fb_t* fb = esp_camera_fb_get();

  if (!fb) {
    Serial.println("Camera capture failed — retrying in 500 ms");
    delay(500);
    return;
  }

  // Validate frame size matches expected 240×240
  if ((int)fb->len != WIDTH * HEIGHT) {
    Serial.printf("Unexpected frame size: %d (expected %d) — skipping\n",
                  fb->len, WIDTH * HEIGHT);
    esp_camera_fb_return(fb);
    delay(100);
    return;
  }

  // ── First frame: initialise reference buffer ──────────────
  if (previousFrame == NULL) {
    previousFrame = (uint8_t*) malloc(fb->len);
    if (!previousFrame) {
      Serial.println("malloc failed — restarting");
      esp_camera_fb_return(fb);
      delay(1000);
      ESP.restart();
      return;
    }
    memcpy(previousFrame, fb->buf, fb->len);
    esp_camera_fb_return(fb);
    Serial.println("Reference frame stored");
    delay(100);
    return;
  }

  // ── Motion detection ──────────────────────────────────────
  int changedPixels = 0;
  for (int i = 0; i < (int)fb->len; i++) {
    if (abs((int)fb->buf[i] - (int)previousFrame[i]) > MOTION_THRESHOLD)
      changedPixels++;
  }

  Serial.printf("Changed pixels: %d / %d\n", changedPixels, WIDTH * HEIGHT);

  unsigned long now = millis();

  // ── Upload if motion + cooldown elapsed ───────────────────
  if (changedPixels > CHANGED_PIXELS_THRESHOLD && (now - lastUpload) > COOLDOWN_MS) {

    Serial.println(">>> Motion detected — uploading image...");

    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("WiFi lost — reconnecting");
      WiFi.reconnect();
      delay(2000);
    } else {
      HTTPClient http;
      http.begin(serverName);
      http.addHeader("Content-Type", "application/octet-stream");
      http.setTimeout(10000);

      int code = http.POST(fb->buf, fb->len);
      Serial.printf("Server response: %d\n", code);
      http.end();

      if (code == 200) {
        lastUpload = now;
        Serial.println("<<< Upload successful");
      } else {
        Serial.println("<<< Upload failed");
      }
    }
  }

  // Update reference frame
  memcpy(previousFrame, fb->buf, fb->len);
  esp_camera_fb_return(fb);

  delay(100);
}
