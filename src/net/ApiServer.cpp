#include "ApiServer.h"

#include <ArduinoJson.h>
#include <WiFi.h>
#include <functional>
#include <math.h>
#include <string.h>

#include "rede.h"
#include "controle.h"

// Código de pareamento da máquina (chave fixa da API). Vem de platformio.ini
// ('-D API_AUTH_KEY="..."'); é o mesmo código que o app pede no pareamento.
// Sem o flag o build quebra de propósito: um fallback embutido aqui viraria
// segredo público no repositório.
#ifndef API_AUTH_KEY
#error "defina API_AUTH_KEY no platformio.ini (-D API_AUTH_KEY=\"<12 hex>\")"
#endif

namespace {

constexpr size_t kStatusJsonSize = 768;
constexpr size_t kFrameJsonSize = 288;
constexpr size_t kMaxBodyBytes = 4096;

const char *kJson = "application/json";

// Buffers de trabalho dos handlers REST. São estáticos de propósito: a task do
// AsyncTCP tem pilha pequena (8 KB por padrão) e dois arrays de 3 KB em pilha
// a estouram. Todos os handlers rodam nessa mesma task, um de cada vez, então
// não há concorrência entre eles.
char g_scratchA[NvsConfig::kProfilesJsonCapacity];
char g_scratchB[NvsConfig::kProfilesJsonCapacity];

const char *modeName(MachineMode m) {
    switch (m) {
    case MachineMode::Extracting:
        return "extracting";
    case MachineMode::Preheating:
        return "preheating";
    case MachineMode::Steaming:
        return "steaming";
    case MachineMode::Heating:
        return "heating";
    case MachineMode::Error:
        return "error";
    case MachineMode::Idle:
    default:
        return "idle";
    }
}

// SSID é texto arbitrário do vizinho: aspas ou barras invertidas quebrariam o
// JSON montado à mão.
void jsonEscape(const char *in, char *out, size_t outLen) {
    size_t o = 0;
    for (size_t i = 0; in[i] != '\0' && o + 2 < outLen; i++) {
        const char c = in[i];
        if (c == '"' || c == '\\') {
            out[o++] = '\\';
            out[o++] = c;
        } else if (static_cast<unsigned char>(c) < 0x20) {
            continue; // controle: descarta
        } else {
            out[o++] = c;
        }
    }
    out[o] = '\0';
}

void sendError(AsyncWebServerRequest *request, int code, const char *msg) {
    char buf[160];
    snprintf(buf, sizeof(buf), "{\"error\":\"%s\"}", msg);
    request->send(code, kJson, buf);
}

using JsonHandler = std::function<void(AsyncWebServerRequest *, JsonVariantConst)>;

// Registra uma rota que recebe corpo JSON. O corpo chega em pedaços; só depois
// de completo o AsyncWebServer chama o handler da requisição.
void onJsonBody(AsyncWebServer &server, const char *uri, WebRequestMethodComposite method,
                JsonHandler handler) {
    server.on(
        uri, method,
        [handler](AsyncWebServerRequest *request) {
            JsonDocument doc;
            const char *body = static_cast<const char *>(request->_tempObject);
            if (body != nullptr) {
                const DeserializationError err = deserializeJson(doc, body);
                if (err) {
                    sendError(request, 400, "JSON invalido");
                    return;
                }
            }
            handler(request, doc.as<JsonVariantConst>());
        },
        nullptr,
        [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
            if (total == 0 || total > kMaxBodyBytes) return;
            if (index == 0) {
                // Liberado pelo destrutor de AsyncWebServerRequest.
                request->_tempObject = malloc(total + 1);
                if (request->_tempObject == nullptr) return;
                static_cast<char *>(request->_tempObject)[total] = '\0';
            }
            if (request->_tempObject == nullptr) return;
            memcpy(static_cast<char *>(request->_tempObject) + index, data, len);
        });
}

} // namespace

ApiServer::ApiServer(DisplayModel &model, NvsConfig &nvs, WifiProvisioner &wifi)
    : model_(model), nvs_(nvs), wifi_(wifi), server_(API_PORT), ws_(WS_PATH) {}

