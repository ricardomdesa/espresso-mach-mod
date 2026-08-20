#include "WifiProvisioner.h"

#include <ESPmDNS.h>
#include <WiFi.h>

#include "rede.h"

namespace {
// Espera entre aceitar a credencial e derrubar o AP, para a resposta HTTP sair.
constexpr unsigned long kSwitchDelayMs = 800;
// Intervalo mínimo entre re-varreduras pedidas pelo app.
constexpr unsigned long kScanRetryMs = 3000;
} // namespace

void onWifiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
    if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
        // reason code ajuda a diagnosticar: 2=AUTH_EXPIRE, 15=4WAY_HANDSHAKE
        // (senha errada), 201=NO_AP_FOUND (rede 5GHz/fora de alcance),
        // 202=AUTH_FAIL, 205=CONNECTION_FAIL.
        Serial.printf("[wifi] STA desconectada, reason=%u\n",
                      static_cast<unsigned>(info.wifi_sta_disconnected.reason));
    }
}

void WifiProvisioner::begin() {
    WiFi.persistent(false); // a credencial é nossa, guardada na NVS do app
    WiFi.setAutoReconnect(true);
    WiFi.onEvent(onWifiEvent);

    // Hold do botão pediu o modo de configuração: sobe o AP direto, mesmo
    // com credencial salva. Flag one-shot (lida e limpa aqui).
    if (nvs_.consumeForceAp()) {
        Serial.println(F("[wifi] forca-AP ativa (hold do botao); abrindo configuracao"));
        startAp();
        return;
    }

    char ssid[33] = {0};
    char pass[65] = {0};

    if (nvs_.loadWifiSsid(ssid, sizeof(ssid))) {
        nvs_.loadWifiPassword(pass, sizeof(pass));
        Serial.printf("[wifi] credencial encontrada, conectando em \"%s\"...\n", ssid);
        if (startSta(ssid, pass)) {
            return;
        }
        Serial.println(F("[wifi] falha ao conectar; aguardando hold do botao para configurar"));
    } else {
        Serial.println(F("[wifi] sem credencial salva; aguardando hold do botao para configurar"));
    }

    // Sem AP automático no boot (segurança, regra do usuário): sem credencial
    // válida a máquina fica offline — o AP só abre com hold de 10 s na tela
    // inicial (requestAp()). O firmware MVP segue funcionando normalmente.
}

bool WifiProvisioner::startSta(const char *ssid, const char *password) {
    WiFi.softAPdisconnect(true);
    WiFi.mode(WIFI_STA);
    WiFi.setHostname(MDNS_HOSTNAME);
    WiFi.begin(ssid, (password != nullptr && password[0] != '\0') ? password : nullptr);

    const unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < STA_CONNECT_TIMEOUT_MS) {
        delay(200); // só no boot; o loop de controle ainda não começou
    }

    if (WiFi.status() != WL_CONNECTED) {
        WiFi.disconnect(true);
        mode_ = WifiMode::Offline;
        return false;
    }

    mode_ = WifiMode::Sta;
    staLostSinceMs_ = 0;
    Serial.print(F("[wifi] conectado. IP: "));
    Serial.println(WiFi.localIP());
    // Derruba qualquer AP residual (ex.: hold do botão aconteceu entre
    // begin() e a conexão STA) — AP e STA não coexistem neste produto.
    WiFi.softAPdisconnect(true);
    startMdns();
    return true;
}

void WifiProvisioner::startAp() {
    WiFi.disconnect(true);
    // AP_STA (e não AP puro): o rádio precisa da interface STA ativa para
    // varrer as redes do usuário em GET /api/wifi/scan.
    WiFi.mode(WIFI_AP_STA);

    // Varre ANTES de subir o AP: sem softAP no ar a varredura funciona, e o
    // resultado já fica em cache para a primeira consulta do app.
    scanNow();

    const bool ok = WiFi.softAP(AP_SSID, AP_PASSWORD, AP_CHANNEL, false, AP_MAX_CLIENTS);
    mode_ = WifiMode::Ap;
    if (!ok) {
        Serial.println(F("[wifi] FALHA ao subir o AP de configuracao"));
        return;
    }
    Serial.print(F("[wifi] modo configuracao. SSID: " AP_SSID " IP: "));
    Serial.println(WiFi.softAPIP());
    startMdns(); // permite achar philco.local já no modo AP

}

