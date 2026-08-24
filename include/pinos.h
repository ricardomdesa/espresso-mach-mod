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

// Reservados para o hardware real de controle de temperatura (termopar +
// atuador de aquecimento). Soldados desde já para não precisar reabrir a
// máquina quando o sensor/relé chegarem; ainda sem driver no firmware
// (SensorFake segue em uso até a integração).
#define PIN_THERMO_SCK 5 // GPIO5 — SPI SCK do amplificador do termopar (MAX6675/31855)
#define PIN_THERMO_SO 6  // GPIO6 — SPI SO/MISO do amplificador (leitura)
#define PIN_THERMO_CS 7  // GPIO7 — SPI CS do amplificador
// GPIO10 -> entrada "+" do SSR GN 84136121 (25A, entrada DC 3,5-32V), "-" no
// GND comum. Datasheet pede min. 3,5V e o GPIO só dá 3,3V — ACIONAMENTO A
// VALIDAR EM BANCADA antes de confiar nisso com a carga real. Se não acionar
// direto, precisa de estágio driver (transistor/MOSFET) alimentado em 5V.
#define PIN_ACTUATOR 10 // GPIO10 — sinal "+" do SSR de aquecimento (ativo HIGH, a confirmar)
