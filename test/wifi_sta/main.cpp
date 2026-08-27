// Teste isolado de Wi-Fi STA (cliente) no ESP32-C3 Super Mini.
//
// Objetivo: verificar se o rádio Wi-Fi da placa conecta numa rede normal
// (2,4 GHz) e pega IP via DHCP. Se ISSO falhar, o problema é a placa/rádio/
// antena, não o firmware. Se conectar e pegar IP aqui mas o modo AP não
// entrega IP aos clientes, o problema é o servidor DHCP do softAP.
//
// Como usar:
//   1. Preencha kSsid / kPass abaixo com a sua rede 2,4 GHz.
//   2. pio run -e wifi-sta-test -t upload
//   3. pio device monitor -e wifi-sta-test   (ou o monitor externo)
//
// Referência: ARCHITECTURE.md §"Provisionamento Wi-Fi".

#include <Arduino.h>
#include <WiFi.h>

namespace {

// >>> EDITE AQUI <<<  (rede 2,4 GHz; o ESP32-C3 não enxerga 5 GHz)
// NÃO comitar credencial real aqui.
constexpr const char *kSsid = "COLOQUE_O_SSID";
constexpr const char *kPass = "COLOQUE_A_SENHA";

// Teste de brownout: baixa a potência de TX para reduzir os picos de corrente
// no handshake de autenticação. Se com isto o ESP associar e pegar IP (e sem
// isto não), o problema é alimentação (cabo/porta USB), não a rede.
//   true  -> força TX baixo (~8,5 dBm)
//   false -> potência padrão (~20 dBm)
constexpr bool kLowTxPower = true;

void onWifiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
    switch (event) {
    case ARDUINO_EVENT_WIFI_STA_CONNECTED:
        Serial.println(F("[sta] associado ao AP (L2 ok), aguardando IP..."));
        break;
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
        Serial.print(F("[sta] GOT_IP: "));
        Serial.println(WiFi.localIP());
        Serial.print(F("[sta] gateway: "));
        Serial.println(WiFi.gatewayIP());
        Serial.print(F("[sta] RSSI: "));
        Serial.println(WiFi.RSSI());
        break;
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
        Serial.printf("[sta] desconectado, reason=%u\n",
                      static_cast<unsigned>(info.wifi_sta_disconnected.reason));
        break;
    default:
        break;
    }
}

} // namespace

void setup() {
    Serial.begin(115200);
    delay(2000);
    Serial.println(F("=== Teste Wi-Fi STA ==="));
    Serial.printf("[sta] tentando conectar em \"%s\"...\n", kSsid);

    WiFi.persistent(false);
    WiFi.onEvent(onWifiEvent);
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);

    if (kLowTxPower) {
        WiFi.setTxPower(WIFI_POWER_8_5dBm);
        Serial.println(F("[sta] TX power reduzido: WIFI_POWER_8_5dBm"));
    }
    Serial.printf("[sta] TX power atual: %d (unid. 0,25 dBm)\n", WiFi.getTxPower());

    WiFi.begin(kSsid, kPass);
}

void loop() {
    static uint32_t last = 0;
    if (millis() - last >= 3000) {
        last = millis();
        Serial.printf("[sta] status=%d  IP=%s  RSSI=%ld\n", WiFi.status(),
                      WiFi.localIP().toString().c_str(), (long)WiFi.RSSI());
    }
}
