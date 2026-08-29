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

    // --- Executor de perfil de extração ---
    // Ao iniciar a extração com um perfil ativo, a máquina aquece até a
    // temperatura do perfil (fase Preheat) e só então roda a sequência de
    // passos liga/desliga da bomba (fase Steps).
    static constexpr uint8_t kMaxProfileSteps = 20;
    static constexpr float kPreheatToleranceC = 2.0f;
    static constexpr unsigned long kPreheatStableMs = 3000UL;
    static constexpr unsigned long kPreheatTimeoutMs = 180000UL;

    enum class RunPhase : uint8_t { Idle, Preheat, Steps };

    struct ProfileRun {
        RunPhase phase = RunPhase::Idle;
        uint8_t count = 0;
        uint8_t index = 0;
        unsigned long phaseStartMs = 0; // início da fase Preheat (p/ timeout)
        unsigned long stepStartMs = 0;  // início do passo corrente
        unsigned long inBandSinceMs = 0; // 0 = fora da faixa de temperatura
        uint16_t stepSeconds[kMaxProfileSteps] = {0};
        bool stepPump[kMaxProfileSteps] = {false};
    } run_;

    // run_ é mutada só pela task do loop() (serviceProfileRun / begin / end).
    // Os handlers HTTP rodam na task do AsyncTCP: eles apenas erguem estas
    // flags e ApiServer::loop() faz o start/stop no início da volta seguinte.
    // Sem isto, start/stop na task TCP corriam com serviceProfileRun e podiam
    // deixar o relé da bomba ligado sem timer.
    volatile bool startReq_ = false;
    volatile bool stopReq_ = false;
    volatile bool extracting_ = false; // start manual OU perfil ativo (guard de re-entrada)

    // Tenta montar o executor a partir do perfil ativo. Devolve false se não há
    // perfil utilizável (o chamador cai no start "manual": bomba ligada direto).
    bool beginProfileRun();
    // Avança o executor (chamado a cada loop()).
    void serviceProfileRun();
    // Encerra o ciclo (fim natural ou stop): bomba desligada, timer parado.
    void endProfileRun(bool broadcastStopped);

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
