#pragma once

#include <Adafruit_SSD1306.h>

#include "model/DisplayModel.h"

// Tela 1: temp atual/setpoint + pressão atual/setpoint.
void drawScreenReadings(Adafruit_SSD1306 &display, const DisplayModel &model);

// Tela 2: cronômetro de extração em destaque (fonte grande).
void drawScreenTimer(Adafruit_SSD1306 &display, const DisplayModel &model);
// Tela de pareamento: exibida quando o AP de configuração está no ar. Mostra
// o SSID/IP e orienta o usuário a parear pelo app.
void drawScreenPairing(Adafruit_SSD1306 &display, const DisplayModel &model);
