from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS
# pyrefly: ignore [missing-import]
from flask_jwt_extended import (
    JWTManager, create_access_token, jwt_required, get_jwt_identity
)
import os
import time
import subprocess
import mysql.connector
import mysql.connector.pooling
import requests as req_lib
import numpy as np
import re
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
from PIL import Image

app = Flask(__name__)
CORS(app, resources={r"/*": {
    "origins": "*",
    "allow_headers": ["Content-Type", "Authorization"],
    "methods": ["GET", "POST", "DELETE", "OPTIONS"]
}})

# ========================
# JWT CONFIG
# ========================
app.config['JWT_SECRET_KEY'] = 'alpr-secret-key-change-in-production'
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=12)
jwt = JWTManager(app)

# ========================
# APP CONFIG
# ========================
UPLOAD_FOLDER = os.environ.get("UPLOAD_FOLDER", "/var/www/alpr-images")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

ESP32_STREAM_URL = "http://192.168.1.10:81/stream"

# In-memory cooldown tracker  {plate: datetime_of_last_alert}
alert_cooldown: dict = {}

# ========================
# DB SETTINGS STORE
# ========================

DEFAULT_SETTINGS = {
    'telegram_bot_token': '',
    'telegram_chat_id':   '',
    'cooldown_minutes':   '30',
    'esp32_stream_url':   'http://192.168.1.10:81/stream',
}

def get_setting(key: str) -> str:
    try:
        conn = get_db()
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT value FROM app_settings WHERE `key` = %s", (key,))
            row = cursor.fetchone()
            return row[0] if row else DEFAULT_SETTINGS.get(key, '')
        finally:
            cursor.close()
            conn.close()
    except Exception as e:
        print(f"⚠️  get_setting('{key}') failed: {e}")
        return DEFAULT_SETTINGS.get(key, '')

def set_setting(key: str, value: str):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO app_settings (`key`, value) VALUES (%s, %s) "
            "ON DUPLICATE KEY UPDATE value = VALUES(value)",
            (key, value)
        )
        conn.commit()
    finally:
        cursor.close()
        conn.close()

# ========================
# DB CONNECTION POOL
# ========================
db_pool = mysql.connector.pooling.MySQLConnectionPool(
    pool_name="parking_pool",
    pool_size=5,
    host="localhost",
    user="alpruser",
    password="NewStrongPassword123!",
    database="alpr_db"
)

def get_db():
    """Get a pooled connection."""
    return db_pool.get_connection()


# ========================
# HELPERS
# ========================

def hash_password(password: str) -> str:
    return generate_password_hash(password)


def normalize_plate(plate: str) -> str:
    """Insert space after prefix if OpenALPR omitted it.
    e.g. 'N22221' -> 'N 22221', 'MP128' -> 'MP 128'
    """
    plate = plate.strip().upper()
    if ' ' in plate:
        return plate
    m = re.match(r'^(MP|AG)(\d+)$', plate)
    if m:
        return f"{m.group(1)} {m.group(2)}"
    m = re.match(r'^([A-Z])(\d+)$', plate)
    if m:
        return f"{m.group(1)} {m.group(2)}"
    return plate


def validate_lebanese_plate(plate: str) -> bool:
    if re.match(r'^(MP|AG)\s\d{1,3}$', plate):
        num = int(plate.split()[1])
        return 1 <= num <= 128
    return bool(re.match(r'^[ABGKNSTOYZPM]\s\d{1,6}$', plate))


