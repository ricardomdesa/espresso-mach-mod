package main

import (
	"encoding/json"
	"net/http"
	"strings"
)

type server struct {
	m       *Machine
	store   *ProfileStore
	hub     *Hub
	token   string
	noAuth  bool
	htmlTpl []byte
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

// handleErr traduz um apiErr (com status embutido) ou cai em 400.
func handleErr(w http.ResponseWriter, err error) {
	if ae, ok := err.(apiErr); ok {
		writeErr(w, ae.code, ae.msg)
		return
	}
	writeErr(w, 400, err.Error())
}

func decodeBody(r *http.Request, v any) error {
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(v); err != nil {
		return apiErr{400, "JSON invalido"}
	}
	return nil
}

func (s *server) authOK(r *http.Request) bool {
	if s.noAuth {
		return true
	}
	return r.Header.Get("X-Auth-Token") == s.token
}

// requireAuth escreve o 401 e devolve false quando o token não confere.
func (s *server) requireAuth(w http.ResponseWriter, r *http.Request) bool {
	if s.authOK(r) {
		return true
	}
	writeErr(w, 401, "token invalido")
	return false
}

func (s *server) sendStatus(w http.ResponseWriter) {
	writeJSON(w, 200, s.m.Status())
}

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

func (s *server) routes() http.Handler {
	mux := http.NewServeMux()

	// --- Estado ---
	mux.HandleFunc("GET /api/status", func(w http.ResponseWriter, r *http.Request) {
		s.sendStatus(w)
	})

	// --- Setpoints e PID ---
	mux.HandleFunc("PUT /api/setpoint/temp", func(w http.ResponseWriter, r *http.Request) {
		if !s.requireAuth(w, r) {
			return
		}
		var b struct {
			Temp *float64 `json:"temp"`
		}
		if err := decodeBody(r, &b); err != nil {
			handleErr(w, err)
			return
		}
		if b.Temp == nil {
			writeErr(w, 400, "campo temp ausente")
			return
		}
		if err := s.m.SetTempSetpoint(*b.Temp); err != nil {
			handleErr(w, err)
			return
		}
		s.sendStatus(w)
	})

	mux.HandleFunc("PUT /api/setpoint/pressure", func(w http.ResponseWriter, r *http.Request) {
		if !s.requireAuth(w, r) {
			return
		}
		var b struct {
			Press *float64 `json:"press"`
		}
		if err := decodeBody(r, &b); err != nil {
			handleErr(w, err)
			return
		}
		if b.Press == nil {
			writeErr(w, 400, "campo press ausente")
			return
		}
		if err := s.m.SetPressureSetpoint(*b.Press); err != nil {
			handleErr(w, err)
			return
		}
		s.sendStatus(w)
	})

	mux.HandleFunc("PUT /api/led", func(w http.ResponseWriter, r *http.Request) {
		if !s.requireAuth(w, r) {
			return
		}
		var b struct {
			On *bool `json:"on"`
		}
		if err := decodeBody(r, &b); err != nil {
			handleErr(w, err)
			return
		}
		if b.On == nil {
			writeErr(w, 400, "campo on ausente")
			return
		}
		s.m.SetLed(*b.On)
		s.sendStatus(w)
	})

	mux.HandleFunc("PUT /api/pump", func(w http.ResponseWriter, r *http.Request) {
		if !s.requireAuth(w, r) {
			return
		}
		var b struct {
			On *bool `json:"on"`
		}
		if err := decodeBody(r, &b); err != nil {
			handleErr(w, err)
			return
		}
		if b.On == nil {
			writeErr(w, 400, "campo on ausente")
			return
		}
		if err := s.m.SetPump(*b.On); err != nil {
			handleErr(w, err)
			return
		}
		s.sendStatus(w)
	})

	mux.HandleFunc("PUT /api/steam", func(w http.ResponseWriter, r *http.Request) {
		if !s.requireAuth(w, r) {
			return
		}
		var b struct {
			On   *bool    `json:"on"`
			Temp *float64 `json:"temp"`
		}
		if err := decodeBody(r, &b); err != nil {
			handleErr(w, err)
			return
		}
		if b.On == nil {
			writeErr(w, 400, "campo on ausente")
			return
		}
		if err := s.m.SetSteam(*b.On, b.Temp); err != nil {
			handleErr(w, err)
			return
		}
		s.sendStatus(w)
	})

	mux.HandleFunc("PUT /api/pid", func(w http.ResponseWriter, r *http.Request) {
		if !s.requireAuth(w, r) {
			return
		}
		var b struct {
			Kp *float64 `json:"kp"`
			Ki *float64 `json:"ki"`
			Kd *float64 `json:"kd"`
		}
		if err := decodeBody(r, &b); err != nil {
			handleErr(w, err)
			return
		}
		if b.Kp == nil || b.Ki == nil || b.Kd == nil {
			writeErr(w, 400, "campos kp/ki/kd obrigatorios")
			return
		}
		if err := s.m.SetPid(*b.Kp, *b.Ki, *b.Kd); err != nil {
			handleErr(w, err)
			return
		}
		s.sendStatus(w)
	})

	// --- Extração ---
	mux.HandleFunc("POST /api/extraction/start", func(w http.ResponseWriter, r *http.Request) {
		if !s.requireAuth(w, r) {
			return
		}
		var p *Profile
		if id := s.m.ActiveProfileID(); id != "" {
			if got, ok := s.store.Get(id); ok {
				p = &got
			}
		}
		if err := s.m.StartExtraction(p); err != nil {
			handleErr(w, err)
			return
		}
		s.sendStatus(w)
	})

	mux.HandleFunc("POST /api/extraction/stop", func(w http.ResponseWriter, r *http.Request) {
		if !s.requireAuth(w, r) {
			return
		}
		s.m.StopExtraction()
		s.sendStatus(w)
	})

	// --- Perfis ---
	mux.HandleFunc("GET /api/profiles", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, s.store.List())
	})

	mux.HandleFunc("POST /api/profiles", func(w http.ResponseWriter, r *http.Request) {
		if !s.requireAuth(w, r) {
			return
		}
		var p Profile
		if err := decodeBody(r, &p); err != nil {
			handleErr(w, err)
			return
		}
		if strings.TrimSpace(p.Name) == "" {
			writeErr(w, 400, "campo name obrigatorio")
			return
		}
		writeJSON(w, 201, s.store.Create(p))
	})

	// "active" é segmento literal: no Go 1.22 ganha do wildcard "{id}".
	mux.HandleFunc("PUT /api/profiles/active", func(w http.ResponseWriter, r *http.Request) {
		if !s.requireAuth(w, r) {
			return
		}
		var b struct {
			ID string `json:"id"`
		}
		if err := decodeBody(r, &b); err != nil {
			handleErr(w, err)
			return
		}
		s.m.SetActiveProfile(b.ID)
		s.sendStatus(w)
	})

	mux.HandleFunc("PUT /api/profiles/{id}", func(w http.ResponseWriter, r *http.Request) {
		if !s.requireAuth(w, r) {
			return
		}
		var p Profile
		if err := decodeBody(r, &p); err != nil {
			handleErr(w, err)
			return
		}
		updated, ok := s.store.Update(r.PathValue("id"), p)
		if !ok {
			writeErr(w, 404, "perfil nao encontrado")
			return
		}
		writeJSON(w, 200, updated)
	})

	mux.HandleFunc("DELETE /api/profiles/{id}", func(w http.ResponseWriter, r *http.Request) {
		if !s.requireAuth(w, r) {
			return
		}
		id := r.PathValue("id")
		if !s.store.Delete(id) {
			writeErr(w, 404, "perfil nao encontrado")
			return
		}
		s.m.ClearActiveIfMatch(id)
		w.WriteHeader(204)
	})

	// --- Wi-Fi (stubs suficientes para o fluxo do app) ---
	mux.HandleFunc("GET /api/wifi/scan", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]any{
			"scanning": false,
			"networks": []map[string]any{
				{"ssid": "Rede-Casa", "rssi": -47, "secure": true},
				{"ssid": "Vizinho 2G", "rssi": -71, "secure": true},
				{"ssid": "IoT", "rssi": -63, "secure": false},
			},
		})
	})

	mux.HandleFunc("POST /api/wifi/provision", func(w http.ResponseWriter, r *http.Request) {
		// Exceção ao gate de token só enquanto o AP está no ar (igual firmware).
		if s.m.WifiMode() != "ap" && !s.requireAuth(w, r) {
			return
		}
		var b struct {
			SSID     string `json:"ssid"`
			Password string `json:"password"`
		}
		if err := decodeBody(r, &b); err != nil {
			handleErr(w, err)
			return
		}
		if strings.TrimSpace(b.SSID) == "" {
			writeErr(w, 400, "ssid obrigatorio")
			return
		}
		s.m.SetWifiMode("sta")
		writeJSON(w, 200, map[string]any{"ok": true, "rebooting": true, "token": s.token})
	})

	mux.HandleFunc("POST /api/wifi/forget", func(w http.ResponseWriter, r *http.Request) {
		if !s.requireAuth(w, r) {
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true, "rebooting": true})
	})

	mux.HandleFunc("POST /api/factory-reset", func(w http.ResponseWriter, r *http.Request) {
		if !s.requireAuth(w, r) {
			return
		}
		s.m.Reset()
		writeJSON(w, 200, map[string]any{"ok": true, "rebooting": true})
	})

	// --- WebSocket de streaming ---
	mux.HandleFunc("GET /ws", s.hub.handler)

	// --- Controles do simulador ---
	s.simRoutes(mux)

	// --- Tela web + fallback 404 no formato do firmware ({"error":...}) ---
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			writeErr(w, 404, "rota nao encontrada")
			return
		}
		if r.Method != http.MethodGet {
			writeErr(w, 404, "rota nao encontrada")
			return
		}
		body := strings.Replace(string(s.htmlTpl), "__SIM_TOKEN__", s.token, 1)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(body))
	})

	return mux
}