void WifiProvisioner::startMdns() {
    MDNS.end();
    if (!MDNS.begin(MDNS_HOSTNAME)) {
        Serial.println(F("[wifi] mDNS nao iniciou"));
        return;
    }
    MDNS.addService("http", "tcp", API_PORT);
    Serial.println(F("[wifi] mDNS ativo: " MDNS_HOSTNAME ".local"));
}

bool WifiProvisioner::isConnected() const {
    return mode_ == WifiMode::Sta && WiFi.status() == WL_CONNECTED;
}

IPAddress WifiProvisioner::ip() const {
    if (mode_ == WifiMode::Sta) return WiFi.localIP();
    if (mode_ == WifiMode::Ap) return WiFi.softAPIP();
    return IPAddress(0, 0, 0, 0);
}

bool WifiProvisioner::provision(const char *ssid, const char *password) {
    if (ssid == nullptr || ssid[0] == '\0') return false;
    nvs_.saveWifiCredentials(ssid, password);
    Serial.printf("[wifi] credencial recebida para \"%s\"; trocando para STA\n", ssid);
    pendingSwitchAtMs_ = millis() + kSwitchDelayMs;
    return true;
}

void WifiProvisioner::forget() {
    nvs_.clearWifiCredentials();
    pendingSwitchAtMs_ = millis() + kSwitchDelayMs;
}

void WifiProvisioner::requestAp() {
    // Reinicia sempre (mesmo offline): o boot lê a flag e sobe o AP. Se
    // houver credencial salva, sem a flag o boot re-conectaria na STA —
    // por isso a flag é persistida e consumida no boot (one-shot).
    nvs_.setForceAp();
    Serial.println(F("[wifi] hold do botao completou; reiniciando para o modo de configuracao"));
    Serial.flush();
    ESP.restart();
}

void WifiProvisioner::requestScan() {
    scanRequested_ = true;
}

void WifiProvisioner::scanNow() {
    scanRequested_ = false;
    scanning_ = true;

    // Varredura síncrona. A assíncrona devolve WIFI_SCAN_FAILED (-2) de forma
    // consistente neste ESP32-C3 quando há um softAP no ar, então varremos de
    // uma vez e aceitamos o bloqueio: isto só roda no modo de provisionamento,
    // onde não existe loop de controle para atrasar.
    const int16_t n = WiFi.scanNetworks(false, true);

    scanning_ = false;
    if (n < 0) {
        Serial.printf("[wifi] varredura falhou (rc=%d)\n", n);
        WiFi.scanDelete();
        return;
    }

    scanCount_ = 0;
    for (int16_t i = 0; i < n && scanCount_ < kMaxScanResults; i++) {
        const String ssid = WiFi.SSID(i);
        if (ssid.isEmpty()) continue;
        ScanEntry &e = scanResults_[scanCount_];
        strncpy(e.ssid, ssid.c_str(), sizeof(e.ssid) - 1);
        e.ssid[sizeof(e.ssid) - 1] = '\0';
        e.rssi = static_cast<int8_t>(constrain(WiFi.RSSI(i), -128, 127));
        e.secure = WiFi.encryptionType(i) != WIFI_AUTH_OPEN;
        scanCount_++;
    }
    WiFi.scanDelete();
    Serial.printf("[wifi] varredura concluida: %u redes\n", scanCount_);
}

void WifiProvisioner::loop() {
    const unsigned long now = millis();

    // Re-varredura só no modo de provisionamento: em STA isso interromperia o
    // loop de controle sem necessidade.
    if (scanRequested_ && mode_ == WifiMode::Ap && (long)(now - scanNotBeforeMs_) >= 0) {
        scanNow();
        scanNotBeforeMs_ = millis() + kScanRetryMs;
    }

    // Troca agendada (após provisionar ou esquecer a rede). Reiniciar é o
    // caminho mais previsível: derruba AP, servidor e sockets de uma vez.
    if (pendingSwitchAtMs_ != 0 && (long)(now - pendingSwitchAtMs_) >= 0) {
        pendingSwitchAtMs_ = 0;
        Serial.println(F("[wifi] reiniciando para aplicar a nova configuracao"));
        Serial.flush();
        ESP.restart();
        return;
    }

    if (mode_ != WifiMode::Sta) return;

    // Perda de STA: registra o instante. Sem reabertura automática do AP —
    // reconfigurar exige hold do botão (segurança, regra do usuário).
    if (WiFi.status() == WL_CONNECTED) {
        staLostSinceMs_ = 0;
        return;
    }

    if (staLostSinceMs_ == 0) {
        staLostSinceMs_ = now;
    }
}