void ApiServer::buildStatusJson(char *out, size_t outLen) const {
    char profileField[32];
    if (model_.activeProfileId()[0] == '\0') {
        snprintf(profileField, sizeof(profileField), "null");
    } else {
        snprintf(profileField, sizeof(profileField), "\"%s\"", model_.activeProfileId());
    }

    const char *wifiMode = "offline";
    if (wifi_.mode() == WifiMode::Ap) wifiMode = "ap";
    if (wifi_.mode() == WifiMode::Sta) wifiMode = "sta";

    snprintf(out, outLen,
             "{\"api\":%d,\"temp\":%.2f,\"press\":%.2f,\"tempSetpoint\":%.2f,"
             "\"pressSetpoint\":%.2f,\"timer\":%.1f,\"state\":\"%s\",\"profile\":%s,"
             "\"led\":%s,\"pump\":%s,\"steam\":%s,\"steamSetpoint\":%.2f,\"ready\":%s,"
             "\"duty\":%.1f,\"target\":%.2f,"
             "\"sensAgeMs\":%lu,\"uptime\":%lu,\"wifiMode\":\"%s\",\"ip\":\"%s\","
             "\"pid\":{\"kp\":%.3f,\"ki\":%.3f,\"kd\":%.3f},\"heap\":%lu}",
             API_VERSION, model_.tempCurrent(), model_.pressureCurrent(),
             model_.tempSetpoint(), model_.pressureSetpoint(),
             model_.timer().elapsedMs() / 1000.0f, modeName(model_.mode()), profileField,
             model_.lightOn() ? "true" : "false", model_.pumpOn() ? "true" : "false",
             model_.steaming() ? "true" : "false", model_.steamSetpoint(),
             model_.ready() ? "true" : "false",
             model_.dutyPct(), model_.tempTarget(), model_.sensorAgeMs(),
             millis() / 1000UL, wifiMode,
             wifi_.ip().toString().c_str(), model_.pid().kp, model_.pid().ki, model_.pid().kd,
             (unsigned long)ESP.getFreeHeap());
}

void ApiServer::sendStatus(AsyncWebServerRequest *request, int code) const {
    char buf[kStatusJsonSize];
    buildStatusJson(buf, sizeof(buf));
    request->send(code, kJson, buf);
}

bool ApiServer::authOk(AsyncWebServerRequest *request) const {
    const AsyncWebHeader *h = request->getHeader("X-Auth-Token");
    return h != nullptr && h->value() == API_AUTH_KEY;
}

void ApiServer::begin() {
    registerWebSocket();
    registerRoutes();
    server_.begin();
    Serial.println(F("[api] servidor HTTP/WS na porta 80"));
    // Impresso p/ anotar numa etiqueta na máquina: é o código que o app pede
    // no pareamento (header X-Auth-Token nos endpoints que mudam estado).
    Serial.printf("[api] codigo de pareamento: %s\n", API_AUTH_KEY);
}

void ApiServer::registerWebSocket() {
    ws_.onEvent([this](AsyncWebSocket *, AsyncWebSocketClient *client, AwsEventType type,
                       void *arg, uint8_t *data, size_t len) {
        switch (type) {
        case WS_EVT_CONNECT:
            Serial.printf("[ws] cliente %u conectado\n", client->id());
            break;
        case WS_EVT_DISCONNECT:
            Serial.printf("[ws] cliente desconectado\n");
            break;
        case WS_EVT_DATA: {
            // Único comando aceito hoje: keepalive. Frames binários não são
            // NUL-terminados: rodar strstr neles é leitura fora do buffer.
            const AwsFrameInfo *info = static_cast<AwsFrameInfo *>(arg);
            if (info->opcode == WS_TEXT && len >= 4 &&
                strstr(reinterpret_cast<const char *>(data), "ping") != nullptr) {
                client->text("{\"event\":\"pong\"}");
            }
            break;
        }
        default:
            break;
        }
    });
    server_.addHandler(&ws_);
}

