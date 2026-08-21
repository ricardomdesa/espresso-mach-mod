#pragma once

#include <Arduino.h>
#include <ESPAsyncWebServer.h>

#include "config/NvsConfig.h"
#include "model/DisplayModel.h"
#include "net/WifiProvisioner.h"

// API da máquina: REST para comandos + WebSocket (/ws) para streaming, ambos
// na porta 80 — é o contrato que o app consome (SDD-006).
//
// O servidor é assíncrono (roda na task do AsyncTCP), então `loop()` aqui só
// publica o frame de streaming e recolhe clientes mortos. O loop de controle
// nunca espera rede (N1).
class ApiServer {
public:
    ApiServer(DisplayModel &model, NvsConfig &nvs, WifiProvisioner &wifi);

    void begin();
    void loop();

    // Eventos push para o app (extração iniciada/parada, erro).
    void broadcastEvent(const char *event);
    void broadcastError(const char *msg);

private:
    DisplayModel &model_;
    NvsConfig &nvs_;
    WifiProvisioner &wifi_;

    AsyncWebServer server_;
    AsyncWebSocket ws_;

    unsigned long lastStreamMs_ = 0;

    // Token de autenticação (gerado/persistido na NVS em begin()). Endpoints
    // que mudam estado exigem o header "X-Auth-Token" com este valor —
    // sem isso qualquer cliente na LAN poderia resetar/reconfigurar a máquina.
    char authToken_[NvsConfig::kAuthTokenLen + 1] = {0};

    void registerRoutes();
    void registerWebSocket();

    // Confere o header X-Auth-Token contra o token persistido. GET's de
    // leitura não passam por aqui; endpoints que mudam estado sim.
    bool authOk(AsyncWebServerRequest *request) const;

    // Monta o JSON de GET /api/status em buffer estático (D5).
    void buildStatusJson(char *out, size_t outLen) const;
    void sendStatus(AsyncWebServerRequest *request, int code = 200) const;
};