def send_telegram_alert(plate_number: str, confidence: float, filename: str):
    """Send Telegram message + photo for an unknown vehicle (with cooldown)."""
    bot_token = get_setting('telegram_bot_token')
    chat_id   = get_setting('telegram_chat_id')
    if not bot_token or not chat_id:
        print("⚠️  Telegram not configured — skipping alert")
        return

    try:
        cooldown_min = int(get_setting('cooldown_minutes') or 30)
    except Exception:
        cooldown_min = 30

    now  = datetime.now()
    last = alert_cooldown.get(plate_number)
    if last and (now - last) < timedelta(minutes=cooldown_min):
        print(f"  Telegram: cooldown active for {plate_number}")
        return

    alert_cooldown[plate_number] = now

    try:
        msg = (
            f"🚨 *Unknown Vehicle Detected!*\n"
            f"🔢 Plate: `{plate_number}`\n"
            f"📊 Confidence: {confidence:.1f}%\n"
            f"🕐 Time: {now.strftime('%Y-%m-%d %H:%M:%S')}"
        )
        req_lib.post(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            json={"chat_id": chat_id, "text": msg, "parse_mode": "Markdown"},
            timeout=5
        )
        img_path = os.path.join(UPLOAD_FOLDER, filename)
        if os.path.exists(img_path):
            with open(img_path, 'rb') as f:
                req_lib.post(
                    f"https://api.telegram.org/bot{bot_token}/sendPhoto",
                    data={"chat_id": chat_id},
                    files={"photo": f},
                    timeout=10
                )
        print(f"✅ Telegram alert sent for {plate_number}")
    except Exception as e:
        print(f"❌ Telegram error: {e}")


# ========================
# CAMERA FEED PROXY
# ========================

@app.route('/camera-feed')
def camera_feed():
    stream_url = get_setting('esp32_stream_url') or ESP32_STREAM_URL
    try:
        r = req_lib.get(stream_url, stream=True, timeout=10)
        return Response(
            r.iter_content(chunk_size=4096),
            content_type=r.headers.get('Content-Type', 'multipart/x-mixed-replace')
        )
    except Exception as e:
        return str(e), 502


# ========================
# SERVE IMAGES
# ========================

@app.route('/images/<path:filename>')
def get_image(filename):
    from flask import send_from_directory
    return send_from_directory(UPLOAD_FOLDER, filename)


# ========================
# AUTH
# ========================

