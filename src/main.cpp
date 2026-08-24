#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_SSD1306.h>

#include "pinos.h"
#include "rede.h"
#include "config/NvsConfig.h"
#include "model/DisplayModel.h"
#include "sensors/SensorFake.h"
#include "input/Button.h"
#include "net/ApiServer.h"
#include "net/WifiProvisioner.h"
#include "ui/ScreenManager.h"
#include "ui/Screens.h"

namespace {

Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);
Button buttonLeft(PIN_BTN_LEFT);
Button buttonRight(PIN_BTN_RIGHT);

// LED de iluminação: ligado por padrão no boot (não persistido). O botão
// direito na Tela 1 faz o toggle.
bool ledOn = true;

SensorFake tempSensor(93.0f, 2.0f, 4000.0f);
SensorFake pressureSensor(9.0f, 0.5f, 3000.0f);
DisplayModel model(tempSensor, pressureSensor);

NvsConfig nvs;
WifiProvisioner wifi(nvs);
ApiServer api(model, nvs, wifi);

const Screen screens[] = {
    {drawScreenReadings},
    {drawScreenTimer},
};
constexpr size_t kTimerScreenIndex = 1;

// Duração do hold do botão esquerdo na Tela 1 para abrir o modo de
// configuração (AP). Sem confirmação final: a barra de progresso é a
// confirmação visual.
constexpr unsigned long kSetupHoldMs = 10000UL;

// Duração do hold do botão direito na Tela 1 para entrar no ajuste de
// temperatura. Passo e faixa batem com o contrato da API (20-130 °C).
constexpr unsigned long kTempSetHoldMs = 5000UL;
constexpr float kTempStep = 0.5f;
constexpr float kTempMin = 20.0f;
constexpr float kTempMax = 130.0f;

// true = modo de ajuste de temperatura ativo (substitui a navegação normal).
bool editingTemp = false;

ScreenManager screenManager(screens, sizeof(screens) / sizeof(screens[0]));

void scanI2C() {
    Serial.println(F("Scanner I2C..."));
    for (uint8_t addr = 1; addr < 127; addr++) {
        Wire.beginTransmission(addr);
        if (Wire.endTransmission() == 0) {
            Serial.print(F("Dispositivo I2C encontrado em 0x"));
            Serial.println(addr, HEX);
        }
    }
}

} // namespace

void setup() {
    Serial.begin(115200);
    delay(200);

    Wire.begin(OLED_SDA, OLED_SCL);
    scanI2C();

    if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
        Serial.println(F("Falha ao iniciar OLED SSD1306"));
    }
    display.clearDisplay();
    display.display();

    buttonLeft.begin();
    buttonRight.begin();

    // LED de iluminação: ligado por padrão no boot.
    pinMode(PIN_LED, OUTPUT);
    digitalWrite(PIN_LED, ledOn ? HIGH : LOW);

    // Config persistida antes da rede: o JSON de status já sai com os valores
    // reais e o PID (épicos 2-4) encontra os setpoints prontos.
    nvs.begin();
    nvs.loadControl(model);

    // Wi-Fi é opcional (N4): sem credencial a máquina fica offline; o AP de
    // configuração só abre com hold de 10 s do botão na tela inicial.
    wifi.begin();
    api.begin();

    Serial.print(F("Heap livre: "));
    Serial.println(ESP.getFreeHeap());
}

// Hold de 10 s na Tela 1 abre o modo de configuração (AP). O hold é
// "por soltura": soltar antes do fim cancela. O AP nunca abre sozinho —
// nem no boot, nem por perda de STA (segurança).
void handleSetupHold(Adafruit_SSD1306 &display, Button &button, WifiProvisioner &wifi,
                     ScreenManager &screenManager) {
    static unsigned long holdStartMs = 0;

    if (button.isPressed() && screenManager.index() == 0) {
        if (holdStartMs == 0) {
            holdStartMs = millis();
        }
        if (millis() - holdStartMs >= kSetupHoldMs) {
            holdStartMs = 0;
            wifi.requestAp();
            return;
        }

        // Barra de progresso na faixa inferior (a tela normal segue atrás).
        const float frac = static_cast<float>(millis() - holdStartMs) / kSetupHoldMs;
        const uint8_t w = static_cast<uint8_t>(frac * (OLED_WIDTH - 8));
        display.fillRect(0, OLED_HEIGHT - 4, OLED_WIDTH, 4, SSD1306_BLACK);
        display.fillRect(0, OLED_HEIGHT - 4, w, 4, SSD1306_WHITE);
        display.display();
    } else {
        holdStartMs = 0; // soltou (ou trocou de tela) — cancela
    }
}