// ---------------------------------------------------------------------------
// /sim/* — não exigem token (ferramenta de dev; a tela web já tem o token)
// ---------------------------------------------------------------------------

func (s *server) simRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /sim/state", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, s.m.SimState())
	})

	mux.HandleFunc("POST /sim/temp", func(w http.ResponseWriter, r *http.Request) {
		var b struct {
			Temp *float64 `json:"temp"`
		}
		if err := decodeBody(r, &b); err != nil || b.Temp == nil {
			writeErr(w, 400, "campo temp obrigatorio")
			return
		}
		s.m.SimSetTemp(*b.Temp)
		writeJSON(w, 200, s.m.SimState())
	})

	mux.HandleFunc("POST /sim/ambient", func(w http.ResponseWriter, r *http.Request) {
		var b struct {
			Temp *float64 `json:"temp"`
		}
		if err := decodeBody(r, &b); err != nil || b.Temp == nil {
			writeErr(w, 400, "campo temp obrigatorio")
			return
		}
		s.m.SimSetAmbient(*b.Temp)
		writeJSON(w, 200, s.m.SimState())
	})

	mux.HandleFunc("POST /sim/pressure", func(w http.ResponseWriter, r *http.Request) {
		var b struct {
			Press *float64 `json:"press"`
		}
		if err := decodeBody(r, &b); err != nil || b.Press == nil {
			writeErr(w, 400, "campo press obrigatorio")
			return
		}
		s.m.SimSetPressure(*b.Press)
		writeJSON(w, 200, s.m.SimState())
	})

	mux.HandleFunc("POST /sim/plant", func(w http.ResponseWriter, r *http.Request) {
		var b struct {
			HeaterWatts *float64 `json:"heaterWatts"`
			ThermalMass *float64 `json:"thermalMass"`
			LossCoeff   *float64 `json:"lossCoeff"`
			Noise       *float64 `json:"noise"`
		}
		if err := decodeBody(r, &b); err != nil {
			handleErr(w, err)
			return
		}
		s.m.SimSetPlant(b.HeaterWatts, b.ThermalMass, b.LossCoeff, b.Noise)
		writeJSON(w, 200, s.m.SimState())
	})

	mux.HandleFunc("POST /sim/sensor-fault", func(w http.ResponseWriter, r *http.Request) {
		var b struct {
			On *bool `json:"on"`
		}
		if err := decodeBody(r, &b); err != nil || b.On == nil {
			writeErr(w, 400, "campo on obrigatorio")
			return
		}
		s.m.SimSetSensorFault(*b.On)
		writeJSON(w, 200, s.m.SimState())
	})

	mux.HandleFunc("POST /sim/mode", func(w http.ResponseWriter, r *http.Request) {
		var b struct {
			Mode   string `json:"mode"`
			Manual *bool  `json:"manual"`
		}
		if err := decodeBody(r, &b); err != nil {
			handleErr(w, err)
			return
		}
		switch {
		case b.Manual != nil:
			s.m.SimSetManual(*b.Manual)
		case b.Mode == "manual":
			s.m.SimSetManual(true)
		case b.Mode == "auto":
			s.m.SimSetManual(false)
		default:
			writeErr(w, 400, "mode deve ser auto|manual")
			return
		}
		writeJSON(w, 200, s.m.SimState())
	})

	mux.HandleFunc("POST /sim/wifi-mode", func(w http.ResponseWriter, r *http.Request) {
		var b struct {
			Mode string `json:"mode"`
		}
		if err := decodeBody(r, &b); err != nil {
			handleErr(w, err)
			return
		}
		if b.Mode != "ap" && b.Mode != "sta" && b.Mode != "offline" {
			writeErr(w, 400, "mode deve ser ap|sta|offline")
			return
		}
		s.m.SetWifiMode(b.Mode)
		writeJSON(w, 200, s.m.SimState())
	})

	mux.HandleFunc("POST /sim/scenario", func(w http.ResponseWriter, r *http.Request) {
		var b struct {
			Name string `json:"name"`
		}
		if err := decodeBody(r, &b); err != nil {
			handleErr(w, err)
			return
		}
		if err := s.m.Scenario(b.Name); err != nil {
			handleErr(w, err)
			return
		}
		writeJSON(w, 200, s.m.SimState())
	})

	mux.HandleFunc("POST /sim/reset", func(w http.ResponseWriter, r *http.Request) {
		s.m.Reset()
		writeJSON(w, 200, s.m.SimState())
	})
}