void ApiServer::registerRoutes() {
    // A app roda em http://localhost dentro da WebView: origem diferente da máquina.
    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Origin", "*");
    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Methods",
                                         "GET, POST, PUT, DELETE, OPTIONS");
    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Headers",
                                         "Content-Type, Accept, X-Auth-Token");

    server_.onNotFound([](AsyncWebServerRequest *request) {
        if (request->method() == HTTP_OPTIONS) {
            request->send(204);
            return;
        }
        sendError(request, 404, "rota nao encontrada");
    });

    // --- Estado ---
    server_.on("/api/status", HTTP_GET,
               [this](AsyncWebServerRequest *request) { sendStatus(request); });

    // --- Setpoints e PID ---
    onJsonBody(server_, "/api/setpoint/temp", HTTP_PUT,
               [this](AsyncWebServerRequest *request, JsonVariantConst body) {
                   if (!authOk(request)) {
                       sendError(request, 401, "token invalido");
                       return;
                   }
                   if (!body["temp"].is<float>()) {
                       sendError(request, 400, "campo temp ausente");
                       return;
                   }
                   const float v = body["temp"].as<float>();
                   if (v < 20.0f || v > TEMP_MAX_SAFETY_C) {
                       sendError(request, 400, "temp fora da faixa (20-115)");
                       return;
                   }
                   model_.setTempSetpoint(v);
                   nvs_.saveTempSetpoint(v);
                   sendStatus(request);
               });

    onJsonBody(server_, "/api/setpoint/pressure", HTTP_PUT,
               [this](AsyncWebServerRequest *request, JsonVariantConst body) {
                   if (!authOk(request)) {
                       sendError(request, 401, "token invalido");
                       return;
                   }
                   if (!body["press"].is<float>()) {
                       sendError(request, 400, "campo press ausente");
                       return;
                   }
                   const float v = body["press"].as<float>();
                   if (v < 0.0f || v > 15.0f) {
                       sendError(request, 400, "press fora da faixa (0-15)");
                       return;
                   }
                   model_.setPressureSetpoint(v);
                   nvs_.savePressureSetpoint(v);
                   sendStatus(request);
               });

    // LED de iluminação: mesmo estado que o clique curto do botão físico
    // alterna. Não é persistido (desligado no boot), então não há escrita em
    // NVS aqui.
    onJsonBody(server_, "/api/led", HTTP_PUT,
               [this](AsyncWebServerRequest *request, JsonVariantConst body) {
                   if (!authOk(request)) {
                       sendError(request, 401, "token invalido");
                       return;
                   }
                   if (!body["on"].is<bool>()) {
                       sendError(request, 400, "campo on ausente");
                       return;
                   }
                   model_.setLightOn(body["on"].as<bool>());
                   sendStatus(request);
               });

    // Bomba (relé GPIO0): acionamento manual pelo app. O ciclo de extração
    // também mexe aqui (start liga, stop desliga). Não é persistido.
    onJsonBody(server_, "/api/pump", HTTP_PUT,
               [this](AsyncWebServerRequest *request, JsonVariantConst body) {
                   if (!authOk(request)) {
                       sendError(request, 401, "token invalido");
                       return;
                   }
                   // Em modo AP (provisionamento) o loop principal fica bloqueado
                   // durante WiFi.scanNetworks(), então o GPIO da bomba só é
                   // espelhado depois que o scan termina — um "desligar" ficaria
                   // pendente por segundos. Provisionamento não é modo operacional:
                   // recusa qualquer acionamento da bomba aqui.
                   if (wifi_.mode() == WifiMode::Ap) {
                       sendError(request, 409, "bomba indisponivel em modo de configuracao");
                       return;
                   }
                   if (!body["on"].is<bool>()) {
                       sendError(request, 400, "campo on ausente");
                       return;
                   }
                   model_.setPumpOn(body["on"].as<bool>());
                   sendStatus(request);
               });

    // Modo vaporização: liga (alvo efetivo -> steamSetpoint, sem NVS) ou
    // desliga (devolve o setpoint de café para TEMP_BREW_DEFAULT_C, persistido).
    // Campo opcional "temp": ajusta o alvo de vapor (80-115 °C, não persiste).
    // Recusado durante uma extração/perfil em andamento — lá quem manda no
    // setpoint é o executor do perfil.
    onJsonBody(server_, "/api/steam", HTTP_PUT,
               [this](AsyncWebServerRequest *request, JsonVariantConst body) {
                   if (!authOk(request)) {
                       sendError(request, 401, "token invalido");
                       return;
                   }
                   if (!body["on"].is<bool>()) {
                       sendError(request, 400, "campo on ausente");
                       return;
                   }
                   const bool on = body["on"].as<bool>();
                   if (on && (model_.timer().isRunning() || model_.preheating())) {
                       sendError(request, 409, "vaporizacao indisponivel durante extracao");
                       return;
                   }
                   // Alvo de vapor opcional: valida antes de mexer no estado.
                   if (body["temp"].is<float>()) {
                       const float t = body["temp"].as<float>();
                       if (t < TEMP_STEAM_MIN_C || t > TEMP_STEAM_MAX_C) {
                           sendError(request, 400, "temp de vapor fora da faixa (80-115)");
                           return;
                       }
                       model_.setSteamSetpoint(t);
                   }
                   const bool wasSteaming = model_.steaming();
                   model_.setSteaming(on);
                   // Só devolve o setpoint de café na transição liga->desliga —
                   // não a cada ajuste de alvo com o vapor já desligado (evita
                   // regravar 70 na NVS à toa).
                   if (wasSteaming && !on) {
                       model_.setTempSetpoint(TEMP_BREW_DEFAULT_C);
                       nvs_.saveTempSetpoint(TEMP_BREW_DEFAULT_C);
                   }
                   sendStatus(request);
               });

    onJsonBody(server_, "/api/pid", HTTP_PUT,
               [this](AsyncWebServerRequest *request, JsonVariantConst body) {
                   if (!authOk(request)) {
                       sendError(request, 401, "token invalido");
                       return;
                   }
                   if (!body["kp"].is<float>() || !body["ki"].is<float>() ||
                       !body["kd"].is<float>()) {
                       sendError(request, 400, "campos kp/ki/kd obrigatorios");
                       return;
                   }
                   const PidGains g{body["kp"].as<float>(), body["ki"].as<float>(),
                                    body["kd"].as<float>()};
                   if (g.kp < 0 || g.ki < 0 || g.kd < 0) {
                       sendError(request, 400, "ganhos nao podem ser negativos");
                       return;
                   }
                   model_.setPid(g);
                   nvs_.savePid(g);
                   sendStatus(request);
               });

    // --- Extração ---
    server_.on("/api/extraction/start", HTTP_POST, [this](AsyncWebServerRequest *request) {
        if (!authOk(request)) {
            sendError(request, 401, "token invalido");
            return;
        }
        // Start liga a bomba; mesmo motivo do /api/pump — em modo AP o espelho
        // do GPIO fica preso atrás do scan síncrono. Stop continua liberado.
        if (wifi_.mode() == WifiMode::Ap) {
            sendError(request, 409, "extracao indisponivel em modo de configuracao");
            return;
        }
        // Já em andamento (executor OU start manual, ou start pendente): recusa
        // em vez de re-entrar em beginProfileRun() — que regravaria o setpoint
        // na NVS e sobrescreveria run_ enquanto a task do loop o percorre.
        if (extracting_ || startReq_) {
            sendError(request, 409, "extracao ja em andamento");
            return;
        }
        // O trabalho real (setSteaming/beginProfileRun/timer/bomba) roda na task
        // do loop() — ver ApiServer::loop(). Aqui só sinaliza, pra run_ nunca
        // ser mutada de duas tasks.
        startReq_ = true;
        sendStatus(request);
    });

    server_.on("/api/extraction/stop", HTTP_POST, [this](AsyncWebServerRequest *request) {
        if (!authOk(request)) {
            sendError(request, 401, "token invalido");
            return;
        }
        // Idem: o stop efetivo (endProfileRun/timer/bomba) roda na task do loop().
        stopReq_ = true;
        sendStatus(request);
    });

    // --- Perfis de extração ---
    server_.on("/api/profiles", HTTP_GET, [this](AsyncWebServerRequest *request) {
        nvs_.loadProfilesJson(g_scratchA, sizeof(g_scratchA));
        request->send(200, kJson, g_scratchA);
    });

    onJsonBody(server_, "/api/profiles/active", HTTP_PUT,
               [this](AsyncWebServerRequest *request, JsonVariantConst body) {
                   if (!authOk(request)) {
                       sendError(request, 401, "token invalido");
                       return;
                   }
                   const char *id = body["id"] | "";
                   model_.setActiveProfileId(id);
                   nvs_.saveActiveProfileId(id);
                   sendStatus(request);
               });

    onJsonBody(server_, "/api/profiles", HTTP_POST,
               [this](AsyncWebServerRequest *request, JsonVariantConst body) {
                   if (!authOk(request)) {
                       sendError(request, 401, "token invalido");
                       return;
                   }
                   if (!body["name"].is<const char *>()) {
                       sendError(request, 400, "campo name obrigatorio");
                       return;
                   }

                   nvs_.loadProfilesJson(g_scratchA, sizeof(g_scratchA));
                   JsonDocument doc;
                   deserializeJson(doc, g_scratchA);
                   JsonArray arr = doc.isNull() ? doc.to<JsonArray>() : doc.as<JsonArray>();

                   JsonObject created = arr.add<JsonObject>();
                   created.set(body.as<JsonObjectConst>());
                   char id[24];
                   // Contador persistido (não millis()): sobrevive a reboots, então
                   // o ID não colide com um já usado antes do reset (achado de review).
                   snprintf(id, sizeof(id), "p%lu", (unsigned long)nvs_.nextProfileId());
                   created["id"] = id;

                   // v7 do ArduinoJson devolve o total de bytes escritos, igual ao
                   // tamanho do buffer quando trunca (nunca 0) — por isso o teste
                   // certo de overflow é ">= sizeof(buffer)", não "== 0".
                   if (serializeJson(doc, g_scratchB, sizeof(g_scratchB)) >= sizeof(g_scratchB)) {
                       sendError(request, 507, "sem espaco para mais perfis");
                       return;
                   }
                   nvs_.saveProfilesJson(g_scratchB);

                   char single[768];
                   if (serializeJson(created, single, sizeof(single)) >= sizeof(single)) {
                       sendError(request, 507, "perfil grande demais para responder");
                       return;
                   }
                   request->send(201, kJson, single);
               });

    // PUT/DELETE de um perfil específico: /api/profiles/{id}
    onJsonBody(server_, "^\\/api\\/profiles\\/([A-Za-z0-9_-]+)$", HTTP_PUT,
               [this](AsyncWebServerRequest *request, JsonVariantConst body) {
                   if (!authOk(request)) {
                       sendError(request, 401, "token invalido");
                       return;
                   }
                   const String id = request->pathArg(0);

                   nvs_.loadProfilesJson(g_scratchA, sizeof(g_scratchA));
                   JsonDocument doc;
                   deserializeJson(doc, g_scratchA);
                   JsonArray arr = doc.as<JsonArray>();

                   for (JsonObject p : arr) {
                       if (id != p["id"].as<const char *>()) continue;
                       p.set(body.as<JsonObjectConst>());
                       p["id"] = id;

                       if (serializeJson(doc, g_scratchB, sizeof(g_scratchB)) >= sizeof(g_scratchB)) {
                           sendError(request, 507, "perfil grande demais");
                           return;
                       }
                       nvs_.saveProfilesJson(g_scratchB);

                       char single[768];
                       if (serializeJson(p, single, sizeof(single)) >= sizeof(single)) {
                           sendError(request, 507, "perfil grande demais para responder");
                           return;
                       }
                       request->send(200, kJson, single);
                       return;
                   }
                   sendError(request, 404, "perfil nao encontrado");
               });

    server_.on("^\\/api\\/profiles\\/([A-Za-z0-9_-]+)$", HTTP_DELETE,
               [this](AsyncWebServerRequest *request) {
                   if (!authOk(request)) {
                       sendError(request, 401, "token invalido");
                       return;
                   }
                   const String id = request->pathArg(0);

                   nvs_.loadProfilesJson(g_scratchA, sizeof(g_scratchA));
                   JsonDocument doc;
                   deserializeJson(doc, g_scratchA);
                   JsonArray arr = doc.as<JsonArray>();

                   for (size_t i = 0; i < arr.size(); i++) {
                       if (id != arr[i]["id"].as<const char *>()) continue;
                       arr.remove(i);
                       serializeJson(doc, g_scratchB, sizeof(g_scratchB));
                       nvs_.saveProfilesJson(g_scratchB);
                       if (id == model_.activeProfileId()) {
                           model_.setActiveProfileId("");
                           nvs_.saveActiveProfileId("");
                       }
                       request->send(204);
                       return;
                   }
                   sendError(request, 404, "perfil nao encontrado");
               });

    // --- Wi-Fi ---
    // Nunca varre aqui dentro: o rádio é um só e uma varredura síncrona tira o
    // AP do canal, derrubando a conexão do próprio celular que fez o pedido.
    // Responde o cache na hora e agenda a varredura para o loop principal.
    server_.on("/api/wifi/scan", HTTP_GET, [this](AsyncWebServerRequest *request) {
        wifi_.requestScan();

        size_t at = 0;
        int n = snprintf(g_scratchA + at, sizeof(g_scratchA) - at,
                          "{\"scanning\":%s,\"networks\":[", wifi_.scanning() ? "true" : "false");
        // Clampa "at" ao tamanho do buffer a cada snprintf: o valor de retorno é
        // o que TERIA sido escrito sem truncar, então acumular sem clamp faz
        // "sizeof(buffer) - at" estourar (size_t) na próxima chamada.
        at += (n > 0) ? static_cast<size_t>(n) : 0;
        if (at > sizeof(g_scratchA)) at = sizeof(g_scratchA);

        for (uint8_t i = 0; i < wifi_.scanCount() && at < sizeof(g_scratchA) - 4; i++) {
            const WifiProvisioner::ScanEntry e = wifi_.scanEntry(i);
            char ssid[sizeof(e.ssid) * 2];
            jsonEscape(e.ssid, ssid, sizeof(ssid));
            n = snprintf(g_scratchA + at, sizeof(g_scratchA) - at,
                         "%s{\"ssid\":\"%s\",\"rssi\":%d,\"secure\":%s}", i == 0 ? "" : ",", ssid,
                         e.rssi, e.secure ? "true" : "false");
            at += (n > 0) ? static_cast<size_t>(n) : 0;
            if (at > sizeof(g_scratchA)) at = sizeof(g_scratchA);
        }
        snprintf(g_scratchA + at, sizeof(g_scratchA) - at, "]}");
        request->send(200, kJson, g_scratchA);
    });

    onJsonBody(server_, "/api/wifi/provision", HTTP_POST,
               [this](AsyncWebServerRequest *request, JsonVariantConst body) {
                   // Exceção ao gate de chave: enquanto o AP de configuração
                   // está no ar (só sobe via hold de 5s no botão físico), o app
                   // ainda não alcança a máquina pela rede de casa. Em modo STA,
                   // mudar a credencial exige a chave como qualquer outro
                   // endpoint mutante.
                   if (wifi_.mode() != WifiMode::Ap && !authOk(request)) {
                       sendError(request, 401, "token invalido");
                       return;
                   }
                   const char *ssid = body["ssid"] | "";
                   const char *pass = body["password"] | "";
                   if (!wifi_.provision(ssid, pass)) {
                       sendError(request, 400, "ssid obrigatorio");
                       return;
                   }
                   // A máquina reinicia logo em seguida para entrar na rede. A
                   // chave da API é fixa (compilada no firmware + app), não há
                   // nada a devolver aqui.
                   request->send(200, kJson, "{\"ok\":true,\"rebooting\":true}");
               });

    server_.on("/api/wifi/forget", HTTP_POST, [this](AsyncWebServerRequest *request) {
        if (!authOk(request)) {
            sendError(request, 401, "token invalido");
            return;
        }
        wifi_.forget();
        request->send(200, kJson, "{\"ok\":true,\"rebooting\":true}");
    });

    server_.on("/api/factory-reset", HTTP_POST, [this](AsyncWebServerRequest *request) {
        if (!authOk(request)) {
            sendError(request, 401, "token invalido");
            return;
        }
        nvs_.factoryReset();
        request->send(200, kJson, "{\"ok\":true,\"rebooting\":true}");
        wifi_.forget();
    });
}

