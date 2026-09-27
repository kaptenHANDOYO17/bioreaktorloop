/* =====================================================================
   MBG-BIOLOOP AI: firmware kontroler ESP32
   ---------------------------------------------------------------------
   Membaca sensor bioreaktor, mengirim data ke server (MODE=sensor),
   menjalankan perintah dari dashboard/Telegram/AI, dan TETAP menjaga
   suhu serta keselamatan secara lokal walau WiFi atau server mati.

   Pustaka (Arduino IDE > Tools > Manage Libraries):
     - OneWire (Paul Stoffregen)
     - DallasTemperature (Miles Burton)
     - ArduinoJson (Benoit Blanchon) versi 7.x
   Board: "ESP32 Dev Module" (paket esp32 by Espressif)

   PERINGATAN LISTRIK
   - ADC ESP32 maksimal 3,3 V. Sensor 5 V (MPX5010DP, MQ-4, modul pH)
     WAJIB lewat pembagi tegangan, misalnya 10 kΩ (atas) + 20 kΩ (bawah).
   - Relay untuk katup 12/24 V atau pompa: pakai modul relay ber-optocoupler
     dan catu daya terpisah. Jangan menyalakan beban dari pin ESP32.
   - Semua kabel dan kotak kontroler di luar zona gas (≥ 1 m dari tangki),
     kotak tertutup (IP65). Jangan memasang saklar/relay di dekat titik bocor.
   ===================================================================== */
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>

/* ---------- 1. ISI BAGIAN INI ---------- */
const char* WIFI_SSID   = "NAMA_WIFI";
const char* WIFI_PASS   = "PASSWORD_WIFI";
// Salin dua baris ini dari Panel Admin → Perangkat → Daftarkan perangkat
const char* SERVER_URL  = "https://nama-proyek-anda.vercel.app";  // atau http://192.168.1.10:3000 untuk server lokal
const char* DEVICE_KEY  = "blk_isi_dengan_kunci_perangkat";
const char* FW_VERSION  = "3.0.0";

/* ---------- 2. PIN ---------- */
const int PIN_DS18B20   = 4;    // data DS18B20 (+ resistor 4,7 kΩ ke 3,3 V)
const int PIN_PH        = 34;   // modul pH (PH-4502C) lewat pembagi tegangan
const int PIN_PRESS     = 35;   // MPX5010DP lewat pembagi tegangan
const int PIN_MQ4       = 32;   // MQ-4 (AO) lewat pembagi tegangan
const int PIN_US_TRIG   = 5;    // JSN-SR04T trig
const int PIN_US_ECHO   = 18;   // JSN-SR04T echo (lewat pembagi bila modul 5 V)
const int RELAY_HOT     = 25;   // katup solenoid air panas
const int RELAY_COLD    = 26;   // katup solenoid air dingin
const int RELAY_BUFFER  = 27;   // pompa dosis larutan NaHCO3
const int RELAY_STOVE   = 14;   // katup gas kompor (normally closed)
const int RELAY_STIR    = 12;   // motor pengaduk
const int RELAY_DRAIN   = 13;   // katup bawah bermotor (pengurasan endapan)
const int PIN_BUZZER    = 33;   // buzzer peringatan lokal
const bool RELAY_ACTIVE_LOW = true;   // kebanyakan modul relay aktif LOW

/* ---------- 3. KALIBRASI ---------- */
const float ADC_DIVIDER   = 1.5;      // 10k/20k → tegangan asli = baca × 1,5
float PH_V7   = 2.50;                 // tegangan modul pada larutan pH 7 (ukur sendiri)
float PH_SLOPE = 0.18;                // selisih volt per 1 pH (ukur dengan larutan pH 4)
const float DRUM_AREA_M2  = 0.430;    // π × 0,37² m (drum Ø 74 cm)
float US_REST_CM  = 95.0;             // jarak sensor → atap drum saat drum KOSONG (turun penuh)
const float DRUM_RISE_MAX_CM = 65.0;  // tinggi naik maksimal drum
float MQ4_V_CLEAN = 0.40;             // tegangan MQ-4 di udara bersih (setelah pemanasan 24 jam)
float MQ4_V_PER_LEL = 0.030;          // perkiraan kasar volt per 1% LEL, kalibrasi dengan gas uji
const float BUFFER_G_PER_S = 1.6;     // gram NaHCO3 per detik pompa (larutan 80 g/L × 20 mL/s)
const float DRAIN_L_PER_S  = 0.5;     // liter per detik saat katup bawah terbuka

