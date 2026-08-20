#pragma once

// Parâmetros de rede do firmware (épicos 5 e 6).
//
// Fluxo: o AP existe SÓ para receber a credencial da rede do usuário. Assim
// que ela chega, a credencial vai para a NVS, o AP cai e o ESP32 entra na
// rede como STA — daí em diante o app fala com a máquina normalmente.

// --- Modo AP (provisionamento) ---
#define AP_SSID "Philco-Setup"
#define AP_PASSWORD "" // rede aberta: o portal só recebe SSID/senha
#define AP_CHANNEL 1
#define AP_MAX_CLIENTS 4

// --- Modo STA (operação normal) ---
#define MDNS_HOSTNAME "philco" // resolve como philco.local
#define STA_CONNECT_TIMEOUT_MS 20000UL
// Tempo sem conexão STA antes de reabrir o AP para reconfiguração.
#define STA_LOST_GRACE_MS 30000UL

// --- Servidores ---
#define API_PORT 80
#define WS_PATH "/ws"
#define WS_STREAM_INTERVAL_MS 100UL

// Versão do contrato da API (campo "api" em GET /api/status).
#define API_VERSION 1
