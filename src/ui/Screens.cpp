#include "Screens.h"

#include "pinos.h"

// Faixa amarela (y=0..15) do painel: setpoints, texto pequeno. Faixa azul
// (y=16..63): valores atuais em destaque — nada de texto grande cruzando a
// fronteira das duas cores (fica ilegível, ver achado de hardware).
void drawScreenReadings(Adafruit_SSD1306 &display, const DisplayModel &model) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);

    display.setTextSize(1);
    display.setCursor(0, 4);
    display.print(F("set "));
    display.print(model.tempSetpoint(), 1);
    display.setCursor(70, 4);
    display.print(F("set "));
    display.print(model.pressureSetpoint(), 1);

    display.setTextSize(1);
    display.setCursor(0, 16);
    display.print(F("TEMP"));
    display.setCursor(70, 16);
    display.print(F("PRESSAO"));

    display.setTextSize(2);
    display.setCursor(0, 32);
    display.print(model.tempCurrent(), 1);
    display.setCursor(70, 32);
    display.print(model.pressureCurrent(), 1);

    display.display();
}

// Faixa amarela (y=0..15) do painel: temp/pressão atuais, sempre visíveis
// mesmo na tela do cronômetro. Faixa azul (y=16..63): status + timer grande.
void drawScreenTimer(Adafruit_SSD1306 &display, const DisplayModel &model) {
    char buf[12];
    model.timer().format(buf, sizeof(buf));

    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);

    // Faixa amarela: temp + pressão atuais.
    display.setTextSize(1);
    display.setCursor(0, 4);
    display.print(model.tempCurrent(), 1);
    display.print(F(" C"));
    display.setCursor(70, 4);
    display.print(model.pressureCurrent(), 1);
    display.print(F(" bar"));

    // Faixa azul: status + cronômetro em destaque.
    display.setCursor(52, 20);
    display.print(model.timer().isRunning() ? F("RUN") : F("STOP"));

    display.setTextSize(3);
    int16_t x1, y1;
    uint16_t w, h;
    display.getTextBounds(buf, 0, 0, &x1, &y1, &w, &h);
    display.setCursor((OLED_WIDTH - w) / 2, 34);
    display.print(buf);

    display.display();
}
