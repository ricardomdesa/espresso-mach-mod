package main

import (
	_ "embed"
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"
)

//go:embed web/index.html
var indexHTML []byte

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envFloat(key string, def float64) float64 {
	if v := os.Getenv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return def
}

func envBool(key string) bool {
	v := os.Getenv(key)
	return v == "1" || v == "true" || v == "yes"
}

// cors espelha os DefaultHeaders do firmware (ApiServer::registerRoutes) e
// responde o preflight na hora.
func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Access-Control-Allow-Origin", "*")
		h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		h.Set("Access-Control-Allow-Headers", "Content-Type, Accept, X-Auth-Token")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	port := flag.String("port", envOr("SIM_PORT", "8080"), "porta HTTP")
	token := flag.String("token", envOr("SIM_AUTH_TOKEN", "sim-token"), "token X-Auth-Token exigido nos endpoints mutantes")
	noAuth := flag.Bool("no-auth", envBool("SIM_AUTH_DISABLED"), "aceita qualquer token (conveniência de dev)")
	ip := flag.String("ip", envOr("SIM_IP", "192.168.1.50"), "IP reportado no campo status.ip")
	initTemp := flag.Float64("init-temp", envFloat("SIM_INIT_TEMP", 25), "temperatura inicial da caldeira (°C)")
	initAmbient := flag.Float64("init-ambient", envFloat("SIM_INIT_AMBIENT", 25), "temperatura ambiente (°C)")
	flag.Parse()

	m := NewMachine(machineConfig{ip: *ip, initTemp: *initTemp, initAmbient: *initAmbient})
	store := NewProfileStore()
	hub := NewHub()
	m.bcast = hub.Broadcast

	srv := &server{m: m, store: store, hub: hub, token: *token, noAuth: *noAuth, htmlTpl: indexHTML}

	// Laço de simulação: ~50 Hz, dt real entre ticks.
	go func() {
		t := time.NewTicker(20 * time.Millisecond)
		defer t.Stop()
		last := time.Now()
		for range t.C {
			now := time.Now()
			dt := now.Sub(last).Seconds()
			last = now
			if dt > 0.5 {
				dt = 0.5 // não deixa um pause do processo dar um passo gigante
			}
			m.Tick(dt)
		}
	}()

	// Streaming WS: frame a cada 100 ms (WS_STREAM_INTERVAL_MS).
	go func() {
		t := time.NewTicker(100 * time.Millisecond)
		defer t.Stop()
		for range t.C {
			if hub.Count() == 0 {
				continue
			}
			b, _ := json.Marshal(m.Frame())
			hub.Broadcast(b)
		}
	}()

	addr := ":" + *port
	auth := "token \"" + *token + "\""
	if *noAuth {
		auth = "DESLIGADA (SIM_AUTH_DISABLED)"
	}
	log.Printf("ESP32 simulado ouvindo em http://localhost%s", addr)
	log.Printf("  tela web:   http://localhost%s/", addr)
	log.Printf("  REST/WS:    /api/*  e  ws://localhost%s/ws", addr)
	log.Printf("  controles:  /sim/*  (GET /sim/state)")
	log.Printf("  auth:       %s", auth)
	log.Printf("  emulador Android: endereço manual  10.0.2.2:%s", *port)

	if err := http.ListenAndServe(addr, cors(srv.routes())); err != nil {
		log.Fatal(err)
	}
}
