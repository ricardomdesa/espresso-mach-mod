#pragma once

// Parâmetros de rede do firmware (épicos 5 e 6).
//
// Fluxo (segurança, regra do usuário): o AP NÃO sobe sozinho — nem no boot,
// nem por perda de conexão. Ele só entra no ar com hold de 10 s do botão na
// tela inicial (WifiProvisioner::requestAp), que seta uma flag one-shot na
// NVS e reinicia; o boot lê a flag e sobe o AP. O AP existe SÓ para receber
// a credencial da rede do usuário: assim que ela chega (POST /api/wifi/
// provision), a credencial vai para a NVS, o AP cai e o ESP32 entra na rede
// como STA — daí em diante o app fala com a máquina normalmente.

// --- Modo AP (provisionamento) ---
#define AP_SSID "Philco-Setup"
#define AP_PASSWORD "" // rede aberta: o portal só recebe SSID/senha
#define AP_IP "192.168.4.1" // IP fixo do softAP (padrão do ESP32)
#define AP_CHANNEL 1
#define AP_MAX_CLIENTS 4

// --- Modo STA (operação normal) ---
#define MDNS_HOSTNAME "philco" // resolve como philco.local
#define STA_CONNECT_TIMEOUT_MS 20000UL

// --- Servidores ---
#define API_PORT 80
#define WS_PATH "/ws"
#define WS_STREAM_INTERVAL_MS 100UL

// Versão do contrato da API (campo "api" em GET /api/status).
#define API_VERSION 1