@app.route('/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    username = (data.get('username') or '').strip()
    password = (data.get('password') or '')

    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400

    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM users WHERE username = %s", (username,))
        user = cursor.fetchone()
    finally:
        cursor.close()
        conn.close()

    if not user or not check_password_hash(user['password_hash'], password):
        return jsonify({"error": "Invalid credentials"}), 401

    token = create_access_token(identity=username)
    return jsonify({"token": token, "username": username})


@app.route('/auth/me')
@jwt_required()
def me():
    return jsonify({"username": get_jwt_identity()})




# ========================
# UPLOAD + ALPR
# ========================

@app.route('/upload', methods=['POST'])
def upload():
    try:
        filename = f"car_{int(time.time())}.jpg"
        full_path = os.path.join(UPLOAD_FOLDER, filename)

        width, height = 240, 240
        img_array = np.frombuffer(request.data, dtype=np.uint8)
        img_array = img_array.reshape((height, width))
        image = Image.fromarray(img_array, mode='L')
        image.save(full_path)
        print(f"\n✅ Image saved: {full_path}")

        # Run OpenALPR in Docker
        command = (
            f'docker run --rm '
            f'-v "{UPLOAD_FOLDER}:/data" '
            f'openalpr/openalpr '
            f'-c eu /data/{filename}'
        )
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        output = result.stdout
        print("\n===== ALPR RESULT =====")
        print(output)

        # Extract best plate by confidence
        plate_number  = "UNKNOWN"
        best_confidence = 0.0

        for line in output.splitlines():
            line = line.strip()
            if line.startswith("-"):
                parts = line.split()
                if len(parts) >= 4:
                    current_plate = parts[1]
                    try:
                        confidence = float(parts[3])
                        if confidence > best_confidence:
                            best_confidence = confidence
                            plate_number = current_plate
                    except ValueError:
                        pass

        print("Detected Plate:", plate_number)
        print("Best Confidence:", best_confidence)

        # Normalize: OpenALPR returns 'N22221', we need 'N 22221'
        if plate_number != "UNKNOWN":
            plate_number = normalize_plate(plate_number)

        # Validate Lebanese plate format
        if plate_number != "UNKNOWN" and not validate_lebanese_plate(plate_number):
            print(f"❌ Invalid Lebanese plate format: {plate_number}")
            plate_number = "UNKNOWN"

        # Check authorization
        status = "UNKNOWN"
        conn = get_db()
        cursor = conn.cursor(dictionary=True)
        try:
            if plate_number != "UNKNOWN":
                cursor.execute(
                    "SELECT * FROM authorized_vehicles WHERE plate_number = %s",
                    (plate_number,)
                )
                vehicle = cursor.fetchone()
                if vehicle:
                    status = "AUTHORIZED"

            # Insert detection record
            cursor.execute(
                """INSERT INTO detections (plate_number, confidence, status, image_path, alert_sent)
                   VALUES (%s, %s, %s, %s, %s)""",
                (plate_number, best_confidence, status, f"/images/{filename}", False)
            )
            conn.commit()
            print("✅ Detection inserted into DB")
        finally:
            cursor.close()
            conn.close()

        # Telegram alert for unknowns
        if status == "UNKNOWN" and plate_number != "UNKNOWN":
            send_telegram_alert(plate_number, best_confidence, filename)

        return jsonify({
            "plate_number": plate_number,
            "confidence": best_confidence,
            "status": status
        })

    except Exception as e:
        print("❌ ERROR:", e)
        return jsonify({"error": str(e)}), 500


# ========================
# DETECTIONS API
# ========================

@app.route('/api/detections')
@jwt_required()
def get_detections():
    status_filter = request.args.get('status')
    page     = max(int(request.args.get('page', 1)), 1)
    per_page = min(int(request.args.get('per_page', 20)), 100)
    offset   = (page - 1) * per_page

    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        if status_filter:
            cursor.execute(
                "SELECT * FROM detections WHERE status=%s AND plate_number != 'UNKNOWN' "
                "ORDER BY created_at DESC LIMIT %s OFFSET %s",
                (status_filter, per_page, offset)
            )
            data = cursor.fetchall()
            cursor.execute(
                "SELECT COUNT(*) as cnt FROM detections WHERE status=%s AND plate_number != 'UNKNOWN'",
                (status_filter,)
            )
        else:
            cursor.execute(
                "SELECT * FROM detections WHERE plate_number != 'UNKNOWN' "
                "ORDER BY created_at DESC LIMIT %s OFFSET %s",
                (per_page, offset)
            )
            data = cursor.fetchall()
            cursor.execute(
                "SELECT COUNT(*) as cnt FROM detections WHERE plate_number != 'UNKNOWN'"
            )

        total = cursor.fetchone()['cnt']
    finally:
        cursor.close()
        conn.close()

    for row in data:
        if row.get('created_at'):
            row['created_at'] = row['created_at'].strftime('%Y-%m-%d %H:%M:%S')

    return jsonify({"detections": data, "total": total, "page": page, "per_page": per_page})


@app.route('/api/detections/<int:detection_id>', methods=['DELETE'])
@jwt_required()
def delete_detection(detection_id):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM detections WHERE id = %s", (detection_id,))
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({"error": "Detection not found"}), 404
    finally:
        cursor.close()
        conn.close()
    return jsonify({"message": "Detection deleted"})


# ========================
# STATS API
# ========================

@app.route('/api/stats')
@jwt_required()
def get_stats():
    today = datetime.now().strftime('%Y-%m-%d')
    conn  = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT COUNT(*) as cnt FROM detections "
            "WHERE DATE(created_at)=%s AND plate_number != 'UNKNOWN'",
            (today,)
        )
        today_total   = cursor.fetchone()['cnt']

        cursor.execute(
            "SELECT COUNT(*) as cnt FROM detections "
            "WHERE status='UNKNOWN' AND plate_number != 'UNKNOWN' AND DATE(created_at)=%s",
            (today,)
        )
        today_unknown = cursor.fetchone()['cnt']

        cursor.execute("SELECT COUNT(*) as cnt FROM authorized_vehicles")
        known_total   = cursor.fetchone()['cnt']

        cursor.execute(
            "SELECT COUNT(*) as cnt FROM detections WHERE plate_number != 'UNKNOWN'"
        )
        all_time      = cursor.fetchone()['cnt']
    finally:
        cursor.close()
        conn.close()

    return jsonify({
        "today_total":    today_total,
        "today_unknown":  today_unknown,
        "known_total":    known_total,
        "all_time_total": all_time
    })