// Hold de 5 s do botão direito na Tela 1 entra no ajuste de temperatura.
// Mesmo padrão "por soltura" do handleSetupHold: soltar antes do fim cancela.
void handleTempSetHold(Adafruit_SSD1306 &display, Button &button,
                       ScreenManager &screenManager, bool &editing) {
    static unsigned long holdStartMs = 0;

    if (button.isPressed() && screenManager.index() == 0 && !editing) {
        if (holdStartMs == 0) {
            holdStartMs = millis();
        }
        if (millis() - holdStartMs >= kTempSetHoldMs) {
            holdStartMs = 0;
            editing = true;
            return;
        }

        const float frac = static_cast<float>(millis() - holdStartMs) / kTempSetHoldMs;
        const uint8_t w = static_cast<uint8_t>(frac * (OLED_WIDTH - 8));
        display.fillRect(0, OLED_HEIGHT - 4, OLED_WIDTH, 4, SSD1306_BLACK);
        display.fillRect(0, OLED_HEIGHT - 4, w, 4, SSD1306_WHITE);
        display.display();
    } else {
        holdStartMs = 0;
    }
}

// Modo de ajuste de temperatura: esquerdo = -0.5, direito = +0.5. Cada mudança
// é salva na NVS na hora (auto-salva); long press em qualquer botão sai.
void handleTempEdit(DisplayModel &model, NvsConfig &nvs, Button &left, Button &right,
                    bool &editing) {
    const auto clamp = [](float v) {
        if (v < kTempMin) return kTempMin;
        if (v > kTempMax) return kTempMax;
        return v;
    };

    if (right.clicked()) {
        model.setTempSetpoint(clamp(model.tempSetpoint() + kTempStep));
        nvs.saveTempSetpoint(model.tempSetpoint());
    }
    if (left.clicked()) {
        model.setTempSetpoint(clamp(model.tempSetpoint() - kTempStep));
        nvs.saveTempSetpoint(model.tempSetpoint());
    }
    if (left.longPressed() || right.longPressed()) {
        editing = false;
    }
}

void loop() {
    buttonLeft.update();
    buttonRight.update();
    model.update();

    // Indicador do OLED: o model é a fonte única da UI (N1). Atualizado antes
    // do draw para que a tela reflita o estado de rede do mesmo tick.
    switch (wifi.mode()) {
    case WifiMode::Sta:
        model.setNetworkStatus(wifi.isConnected() ? NetworkStatus::StaConnected
                                                  : NetworkStatus::Offline);
        break;
    case WifiMode::Ap:
        model.setNetworkStatus(NetworkStatus::ApActive);
        break;
    case WifiMode::Offline:
        model.setNetworkStatus(NetworkStatus::Offline);
        break;
    }

    // Modo de pareamento: o AP está no ar aguardando a credencial. A tela de
    // pairing substitui a navegação normal e o botão não navega — parear pelo
    // app é o único caminho para frente (provisionar → reboot → STA).
    if (wifi.mode() == WifiMode::Ap) {
        drawScreenPairing(display, model);
        wifi.loop();
        api.loop();
        return;
    }

    // Modo de ajuste de temperatura: substitui a navegação normal. Esquerdo
    // decrementa, direito incrementa; long press em qualquer um sai.
    if (editingTemp) {
        handleTempEdit(model, nvs, buttonLeft, buttonRight, editingTemp);
        drawScreenTempSet(display, model);
        wifi.loop();
        api.loop();
        return;
    }

    if (buttonLeft.clicked()) {
        if (screenManager.index() == kTimerScreenIndex) {
            model.timer().toggle();
            api.broadcastEvent(model.timer().isRunning() ? "extraction_started"
                                                         : "extraction_stopped");
        } else {
            screenManager.next();
        }
    }

    if (buttonLeft.longPressed()) {
        model.timer().reset();
        if (screenManager.index() == kTimerScreenIndex) {
            screenManager.next(); // volta p/ Tela 1 (única saída do "modo timer")
        }
    }

    // Botão direito: clique na Tela 1 liga/desliga o LED; hold de 5 s (também
    // na Tela 1) entra no ajuste de temperatura.
    if (buttonRight.clicked() && screenManager.index() == 0) {
        ledOn = !ledOn;
        digitalWrite(PIN_LED, ledOn ? HIGH : LOW);
    }

    // screenManager.draw() faz clearDisplay() + display.display(): precisa
    // rodar antes dos holds, senão a barra de progresso desenhada por eles é
    // apagada no próximo frame.
    screenManager.draw(display, model);

    handleSetupHold(display, buttonLeft, wifi, screenManager);
    handleTempSetHold(display, buttonRight, screenManager, editingTemp);

    // Rede: ambos são não-bloqueantes. O servidor HTTP/WS é assíncrono (roda
    // na task do AsyncTCP); aqui só publicamos o frame de streaming e
    // monitoramos a conexão STA.
    wifi.loop();
    api.loop();
}
