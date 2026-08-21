#include "Screens.h"

#include "pinos.h"
#include "rede.h"


// --- Indicador de rede (canto superior direito de todas as telas) ---
//
// Ícone 12x8 desenhado com primitivas do Adafruit GFX (sem bitmap):
//   AP ativo = ondas de Wi-Fi + ponto central (modo de configuração).
//   STA conectado = ondas + chevron preenchido (aponta o traço para baixo,
//   como um ponto de acesso ligado). Offline = ondas + X (traço diagonal).
void drawWifiIcon(Adafruit_SSD1306 &display, NetworkStatus status) {
    constexpr int16_t x = 122; // canto direito (PRESSAO/set 9.0 terminam em x=112)
    constexpr int16_t y = 11;
    constexpr int16_t r = 4; // raio das ondas concêntricas

    display.drawCircleHelper(x, y, r, 0xF, SSD1306_WHITE);
    display.drawCircleHelper(x, y, r - 1, 0xF, SSD1306_WHITE);
    display.drawPixel(x, y, SSD1306_WHITE);

    switch (status) {
    case NetworkStatus::StaConnected:
        display.fillTriangle(x - 2, y + 4, x + 2, y + 4, x, y + 7, SSD1306_WHITE);
        break;
    case NetworkStatus::ApActive:
        display.fillRect(x - 2, y + 4, 5, 2, SSD1306_WHITE);
        display.fillRect(x - 1, y + 6, 3, 2, SSD1306_WHITE);
        break;
    case NetworkStatus::Offline:
        display.drawLine(x - 4, y + 4, x + 4, y + 4, SSD1306_WHITE);
        break;
    }
}

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

    drawWifiIcon(display, model.networkStatus());
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

    drawWifiIcon(display, model.networkStatus());
    display.display();
}

// Tela de pareamento: substitui a navegação normal enquanto o AP de
// configuração está no ar. Mostra o que o usuário precisa para parear pelo
// app (SSID, IP) e deixa claro que a máquina está aguardando a credencial.
void drawScreenPairing(Adafruit_SSD1306 &display, const DisplayModel &model) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);

    // Faixa amarela: título + indicador de AP.
    display.setTextSize(1);
    display.setCursor(0, 4);
    display.print(F("PAIRING"));
    drawWifiIcon(display, NetworkStatus::ApActive);

    // Faixa azul: SSID e IP centralizados (sem alocação dinâmica).
    // textSize 1 (não 2): "Philco-Setup" em textSize 2 passa dos 128px de
    // largura do OLED e o SSID sai cortado nas duas bordas.
    display.setTextSize(1);
    int16_t x1, y1;
    uint16_t w, h;
    display.getTextBounds(AP_SSID, 0, 0, &x1, &y1, &w, &h);
    display.setCursor((OLED_WIDTH - w) / 2, 22);
    display.print(AP_SSID);

    display.setTextSize(1);
    display.getTextBounds(AP_IP, 0, 0, &x1, &y1, &w, &h);
    display.setCursor((OLED_WIDTH - w) / 2, 44);
    display.print(AP_IP);

    display.setCursor(0, 56);
    display.print(F("pareie pelo app"));

    display.display();
}
