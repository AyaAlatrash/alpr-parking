-- ============================================================
-- ALPR Parking System — Phase 2 Database Migration
-- Run this in MySQL against the `parking_system` database
-- ============================================================

USE parking_system;

-- 1. Admin users table for web login
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(64) NOT NULL,        -- SHA-256 hex
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Add missing columns to authorized_vehicles (skip if already exist)
ALTER TABLE authorized_vehicles
  ADD COLUMN IF NOT EXISTS owner_name VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS notes VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS added_by VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- 3. Add missing columns to detections
ALTER TABLE detections
  ADD COLUMN IF NOT EXISTS confidence FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS alert_sent BOOLEAN DEFAULT FALSE;

-- 4. Seed a default admin account
--    Password is "admin123" (SHA-256 hash)
--    CHANGE THIS PASSWORD after first login!
INSERT IGNORE INTO users (username, password_hash)
VALUES (
  'admin',
  '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9'
);

-- 5. App settings table (key-value store for runtime config)
CREATE TABLE IF NOT EXISTS app_settings (
  `key`       VARCHAR(100) PRIMARY KEY,
  `value`     TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 5. App settings table (for Telegram / ESP32 config via UI)
CREATE TABLE IF NOT EXISTS app_settings (
  `key`       VARCHAR(64) PRIMARY KEY,
  value       VARCHAR(500) NOT NULL DEFAULT '',
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Verify
SELECT 'Migration complete!' AS status;
SELECT * FROM users;
