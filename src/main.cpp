#include <Arduino.h>

#include "pinos.h"
#include "rede.h"
#include "calibracao.h"
#include "controle.h"
#include "config/NvsConfig.h"
#include "model/DisplayModel.h"
#include "sensors/SensorFake.h"
#include "sensors/SensorMax6675.h"
#include "sensors/SensorCalibrated.h"
#include "control/PidController.h"
#include "control/HeaterOutput.h"
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

// Temperatura: termopar tipo K via MAX6675 (SPI bit-bang), com decorator de
// calibração linear. Pressão segue fake — sensor de pressão é Fase 2.
SensorMax6675 tempRaw(PIN_THERMO_SCK, PIN_THERMO_CS, PIN_THERMO_SO);
SensorCalibrated tempSensor(tempRaw, TEMP_CAL_OFFSET, TEMP_CAL_GAIN);
SensorFake pressureSensor(9.0f, 0.5f, 3000.0f);
DisplayModel model(tempSensor, pressureSensor);

// Laço fechado de temperatura: PID -> time-proportioning -> SSR (PIN_ACTUATOR).
PidController pid(model, tempRaw);
HeaterOutput heater(PIN_ACTUATOR);

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

// Espelha o relé "temperatura pronta" (model.ready(), com histerese) no GPIO1,
// só quando muda. Contato seco pra extração manual sem o app.
void syncReady(const DisplayModel &model) {
    static int applied = -1;
    const int want = model.ready() ? READY_ACTIVE : READY_IDLE;
    if (want != applied) {
        digitalWrite(PIN_READY, want);
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

    // Relé "temperatura pronta" (GPIO1, mesmo módulo active-low da bomba):
    // aberto no boot. Pré-seta o latch em IDLE antes do pinMode pelo mesmo
    // motivo da bomba — evitar um pulso curto ao trocar o pino para OUTPUT.
    digitalWrite(PIN_READY, READY_IDLE);
    pinMode(PIN_READY, OUTPUT);
    digitalWrite(PIN_READY, READY_IDLE);

    // SSR de aquecimento: pino em OUTPUT e desligado. O PID começa a atuar no
    // primeiro loop, mas só depois que o termopar devolver uma leitura válida
    // (failsafe do PidController mantém duty 0 % até lá).
    heater.begin();

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

    // Laço de temperatura: calcula o duty e aciona o SSR dentro da janela.
    // Não bloqueia — tudo por millis().
    if (wifi.mode() == WifiMode::Ap) {
        // Modo de configuração: WiFi.scanNetworks() bloqueia este loop por
        // segundos de cada vez. Se o PID/SSR rodassem aqui, o GPIO do aquecedor
        // poderia ficar preso "ligado" durante um scan — sem o corte de
        // sobretemperatura (que vive no PidController::update()) rodar. Então o
        // aquecedor fica forçado desligado enquanto o AP está no ar;
        // provisionamento não é modo operacional (entra só via hold do botão e
        // reinicia pra aplicar). pid.reset() mantém o estado limpo pra retomada.
        heater.update(0.0f);
        pid.reset();
        model.setControlDebug(0.0f, tempRaw.msSinceLastValidRead());
    } else {
        pid.update();
        heater.update(pid.duty());
        // Telemetria pra /api/status e /ws (debug via WiFi, sem serial no PC).
        model.setControlDebug(pid.duty(), tempRaw.msSinceLastValidRead());
    }

    syncPump(model);
    syncReady(model);

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