/* ---------- 4. BATAS (akan diperbarui dari server) ---------- */
float SET_T = 35.0, SET_BAND = 2.0, SET_PMAX = 12.0;
bool autoMode = true;

/* ---------- keadaan ---------- */
OneWire oneWire(PIN_DS18B20);
DallasTemperature ds(&oneWire);
float T = NAN, pH = NAN, pressMbar = NAN, lel = 0, gasL = NAN;
bool hotOn = false, coldOn = false, stoveOn = false, stirOn = true;
unsigned long bufferUntil = 0, drainUntil = 0, lastPost = 0, lastSensor = 0, lastStir = 0;
const unsigned long POST_EVERY_MS = 10000;   // kirim data tiap 10 detik

void relay(int pin, bool on) { digitalWrite(pin, (on ^ RELAY_ACTIVE_LOW) ? HIGH : LOW); }
float readVolt(int pin) { uint32_t s = 0; for (int i = 0; i < 16; i++) s += analogReadMilliVolts(pin); return s / 16.0 / 1000.0 * ADC_DIVIDER; }

float readUltrasonicCm() {
  digitalWrite(PIN_US_TRIG, LOW); delayMicroseconds(3);
  digitalWrite(PIN_US_TRIG, HIGH); delayMicroseconds(20); digitalWrite(PIN_US_TRIG, LOW);
  unsigned long d = pulseIn(PIN_US_ECHO, HIGH, 30000UL);
  return d ? d * 0.0343 / 2.0 : NAN;
}

void readSensors() {
  ds.requestTemperatures();
  float t = ds.getTempCByIndex(0); if (t > -50 && t < 100) T = t;
  float vph = readVolt(PIN_PH); pH = 7.0 + (PH_V7 - vph) / PH_SLOPE;
  // MPX5010DP: Vout = Vs × (0,09 × P[kPa] + 0,04), Vs = 5 V; 1 kPa = 10 mbar
  float vp = readVolt(PIN_PRESS); pressMbar = max(0.0f, ((vp / 5.0f) - 0.04f) / 0.09f * 10.0f);
  float vm = readVolt(PIN_MQ4); lel = constrain((vm - MQ4_V_CLEAN) / MQ4_V_PER_LEL, 0.0f, 100.0f);
  float cm = readUltrasonicCm();
  if (!isnan(cm)) { float rise = constrain(US_REST_CM - cm, 0.0f, DRUM_RISE_MAX_CM); gasL = DRUM_AREA_M2 * rise / 100.0f * 1000.0f; }
  lastSensor = millis();
}

/* ---------- kendali lokal: tetap jalan tanpa server ---------- */
void setHot(bool on)  { hotOn = on; if (on) coldOn = false; relay(RELAY_HOT, hotOn); relay(RELAY_COLD, coldOn); }
void setCold(bool on) { coldOn = on; if (on) hotOn = false; relay(RELAY_HOT, hotOn); relay(RELAY_COLD, coldOn); }
void setStove(bool on) { stoveOn = on; relay(RELAY_STOVE, on); }

void localControl() {
  // 1) KESELAMATAN: kebocoran gas → tutup katup kompor, bunyikan buzzer
  if (lel > 20) { setStove(false); digitalWrite(PIN_BUZZER, (millis() / 300) % 2); }
  else if (lel > 10) { setStove(false); digitalWrite(PIN_BUZZER, (millis() / 1000) % 2); }
  else digitalWrite(PIN_BUZZER, LOW);
  // 2) Gas habis → matikan kompor supaya tidak menyedot udara/air
  if (stoveOn && !isnan(pressMbar) && pressMbar < 2.0) setStove(false);
  // 3) Suhu otomatis (histeresis)
  if (autoMode && !isnan(T)) {
    if (T < SET_T - SET_BAND && !hotOn) setHot(true);
    else if (hotOn && T >= SET_T + 0.3) setHot(false);
    if (T > SET_T + SET_BAND && !coldOn) setCold(true);
    else if (coldOn && T <= SET_T - 0.3) setCold(false);
  }
  // 4) Pompa buffer & katup kuras berjalan dengan batas waktu
  relay(RELAY_BUFFER, millis() < bufferUntil);
  relay(RELAY_DRAIN, millis() < drainUntil);
  // 5) Pengaduk: 5 menit tiap 30 menit bila dinyalakan
  unsigned long ph = (millis() / 60000UL) % 30; relay(RELAY_STIR, stirOn && ph < 5);
  // 6) Sensor suhu mati → matikan pemanas (fail-safe)
  if (isnan(T) && hotOn) setHot(false);
}

