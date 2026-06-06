#include "esp_camera.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include "ultrasonic.h"

const char* serverName = "http://209.74.89.108:5000/upload";

// ===========================
// Select camera model
// ===========================
#include "board_config.h"

// ===========================
// WiFi credentials
// ===========================
const char *ssid     = "Mohsen malaknet05480305";
const char *password = "alimadad12345";

void startCameraServer();
void setupLedFlash();

// ===========================
// Timing config
// ===========================
const unsigned long DWELL_MS    = 1500;  // confirm car is stopped (not walking past)
const unsigned long COOLDOWN_MS = 8000;  // min time between uploads

unsigned long lastUpload = 0;

// ===========================
void setup() {
  Serial.begin(115200);
  Serial.setDebugOutput(true);
  Serial.println();

  // ── Camera config (original working settings) ──────
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
  config.frame_size   = FRAMESIZE_QVGA;
  config.pixel_format = PIXFORMAT_GRAYSCALE;
  config.grab_mode    = CAMERA_GRAB_WHEN_EMPTY;
  config.fb_location  = CAMERA_FB_IN_PSRAM;
  config.jpeg_quality = 12;
  config.fb_count     = 1;

  if (config.pixel_format == PIXFORMAT_JPEG) {
    if (psramFound()) {
      config.jpeg_quality = 10;
      config.fb_count     = 2;
      config.grab_mode    = CAMERA_GRAB_LATEST;
    } else {
      config.frame_size  = FRAMESIZE_SVGA;
      config.fb_location = CAMERA_FB_IN_DRAM;
    }
  } else {
    config.frame_size = FRAMESIZE_240X240;
#if CONFIG_IDF_TARGET_ESP32S3
    config.fb_count = 2;
#endif
  }

#if defined(CAMERA_MODEL_ESP_EYE)
  pinMode(13, INPUT_PULLUP);
  pinMode(14, INPUT_PULLUP);
#endif

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed with error 0x%x", err);
    return;
  }

  sensor_t *s = esp_camera_sensor_get();
  if (s->id.PID == OV3660_PID) {
    s->set_vflip(s, 1);
    s->set_brightness(s, 1);
    s->set_saturation(s, -2);
  }
  if (config.pixel_format == PIXFORMAT_JPEG) {
    s->set_framesize(s, FRAMESIZE_QVGA);
  }

#if defined(CAMERA_MODEL_M5STACK_WIDE) || defined(CAMERA_MODEL_M5STACK_ESP32CAM)
  s->set_vflip(s, 1);
  s->set_hmirror(s, 1);
#endif

#if defined(CAMERA_MODEL_ESP32S3_EYE)
  s->set_hmirror(s, 0); delay(200);
  s->set_hmirror(s, 1); delay(200);
  s->set_vflip(s, 1);
#endif

#if defined(LED_GPIO_NUM)
  setupLedFlash();
#endif

  WiFi.begin(ssid, password);
  WiFi.setSleep(false);

  Serial.print("WiFi connecting");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("");
  Serial.println("WiFi connected");

  startCameraServer();  // starts stream on port 81 and web UI on port 80

  Serial.print("Camera Ready! Use 'http://");
  Serial.print(WiFi.localIP());
  Serial.println("' to connect");

  // Init ultrasonic AFTER camera server is running
  ultrasonicSetup();

  Serial.println("=== Ready — waiting for vehicles ===");
}

// ===========================
void loop() {

  // ── Step 1: Distance check (primary trigger) ──────
  long dist = getDistance();
  Serial.printf("Distance: %ld cm\n", dist);

  if (dist > MAX_DISTANCE_CM) {
    delay(200);
    return;  // nothing nearby — skip everything
  }

  // ── Step 2: Dwell check — confirm car is stopped ──
  Serial.println("Object detected — confirming...");
  delay(DWELL_MS);

  if (getDistance() > MAX_DISTANCE_CM) {
    Serial.println("False trigger — ignoring");
    delay(200);
    return;
  }

  // ── Step 3: Cooldown check ────────────────────────
  if (millis() - lastUpload < COOLDOWN_MS) {
    Serial.println("Cooldown active — skipping");
    delay(500);
    return;
  }

  // ── Step 4: Capture & upload ─────────────────────
  Serial.println(">>> Car confirmed — capturing...");

  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("Camera capture failed");
    delay(500);
    return;
  }

  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverName);
    http.addHeader("Content-Type", "application/octet-stream");
    http.setTimeout(10000);

    int code = http.POST(fb->buf, fb->len);
    Serial.printf("Server response: %d\n", code);
    http.end();

    if (code == 200) {
      lastUpload = millis();
      Serial.println("<<< Upload OK");
    }
  } else {
    Serial.println("WiFi lost — skipping upload");
    WiFi.reconnect();
  }

  esp_camera_fb_return(fb);
  delay(2000);
}
