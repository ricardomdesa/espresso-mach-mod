// Teste isolado de Wi-Fi AP no ESP32-C3 Super Mini.
//
// Objetivo: validar o rádio Wi-Fi e o fluxo de provisionamento (modo AP)
// ANTES de integrar ao firmware principal (Fase 2). Este sketch NÃO faz
// parte do firmware MVP — é um teste de bancada.
//
// O que ele faz:
//   1. Sobe em modo AP com SSID "Philco-Setup" (sem senha, rede aberta).
//   2. IP fixo 192.168.4.1 (padrão do ESP32 em modo AP).
//   3. Sobe um servidor HTTP simples na porta 80 com uma página de status.
//   4. Loga no Serial o estado do AP, clientes conectados e requisições.
//
// Como testar:
//   pio run -e wifi-ap-test -t upload
//   pio device monitor -e wifi-ap-test
//   Conectar o celular na rede "Philco-Setup" e abrir http://192.168.4.1
//
// Referência: ARCHITECTURE.md §"Provisionamento Wi-Fi (padrão IoT: AP + STA)".

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>

namespace {

constexpr const char *kApSsid = "Philco-Setup";
constexpr const char *kApPassword = ""; // rede aberta no teste (sem senha)
constexpr uint8_t kApChannel = 1;
constexpr bool kApHidden = false;
constexpr uint8_t kMaxClients = 4;

WebServer server(80);

// Página estática em PROGMEM — evita concatenação de String em runtime
// (causa comum de resposta vazia/tela branca no WebServer do ESP32).
static const char kPage[] PROGMEM =
    "<!DOCTYPE html><html><head><meta charset='utf-8'>"
    "<title>Philco-Setup</title></head><body>"
    "<h1>Philco Espresso Mod</h1>"
    "<p>Modo AP funcionando. IP: 192.168.4.1</p>"
    "<p>Heap livre: %lu bytes</p></body></html>";

void handleRoot() {
    Serial.println(F("[HTTP] GET /"));
    char buf[sizeof(kPage) + 16];
    int len = snprintf_P(buf, sizeof(buf), kPage, (unsigned long)ESP.getFreeHeap());
    Serial.printf("[HTTP] resposta: %d bytes\n", len);
    Serial.printf("[HTTP] conteudo: %s\n", buf);
    server.send(200, "text/html", buf);
}

void handleNotFound() {
    Serial.printf("[HTTP] 404: %s\n", server.uri().c_str());
    server.send(404, "text/plain", F("404: nao encontrado"));
}

void logClients() {
    Serial.print(F("Clientes conectados: "));
    Serial.println(WiFi.softAPgetStationNum());
}

} // namespace

void setup() {
    Serial.begin(115200);
    delay(200);

    Serial.println(F("=== Teste Wi-Fi AP ==="));

    // Modo AP. Sem senha (rede aberta) para facilitar o teste de bancada.
    // No firmware real o AP de provisionamento também é aberto (portal cativo).
    bool ok = WiFi.softAP(kApSsid, kApPassword, kApChannel, kApHidden, kMaxClients);
    if (!ok) {
        Serial.println(F("FALHA ao iniciar o AP"));
        return;
    }

    Serial.print(F("AP iniciado. SSID: "));
    Serial.println(kApSsid);
    Serial.print(F("IP do AP: "));
    Serial.println(WiFi.softAPIP());
    Serial.print(F("MAC do AP: "));
    Serial.println(WiFi.softAPmacAddress());

    server.on("/", handleRoot);
    server.onNotFound(handleNotFound);
    server.begin();
    Serial.println(F("Servidor HTTP na porta 80 (http://192.168.4.1)"));

    Serial.print(F("Heap livre: "));
    Serial.println(ESP.getFreeHeap());
}

void loop() {
    server.handleClient();

    // Loga mudanças de clientes conectados a cada 5s (sem delay bloqueante).
    static uint32_t lastLog = 0;
    if (millis() - lastLog >= 5000) {
        lastLog = millis();
        logClients();
    }
}