/* ---------- perintah dari server ---------- */
void runCommand(JsonObject c) {
  const char* cmd = c["cmd"] | "";
  if (!strcmp(cmd, "buffer")) { float g = c["grams"] | 300; bufferUntil = millis() + (unsigned long)(g / BUFFER_G_PER_S * 1000); }
  else if (!strcmp(cmd, "drain")) { float L = c["liters"] | 20; drainUntil = millis() + (unsigned long)(L / DRAIN_L_PER_S * 1000); }
  else if (!strcmp(cmd, "stove")) { bool on = c["on"] | false; if (on && lel > 10) Serial.println("Kompor ditolak: bocor"); else setStove(on); }
  else if (!strcmp(cmd, "valve")) { const char* m = c["mode"] | "tutup"; if (strcmp(m, "tutup")) autoMode = false;
    if (!strcmp(m, "panas")) setHot(true); else if (!strcmp(m, "dingin")) setCold(true); else { setHot(false); setCold(false); } }
  else if (!strcmp(cmd, "auto")) autoMode = c["on"] | true;
  else if (!strcmp(cmd, "stir")) stirOn = c["on"] | true;
  else if (!strcmp(cmd, "setpoint")) { JsonObject s = c["set"]; SET_T = s["T"] | SET_T; SET_BAND = s["band"] | SET_BAND; SET_PMAX = s["Pmax"] | SET_PMAX; }
  Serial.printf("Perintah: %s\n", cmd);
}

void postData() {
  if (WiFi.status() != WL_CONNECTED) return;
  JsonDocument doc;
  if (!isnan(T)) doc["T"] = T;
  if (!isnan(pH)) doc["pH"] = pH;
  if (!isnan(pressMbar)) doc["press"] = pressMbar;
  doc["lel"] = lel;
  if (!isnan(gasL)) doc["vg"] = gasL;          // liter; server mengubahnya ke m³
  doc["hot"] = hotOn; doc["cold"] = coldOn; doc["stove"] = stoveOn;
  doc["fw"] = FW_VERSION;
  String body; serializeJson(doc, body);

  HTTPClient http; http.setTimeout(15000);
  String url = String(SERVER_URL) + "/api/sensor";
  static WiFiClientSecure tls; static WiFiClient plain;
  if (url.startsWith("https")) {
    // Vercel memakai HTTPS. setInsecure() melewati cek sertifikat agar mudah dipasang;
    // untuk keamanan lebih, ganti dengan tls.setCACert(<root CA>).
    tls.setInsecure(); http.begin(tls, url);
  } else http.begin(plain, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  int code = http.POST(body);
  if (code == 200) {
    JsonDocument res;
    if (!deserializeJson(res, http.getString())) for (JsonObject c : res["commands"].as<JsonArray>()) runCommand(c);
  } else Serial.printf("POST gagal: %d %s\n", code, http.getString().c_str());
  http.end();
}

void setup() {
  Serial.begin(115200);
  int outs[] = { RELAY_HOT, RELAY_COLD, RELAY_BUFFER, RELAY_STOVE, RELAY_STIR, RELAY_DRAIN };
  for (int p : outs) { pinMode(p, OUTPUT); relay(p, false); }
  pinMode(PIN_BUZZER, OUTPUT); pinMode(PIN_US_TRIG, OUTPUT); pinMode(PIN_US_ECHO, INPUT);
  analogReadResolution(12);
  ds.begin();
  WiFi.mode(WIFI_STA); WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.println("MBG-BIOLOOP ESP32 mulai. Menyambung WiFi...");
}

void loop() {
  static unsigned long lastRead = 0, lastWifi = 0;
  if (millis() - lastRead > 2000) { lastRead = millis(); readSensors(); localControl(); }
  if (WiFi.status() != WL_CONNECTED && millis() - lastWifi > 15000) { lastWifi = millis(); WiFi.reconnect(); }
  if (millis() - lastPost > POST_EVERY_MS) {
    lastPost = millis(); postData();
    Serial.printf("T=%.1f pH=%.2f P=%.1f mbar LEL=%.0f%% gas=%.0f L\n", T, pH, pressMbar, lel, gasL);
  }
  localControl();
  delay(50);
}