bool ApiServer::beginProfileRun() {
    const char *id = model_.activeProfileId();
    if (id[0] == '\0') return false;

    nvs_.loadProfilesJson(g_scratchA, sizeof(g_scratchA));
    JsonDocument doc;
    if (deserializeJson(doc, g_scratchA)) return false;
    JsonArrayConst arr = doc.as<JsonArrayConst>();
    if (arr.isNull()) return false;

    JsonObjectConst prof;
    for (JsonObjectConst p : arr) {
        if (strcmp(id, p["id"] | "") == 0) {
            prof = p;
            break;
        }
    }
    if (prof.isNull()) return false;

    JsonArrayConst steps = prof["steps"].as<JsonArrayConst>();
    if (steps.isNull()) return false;

    uint8_t n = 0;
    for (JsonObjectConst s : steps) {
        if (n >= kMaxProfileSteps) break;
        const float secs = s["seconds"] | 0.0f;
        if (secs <= 0.0f) continue; // passo sem duração: ignora
        run_.stepSeconds[n] = (secs > 600.0f) ? 600 : static_cast<uint16_t>(secs + 0.5f);
        run_.stepPump[n] = s["pump"] | false;
        n++;
    }
    if (n == 0) return false;

    run_.count = n;
    run_.index = 0;
    run_.inBandSinceMs = 0;

    // A temperatura do perfil vira o setpoint, persistida como no ajuste manual.
    const float temp = prof["temperature_c"] | 0.0f;
    const bool hasTemp = temp >= 20.0f && temp <= TEMP_MAX_SAFETY_C;
    if (hasTemp) {
        model_.setTempSetpoint(temp);
        nvs_.saveTempSetpoint(temp);
    }

    model_.timer().reset();
    model_.setPumpOn(false);

    const unsigned long now = millis();
    if (hasTemp) {
        run_.phase = RunPhase::Preheat;
        run_.phaseStartMs = now;
        model_.setPreheating(true);
    } else {
        run_.phase = RunPhase::Steps;
        run_.stepStartMs = now;
        model_.setPreheating(false);
        model_.timer().start();
        model_.setPumpOn(run_.stepPump[0]);
    }
    return true;
}

