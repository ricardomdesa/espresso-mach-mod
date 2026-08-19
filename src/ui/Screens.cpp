#include "Screens.h"

#include "pinos.h"

void drawScreenReadings(Adafruit_SSD1306 &display, const DisplayModel &model) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);

    display.setTextSize(1);
    display.setCursor(0, 0);
    display.print(F("TEMP (C)"));

    display.setTextSize(2);
    display.setCursor(0, 10);
    display.print(model.tempCurrent(), 1);
    display.setTextSize(1);
    display.setCursor(70, 16);
    display.print(F("set "));
    display.print(model.tempSetpoint(), 1);

    display.setTextSize(1);
    display.setCursor(0, 36);
    display.print(F("PRESSAO (bar)"));

    display.setTextSize(2);
    display.setCursor(0, 46);
    display.print(model.pressureCurrent(), 1);
    display.setTextSize(1);
    display.setCursor(70, 52);
    display.print(F("set "));
    display.print(model.pressureSetpoint(), 1);

    display.display();
}

void drawScreenTimer(Adafruit_SSD1306 &display, const DisplayModel &model) {
    char buf[12];
    model.timer().format(buf, sizeof(buf));

    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);

    display.setTextSize(1);
    display.setCursor(0, 0);
    display.print(F("EXTRACAO"));
    display.setCursor(90, 0);
    display.print(model.timer().isRunning() ? F("RUN") : F("STOP"));

    display.setTextSize(3);
    int16_t x1, y1;
    uint16_t w, h;
    display.getTextBounds(buf, 0, 0, &x1, &y1, &w, &h);
    display.setCursor((OLED_WIDTH - w) / 2, 28);
    display.print(buf);

    display.display();
}
