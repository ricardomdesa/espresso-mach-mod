#include <Arduino.h>

#include "pinos.h"
#include "rede.h"
#include "config/NvsConfig.h"
#include "model/DisplayModel.h"
#include "sensors/SensorFake.h"
#include "input/Button.h"
#include "net/ApiServer.h"
#include "net/WifiProvisioner.h"

namespace {

// Único botão do produto. Clique curto: liga/desliga o LED de iluminação.
// Hold de 5 s: sobe o AP de configuração (requestAp reinicia; o boot lê a flag
// e abre o AP). A barra de progresso do OLED não existe mais — o feedback do
// modo AP é o LED piscando.
constexpr unsigned long kButtonDebounceMs = 50UL;
constexpr unsigned long kSetupHoldMs = 5000UL;

Button button(PIN_BUTTON, kButtonDebounceMs, kSetupHoldMs);

// Período do pisca do LED enquanto o AP está no ar (sinaliza "modo setup").
// Uma piscada a cada 2 s: 1 s aceso, 1 s apagado.
constexpr unsigned long kApBlinkPeriodMs = 2000UL;

SensorFake tempSensor(93.0f, 2.0f, 4000.0f);
SensorFake pressureSensor(9.0f, 0.5f, 3000.0f);
DisplayModel model(tempSensor, pressureSensor);

NvsConfig nvs;
WifiProvisioner wifi(nvs);
ApiServer api(model, nvs, wifi);

// Espelha o estado lógico do LED (model) no GPIO, só quando muda. Em modo AP
// o pisca assume o pino e este espelho não roda.
void syncLight(const DisplayModel &model) {
    static int applied = -1;
    const int want = model.lightOn() ? HIGH : LOW;
    if (want != applied) {
        digitalWrite(PIN_LED, want);
        applied = want;
    }
}

// Espelha o estado lógico da bomba (model) no relé do GPIO0, só quando muda.
void syncPump(const DisplayModel &model) {
    static int applied = -1;
    const int want = model.pumpOn() ? PUMP_ACTIVE : PUMP_IDLE;
    if (want != applied) {
        digitalWrite(PIN_PUMP, want);
        applied = want;
    }
}

} // namespace

void setup() {
    Serial.begin(115200);
    delay(3000);

    button.begin();

    // LED de iluminação: ligado no boot (model.lightOn() default = true).
    pinMode(PIN_LED, OUTPUT);
    digitalWrite(PIN_LED, model.lightOn() ? HIGH : LOW);

    // Relé da bomba (módulo active-low): desligado no boot. Escreve o nível
    // IDLE ANTES do pinMode — no ESP32-C3 o latch de saída nasce em 0, e como
    // 0 = PUMP_ACTIVE isso daria um pulso curto no relé ao trocar o pino para
    // OUTPUT. Pré-setar o latch evita o clique.
    digitalWrite(PIN_PUMP, PUMP_IDLE);
    pinMode(PIN_PUMP, OUTPUT);
    digitalWrite(PIN_PUMP, PUMP_IDLE);

    // SSR de aquecimento: desligado no boot (driver do PID vem nos épicos 2-4).
    pinMode(PIN_ACTUATOR, OUTPUT);
    digitalWrite(PIN_ACTUATOR, LOW);

    // LED azul onboard: apagado no boot; pisca só no modo de configuração.
    pinMode(PIN_STATUS_LED, OUTPUT);
    digitalWrite(PIN_STATUS_LED, STATUS_LED_OFF);

    // Config persistida antes da rede: o JSON de status já sai com os valores
    // reais e o PID (épicos 2-4) encontra os setpoints prontos.
    nvs.begin();
    nvs.loadControl(model);

    // Wi-Fi é opcional: sem credencial a máquina fica offline; o AP de
    // configuração só abre com hold de 5 s do botão (requestAp()).
    wifi.begin();
    api.begin();

    Serial.print(F("Heap livre: "));
    Serial.println(ESP.getFreeHeap());
}

void loop() {
    button.update();
    model.update();
    syncPump(model);

    // LED de iluminação: sempre sob controle do app/botão (não pisca em setup,
    // pra não mexer na luz real da máquina).
    syncLight(model);

    // Modo de configuração (AP no ar): o LED azul onboard pisca (1 s on / 1 s
    // off) para sinalizar "setup". Fora do AP fica apagado.
    if (wifi.mode() == WifiMode::Ap) {
        digitalWrite(PIN_STATUS_LED,
                     (millis() % kApBlinkPeriodMs) < (kApBlinkPeriodMs / 2) ? STATUS_LED_ON
                                                                            : STATUS_LED_OFF);
    } else {
        digitalWrite(PIN_STATUS_LED, STATUS_LED_OFF);
    }

    // Clique curto: liga/desliga o LED de iluminação.
    if (button.clicked()) {
        model.setLightOn(!model.lightOn());
    }

    // Hold de 5 s: entra no modo de configuração. Ignorado se o AP já está no
    // ar (evita reboot à toa).
    if (button.longPressed() && wifi.mode() != WifiMode::Ap) {
        wifi.requestAp();
    }

    // Rede: ambos são não-bloqueantes. O servidor HTTP/WS é assíncrono (roda
    // na task do AsyncTCP); aqui só publicamos o frame de streaming e
    // monitoramos a conexão STA.
    wifi.loop();
    api.loop();
}
