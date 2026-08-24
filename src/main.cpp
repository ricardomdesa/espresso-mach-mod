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

// Limiares dos botões explícitos: o long press vale tanto para o reset do timer
// (Tela 2) quanto para sair do ajuste de temperatura. Fixar aqui evita que uma
// mudança no default do Button altere a UX sem ninguém perceber.
constexpr unsigned long kButtonDebounceMs = 50UL;
constexpr unsigned long kLongPressMs = 1000UL;

Button buttonLeft(PIN_BTN_LEFT, kButtonDebounceMs, kLongPressMs);
Button buttonRight(PIN_BTN_RIGHT, kButtonDebounceMs, kLongPressMs);

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

// Escrita na NVS adiada: o setpoint muda em RAM a cada clique e só é gravado
// quando o usuário para de ajustar (ou ao sair do modo). Uma escrita por clique
// gastaria o setor de flash à toa (90 -> 70 °C são 40 cliques) e cada
// open/put/close bloqueia o loop por alguns ms.
constexpr unsigned long kTempSaveDebounceMs = 2000UL;

// true = modo de ajuste de temperatura ativo (substitui a navegação normal).
bool editingTemp = false;

// Estado de um gesto de "hold" (botão segurado até um limiar). Precisa ser
// zerado quando o loop entra em um modo que não roda os gestos (AP, ajuste de
// temperatura): senão o contador envelhece em tempo de parede em segundo plano
// e o gesto dispara sozinho assim que o modo normal volta.
struct HoldGesture {
    unsigned long startMs = 0;
    bool active() const { return startMs != 0; }
    void reset() { startMs = 0; }
};

HoldGesture setupHold;   // esquerdo, 10 s: abre o AP
HoldGesture tempSetHold; // direito, 5 s: entra no ajuste de temperatura

ScreenManager screenManager(screens, sizeof(screens) / sizeof(screens[0]));

// O LED de iluminação é estado do model (o botão direito e a API mexem nele);
// aqui só espelhamos no GPIO, e apenas quando o valor muda.
void syncLight(const DisplayModel &model) {
    static int applied = -1;
    const int want = model.lightOn() ? HIGH : LOW;
    if (want != applied) {
        digitalWrite(PIN_LED, want);
        applied = want;
    }
}

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

    // LED de iluminação: ligado por padrão no boot (não persistido).
    pinMode(PIN_LED, OUTPUT);
    digitalWrite(PIN_LED, model.lightOn() ? HIGH : LOW);

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

// Gesto de hold "por soltura": soltar antes do fim cancela. Enquanto conta,
// desenha a barra de progresso na faixa inferior (a tela normal segue atrás) —
// a barra é a única confirmação, não há passo extra. Devolve true no único
// ciclo em que o limiar é atingido.
bool handleHoldGesture(Adafruit_SSD1306 &display, Button &button, HoldGesture &state,
                       unsigned long thresholdMs, bool enabled) {
    if (!enabled || !button.isPressed()) {
        state.reset(); // soltou, trocou de tela, ou o outro gesto tem a vez
        return false;
    }

    const unsigned long now = millis();
    if (state.startMs == 0) {
        state.startMs = now;
    }

    const unsigned long elapsed = now - state.startMs;
    if (elapsed >= thresholdMs) {
        state.reset();
        return true;
    }

    const float frac = static_cast<float>(elapsed) / thresholdMs;
    const uint8_t w = static_cast<uint8_t>(frac * (OLED_WIDTH - 8));
    display.fillRect(0, OLED_HEIGHT - 4, OLED_WIDTH, 4, SSD1306_BLACK);
    display.fillRect(0, OLED_HEIGHT - 4, w, 4, SSD1306_WHITE);
    display.display();
    return false;
}

// Modo de ajuste de temperatura: esquerdo = -0.5, direito = +0.5. O setpoint
// muda em RAM na hora; a gravação na NVS é adiada (kTempSaveDebounceMs) e
// forçada na saída. Long press em qualquer botão sai.
void handleTempEdit(DisplayModel &model, NvsConfig &nvs, Button &left, Button &right,
                    bool &editing) {
    static bool pendingSave = false;
    static unsigned long lastChangeMs = 0;

    const auto clamp = [](float v) {
        if (v < kTempMin) return kTempMin;
        if (v > kTempMax) return kTempMax;
        return v;
    };

    // Os dois botões soltos no mesmo ciclo se anulariam (+0.5 e -0.5): ignora
    // o par em vez de aplicar as duas mudanças.
    const bool up = right.clicked();
    const bool down = left.clicked();
    if (up != down) {
        model.setTempSetpoint(clamp(model.tempSetpoint() + (up ? kTempStep : -kTempStep)));
        pendingSave = true;
        lastChangeMs = millis();
    }

    const bool leaving = left.longPressed() || right.longPressed();

    if (pendingSave && (leaving || millis() - lastChangeMs >= kTempSaveDebounceMs)) {
        nvs.saveTempSetpoint(model.tempSetpoint());
        pendingSave = false;
    }

    if (leaving) {
        editing = false;
    }
}

void loop() {
    buttonLeft.update();
    buttonRight.update();
    model.update();
    syncLight(model);

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
        // Os gestos não rodam neste modo: zera os contadores para nenhum deles
        // envelhecer em segundo plano e disparar na volta.
        setupHold.reset();
        tempSetHold.reset();
        drawScreenPairing(display, model);
        wifi.loop();
        api.loop();
        return;
    }

    // Modo de ajuste de temperatura: substitui a navegação normal. Esquerdo
    // decrementa, direito incrementa; long press em qualquer um sai.
    if (editingTemp) {
        setupHold.reset();
        tempSetHold.reset();
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
        model.setLightOn(!model.lightOn());
    }

    // screenManager.draw() faz clearDisplay() + display.display(): precisa
    // rodar antes dos holds, senão a barra de progresso desenhada por eles é
    // apagada no próximo frame.
    screenManager.draw(display, model);

    // Exclusão mútua: um hold por vez. Sem isso, segurar os dois botões dispara
    // os dois gestos (AP + ajuste de temperatura) quase no mesmo frame.
    const bool onHome = screenManager.index() == 0;

    if (handleHoldGesture(display, buttonLeft, setupHold, kSetupHoldMs,
                          onHome && !tempSetHold.active())) {
        tempSetHold.reset();
        wifi.requestAp();
    }

    if (handleHoldGesture(display, buttonRight, tempSetHold, kTempSetHoldMs,
                          onHome && !setupHold.active())) {
        setupHold.reset();
        editingTemp = true;
    }

    // Rede: ambos são não-bloqueantes. O servidor HTTP/WS é assíncrono (roda
    // na task do AsyncTCP); aqui só publicamos o frame de streaming e
    // monitoramos a conexão STA.
    wifi.loop();
    api.loop();
}