void ApiServer::serviceProfileRun() {
    if (run_.phase == RunPhase::Idle) return;
    const unsigned long now = millis();

    if (run_.phase == RunPhase::Preheat) {
        if (now - run_.phaseStartMs > kPreheatTimeoutMs) {
            broadcastError("tempo esgotado aquecendo para a extracao");
            endProfileRun(true);
            return;
        }
        // "Pronto" = caldeira no alvo OU acima (menos a tolerância). Esperar ela
        // DESCER até setpoint±tol seria inútil: para espresso basta estar quente
        // o suficiente, e o resfriamento passivo leva minutos.
        const bool inBand =
            model_.tempCurrent() >= model_.tempSetpoint() - kPreheatToleranceC;
        if (!inBand) {
            run_.inBandSinceMs = 0; // ainda abaixo do alvo: reinicia a contagem de estabilidade
            return;
        }
        if (run_.inBandSinceMs == 0) run_.inBandSinceMs = now;
        if (now - run_.inBandSinceMs < kPreheatStableMs) return;

        // Temperatura estável: começa a sequência de passos e o cronômetro do shot.
        run_.phase = RunPhase::Steps;
        run_.index = 0;
        run_.stepStartMs = now;
        model_.setPreheating(false);
        model_.timer().reset();
        model_.timer().start();
        model_.setPumpOn(run_.stepPump[0]);
        return;
    }

    // RunPhase::Steps
    const unsigned long stepMs = static_cast<unsigned long>(run_.stepSeconds[run_.index]) * 1000UL;
    if (now - run_.stepStartMs < stepMs) return;

    run_.index++;
    if (run_.index >= run_.count) {
        endProfileRun(true); // fim natural da sequência
        return;
    }
    run_.stepStartMs = now;
    model_.setPumpOn(run_.stepPump[run_.index]);
}

