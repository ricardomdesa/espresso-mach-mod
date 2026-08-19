#pragma once

// Pinagem validada em hardware (ESP32-C3 Super Mini) — mesma usada em outros
// projetos com este lote de placa.
#define PIN_BTN 2 // GPIO2 (botão tátil p/ GND, pull-up interno)
#define OLED_SDA 8
#define OLED_SCL 9

#define OLED_WIDTH 128
#define OLED_HEIGHT 64
#define OLED_ADDR 0x3C // scanner ajusta em runtime se necessário (0x3D alternativo)
