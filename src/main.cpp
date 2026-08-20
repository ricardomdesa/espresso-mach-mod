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
Button button(PIN_BTN);

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

    button.begin();

    // Config persistida antes da rede: o JSON de status já sai com os valores
    // reais e o PID (épicos 2-4) encontra os setpoints prontos.
    nvs.begin();
    nvs.loadControl(model);

    // Wi-Fi é opcional (N4): sem credencial sobe o AP de configuração e o
    // firmware segue funcionando offline.
    wifi.begin();
    api.begin();

    Serial.print(F("Heap livre: "));
    Serial.println(ESP.getFreeHeap());
}

void loop() {
    button.update();
    model.update();

    if (button.clicked()) {
        if (screenManager.index() == kTimerScreenIndex) {
            model.timer().toggle();
            api.broadcastEvent(model.timer().isRunning() ? "extraction_started"
                                                         : "extraction_stopped");
        } else {
            screenManager.next();
        }
    }

    if (button.longPressed()) {
        model.timer().reset();
        if (screenManager.index() == kTimerScreenIndex) {
            screenManager.next(); // volta p/ Tela 1 (única saída do "modo timer")
        }
    }

    screenManager.draw(display, model);

    // Rede: ambos são não-bloqueantes. O servidor HTTP/WS é assíncrono (roda
    // na task do AsyncTCP); aqui só publicamos o frame de streaming e
    // monitoramos a conexão STA.
    wifi.loop();
    api.loop();
}