void ApiServer::endProfileRun(bool broadcastStopped) {
    const bool wasActive = run_.phase != RunPhase::Idle;
    run_.phase = RunPhase::Idle;
    run_.inBandSinceMs = 0;
    model_.setPreheating(false);
    model_.timer().stop();
    model_.setPumpOn(false);
    extracting_ = false; // libera novo /api/extraction/start
    if (broadcastStopped && wasActive) broadcastEvent("extraction_stopped");
}

void ApiServer::broadcastEvent(const char *event) {
    char buf[96];
    snprintf(buf, sizeof(buf), "{\"event\":\"%s\"}", event);
    ws_.textAll(buf);
}

void ApiServer::broadcastError(const char *msg) {
    char buf[160];
    snprintf(buf, sizeof(buf), "{\"event\":\"error\",\"msg\":\"%s\"}", msg);
    ws_.textAll(buf);
}

void ApiServer::loop() {
    // Consome os pedidos de start/stop erguidos pelos handlers HTTP (task
    // AsyncTCP). Fazer aqui, na task do loop(), garante que run_ e a bomba só
    // são mexidas por uma task — sem isto um stop podia zerar run_.phase logo
    // depois do guard de serviceProfileRun(), que então religava a bomba sem
    // timer.
    if (stopReq_) {
        stopReq_ = false;
        startReq_ = false; // stop pendente cancela um start pendente
        endProfileRun(false);
        model_.timer().stop();
        model_.setPumpOn(false);
        broadcastEvent("extraction_stopped");
    }
    if (startReq_ && !extracting_) {
        startReq_ = false;
        // Extração assume o controle do setpoint; sai do modo vaporização.
        model_.setSteaming(false);
        // Com perfil ativo utilizável, o executor assume (preheat + passos).
        // Sem perfil, start manual: bomba ligada direto.
        if (!beginProfileRun()) {
            model_.timer().reset();
            model_.timer().start();
            model_.setPumpOn(true);
        }
        extracting_ = true;
        broadcastEvent("extraction_started");
    }

    serviceProfileRun(); // independente do intervalo de streaming

    const unsigned long now = millis();
    if (now - lastStreamMs_ < WS_STREAM_INTERVAL_MS) return;
    lastStreamMs_ = now;

    ws_.cleanupClients();
    if (ws_.count() == 0) return;

    char profileField[32];
    if (model_.activeProfileId()[0] == '\0') {
        snprintf(profileField, sizeof(profileField), "null");
    } else {
        snprintf(profileField, sizeof(profileField), "\"%s\"", model_.activeProfileId());
    }

    // D5/N2: frame montado com snprintf em buffer da pilha, sem alocação.
    char frame[kFrameJsonSize];
    snprintf(frame, sizeof(frame),
             "{\"t\":%lu,\"temp\":%.2f,\"press\":%.2f,\"timer\":%.1f,\"state\":\"%s\","
             "\"profile\":%s,\"duty\":%.1f,\"target\":%.2f,\"sensAgeMs\":%lu}",
             now, model_.tempCurrent(), model_.pressureCurrent(),
             model_.timer().elapsedMs() / 1000.0f, modeName(model_.mode()), profileField,
             model_.dutyPct(), model_.tempTarget(), model_.sensorAgeMs());
    ws_.textAll(frame);
}
