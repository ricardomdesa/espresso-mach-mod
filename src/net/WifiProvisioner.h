#pragma once

#include <Arduino.h>

#include "config/NvsConfig.h"

// Estados de rede do firmware.
enum class WifiMode : uint8_t {
    Offline, // sem AP e sem STA: máquina offline (sem credencial ou hold não feito)
    Ap,      // modo de provisionamento: existe só para receber SSID/senha
    Sta,     // operação normal: máquina na rede do usuário
};

// Provisionamento Wi-Fi no padrão IoT, implementado à mão (sem WiFiManager)
// porque o portal cativo não é usado: quem coleta SSID/senha é o app, via
// POST /api/wifi/provision.
//
// Regra do produto: o AP fica ativo SOMENTE enquanto não há credencial válida.
// Assim que a máquina entra na rede do usuário, o AP é desligado.
class WifiProvisioner {
public:
    explicit WifiProvisioner(NvsConfig &nvs) : nvs_(nvs) {}

    // Lê a credencial da NVS e tenta STA; sem credencial fica offline (sem AP).
    void begin();

    // Chamar no loop: monitora a conexão STA. Só o hold do botão na tela
    // inicial abre o AP (segurança, veja requestAp()).
    void loop();

    WifiMode mode() const { return mode_; }
    bool isConnected() const;

    // IP atual (do AP ou da rede do usuário).
    IPAddress ip() const;

    // Guarda a credencial e agenda a troca para STA. Retorna false se o SSID
    // for vazio. A troca acontece em `loop()` (delay curto) para dar tempo da
    // resposta HTTP sair antes do AP cair.
    bool provision(const char *ssid, const char *password);

    // Apaga a credencial e volta para o modo AP no próximo `loop()`.
    void forget();

    // Segurança (regra do usuário): o AP só entra no ar via hold de 10 s do
    // botão na tela inicial. Este método seta uma flag one-shot na NVS e
    // reinicia — o boot lê a flag e sobe o AP direto (mesmo com credencial
    // salva), sem risco de re-conectar na STA no meio do caminho.
    void requestAp();

    // --- Varredura de redes (para a tela de provisionamento do app) ---
    //
    // O ESP32-C3 tem um rádio só: uma varredura síncrona tira o AP do canal
    // por segundos e derruba a conexão TCP do celular. Por isso a varredura é
    // assíncrona e o resultado fica em cache — a API responde na hora.
    struct ScanEntry {
        char ssid[33];
        int8_t rssi;
        bool secure;
    };
    static constexpr uint8_t kMaxScanResults = 24;

    // Pede uma varredura. Pode ser chamada da task do servidor: só levanta uma
    // flag; quem mexe no rádio é o `loop()`.
    void requestScan();
    // Inclui a varredura ainda só pedida, para o app saber que vale repetir.
    bool scanning() const { return scanning_ || scanRequested_; }
    // scanCount()/scanEntry() são lidos pela task do AsyncTCP (handler de
    // /api/wifi/scan) enquanto scanNow() (loop principal) reseta e repopula
    // scanResults_/scanCount_ — protegidos por scanMux_ (D5, achado de review).
    uint8_t scanCount() const;
    // Devolve cópia (não referência): a referência poderia apontar para uma
    // entrada sendo reescrita por scanNow() assim que o critical section sai.
    ScanEntry scanEntry(uint8_t i) const;

private:
    NvsConfig &nvs_;
    WifiMode mode_ = WifiMode::Offline;

    unsigned long pendingSwitchAtMs_ = 0; // 0 = nada agendado
    unsigned long staLostSinceMs_ = 0;    // 0 = conexão ok

    ScanEntry scanResults_[kMaxScanResults];
    uint8_t scanCount_ = 0;
    mutable portMUX_TYPE scanMux_ = portMUX_INITIALIZER_UNLOCKED;
    volatile bool scanning_ = false;
    volatile bool scanRequested_ = false;
    // Intervalo mínimo entre re-varreduras pedidas pelo app.
    unsigned long scanNotBeforeMs_ = 0;

    bool startSta(const char *ssid, const char *password);
    void startAp();
    void startMdns();
    void scanNow();
};
