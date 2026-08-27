#pragma once

// Pinagem validada em hardware (ESP32-C3 Super Mini) — mesma usada em outros
// projetos com este lote de placa.

// Único botão do produto. Clique curto liga/desliga o LED de iluminação; hold
// de 5 s sobe o AP de configuração (WifiProvisioner::requestAp). Ativo em LOW
// (pull-up interno, ligado ao GND).
#define PIN_BUTTON 3 // GPIO3 (botão tátil p/ GND, pull-up interno)

// GPIO20 é U0RXD por padrão. Com ARDUINO_USB_CDC_ON_BOOT=1 o Serial sai pelo
// USB-CDC, então a UART0 de hardware não é usada e o GPIO20 fica livre como
// saída digital. Não é strapping pin no ESP32-C3.
#define PIN_LED 20 // GPIO20 (saída p/ LED de iluminação, ativo HIGH)

// LED azul onboard da ESP32-C3 Super Mini: GPIO8, ativo em LOW. Usado como
// sinalizador de "modo setup" (pisca enquanto o AP está no ar). GPIO8 é
// strapping pin (precisa HIGH no boot) — só é dirigido depois do boot.
#define PIN_STATUS_LED 8
#define STATUS_LED_ON LOW
#define STATUS_LED_OFF HIGH

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

// GPIO0 -> entrada de sinal do módulo de relé que aciona a bomba (liga/
// desliga). No ESP32-C3 o GPIO0 não é strapping pin (só serve de XTAL_32K_P,
// que não usamos), então fica livre como saída digital.
// ATENÇÃO ao nível ativo: muitos módulos de relé são acionados em LOW. Aqui
// tratamos como ativo HIGH (PUMP_ACTIVE) — inverter PUMP_ACTIVE/PUMP_IDLE se
// o módulo usado for active-low.
#define PIN_PUMP 0       // GPIO0 — sinal do relé da bomba
#define PUMP_ACTIVE HIGH // nível que liga a bomba
#define PUMP_IDLE LOW    // nível que desliga a bomba
