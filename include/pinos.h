#pragma once

// Pinagem validada em hardware (ESP32-C3 Super Mini) — mesma usada em outros
// projetos com este lote de placa.
#define PIN_BTN_LEFT 2  // GPIO2 (botão tátil esquerdo p/ GND, pull-up interno)
#define PIN_BTN_RIGHT 3 // GPIO3 (botão tátil direito p/ GND, pull-up interno)
// GPIO1 é saída livre neste board: com ARDUINO_USB_CDC_ON_BOOT=1 o Serial sai
// pelo USB-CDC, então não há conflito com UART0 (o C3 nem usa GPIO1 para TX).
#define PIN_LED 1       // GPIO1 (saída p/ LED de iluminação, ativo HIGH)
#define OLED_SDA 8
#define OLED_SCL 9

#define OLED_WIDTH 128
#define OLED_HEIGHT 64
#define OLED_ADDR 0x3C // scanner ajusta em runtime se necessário (0x3D alternativo)