@app.route('/api/stats/chart')
@jwt_required()
def get_stats_chart():
    conn   = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT
                DATE(created_at)                                      AS day,
                SUM(status = 'AUTHORIZED')                            AS authorized,
                SUM(status = 'UNKNOWN' AND plate_number != 'UNKNOWN') AS unknown
            FROM detections
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
              AND plate_number != 'UNKNOWN'
            GROUP BY DATE(created_at)
            ORDER BY day ASC
        """)
        rows = cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

    result = []
    for row in rows:
        result.append({
            "day":        row["day"].strftime("%a %d"),
            "authorized": int(row["authorized"] or 0),
            "unknown":    int(row["unknown"]    or 0),
        })
    return jsonify(result)


# ========================
# WHITELIST (VEHICLES)
# ========================

@app.route('/api/vehicles', methods=['GET'])
@jwt_required()
def list_vehicles():
    conn = get_db()
    cursor = conn.cursor(dictionary=True)
    try:
        try:
            cursor.execute("SELECT * FROM authorized_vehicles ORDER BY created_at DESC")
        except mysql.connector.Error:
            try:
                cursor.execute("SELECT * FROM authorized_vehicles ORDER BY added_at DESC")
            except mysql.connector.Error:
                cursor.execute("SELECT * FROM authorized_vehicles ORDER BY id DESC")
        data = cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

    for row in data:
        for col in ('created_at', 'added_at'):
            if row.get(col):
                row[col] = row[col].strftime('%Y-%m-%d %H:%M:%S')

    return jsonify(data)


@app.route('/api/vehicles', methods=['POST'])
@jwt_required()
def add_vehicle():
    data  = request.get_json()
    plate = (data.get('plate_number') or '').strip().upper()
    owner = (data.get('owner_name')   or '').strip()
    notes = (data.get('notes')        or '').strip()
    added_by = get_jwt_identity()

    if not plate:
        return jsonify({"error": "Plate number required"}), 400

    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO authorized_vehicles (plate_number, owner_name, notes, added_by) VALUES (%s,%s,%s,%s)",
            (plate, owner, notes, added_by)
        )
        conn.commit()
    except mysql.connector.IntegrityError:
        return jsonify({"error": "Plate already exists in whitelist"}), 409
    finally:
        cursor.close()
        conn.close()

    return jsonify({"message": "Vehicle added successfully"})


@app.route('/api/vehicles/<plate>', methods=['DELETE'])
@jwt_required()
def delete_vehicle(plate):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM authorized_vehicles WHERE plate_number=%s", (plate,))
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({"error": "Vehicle not found"}), 404
    finally:
        cursor.close()
        conn.close()

    return jsonify({"message": "Vehicle removed successfully"})


# ========================
# SETTINGS API
# ========================

SETTING_KEYS = ['telegram_bot_token', 'telegram_chat_id', 'cooldown_minutes', 'esp32_stream_url']

@app.route('/api/settings', methods=['GET'])
@jwt_required()
def get_settings():
    return jsonify({k: get_setting(k) for k in SETTING_KEYS})


@app.route('/api/settings', methods=['POST'])
@jwt_required()
def save_settings():
    data = request.get_json() or {}
    for k in SETTING_KEYS:
        if k in data:
            set_setting(k, str(data[k]))
    return jsonify({"message": "Settings saved successfully"})


@app.route('/api/settings/test-telegram', methods=['POST'])
@jwt_required()
def test_telegram():
    body      = request.get_json() or {}
    bot_token = body.get('telegram_bot_token') or get_setting('telegram_bot_token')
    chat_id   = body.get('telegram_chat_id')   or get_setting('telegram_chat_id')

    if not bot_token or not chat_id:
        return jsonify({"error": "Bot token and Chat ID are required"}), 400

    try:
        r = req_lib.post(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            json={"chat_id": chat_id, "text": "👋 ParkGuard test message — Telegram is working!"},
            timeout=8
        )
        if r.status_code == 200:
            return jsonify({"message": "Test message sent successfully!"})
        else:
            return jsonify({"error": f"Telegram error: {r.text}"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ========================
# START
# ========================

if __name__ == '__main__':
    print("🚀 ALPR Parking Server started on http://0.0.0.0:5000")
    app.run(host='0.0.0.0', port=5000, debug=False)
