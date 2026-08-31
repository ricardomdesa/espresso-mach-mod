package main

import (
	"math"
	"math/rand"
	"sync"
	"time"
)

// Constantes espelhadas do firmware (include/controle.h, include/rede.h e
// src/net/ApiServer.h). Mudou lá, muda aqui.
const (
	apiVersion            = 1
	tempMaxSafetyC        = 115.0
	tempBrewDefaultC      = 70.0
	tempSteamDefaultC     = 90.0
	tempSteamMinC         = 80.0
	tempSteamMaxC         = tempMaxSafetyC
	readyOnMarginC        = 1.0
	readyOffMarginC       = 4.0
	sensorFaultTimeoutMs  = 10000
	pidIntervalMs         = 200
	preheatToleranceC     = 2.0
	preheatStableMs       = 3000
	preheatTimeoutMs      = 180000
	tempModeToleranceC    = 2.0 // DisplayModel::kTempToleranceC
	maxProfileSteps       = 20
	maxProfileStepSeconds = 600
)

type runPhase uint8

const (
	phaseIdle runPhase = iota
	phasePreheat
	phaseSteps
)

// apiErr carrega o status HTTP que o handler deve devolver (400/401/409/...),
// igual ao sendError() do firmware.
type apiErr struct {
	code int
	msg  string
}

func (e apiErr) Error() string { return e.msg }

func errf(code int, msg string) apiErr { return apiErr{code, msg} }

// jsonEscape protege aspas/barras num valor de string montado à mão.
func jsonEscape(s string) string {
	out := make([]byte, 0, len(s)+4)
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c == '"' || c == '\\':
			out = append(out, '\\', c)
		case c < 0x20:
			// caractere de controle: descarta
		default:
			out = append(out, c)
		}
	}
	return string(out)
}

// runStep é um passo já normalizado (segundos > 0, clampado a 600).
type runStep struct {
	seconds float64
	pump    bool
}

// Machine é a fonte única de estado do ESP32 simulado. Toda leitura/escrita
// passa pelo mutex; o laço de simulação (Tick) e os handlers HTTP concorrem.
type Machine struct {
	mu   sync.Mutex
	boot time.Time

	// Rede / identidade
	wifiMode string // "sta" | "ap" | "offline"
	ip       string

	// Setpoints e ganhos (persistiriam em NVS no hardware)
	setpointC      float64
	steamSetpointC float64
	pressSetpointB float64
	kp, ki, kd     float64

	// Saídas lógicas (espelhadas nos GPIO no firmware)
	led        bool // GPIO20
	pump       bool // GPIO0 (relé da bomba, active-low no hardware)
	steam      bool // modo vaporização
	preheating bool // ciclo de perfil aquecendo antes dos passos
	ready      bool // GPIO1 (relé "temperatura pronta", com histerese)

	// Planta térmica
	tempC       float64 // temperatura real da caldeira
	reading     float64 // leitura "do termopar" (tempC + ruído)
	ambientC    float64
	pressB      float64
	heaterWatts float64
	thermalMass float64 // J/°C
	lossCoeff   float64 // W/°C
	noise       float64 // desvio-padrão do ruído de leitura (°C)
	manual      bool    // true = congela a planta (temperatura fixada à mão)
	sensorFault bool    // true = congela a idade da leitura -> dispara o failsafe

	// PID posicional — porte fiel de src/control/PidController.cpp
	duty        float64
	integral    float64
	pidLastTemp float64
	pidLastMs   int64

	sensLastReadMs int64

	// Cronômetro do shot
	timerRunning bool
	timerStartMs int64
	timerAccumMs int64

	// Executor de perfil de extração — espelha ApiServer::serviceProfileRun
	activeProfileID string
	run             struct {
		phase         runPhase
		steps         []runStep
		index         int
		phaseStartMs  int64
		stepStartMs   int64
		inBandSinceMs int64
	}
	extracting bool

	// Broadcast de eventos WS ({"event":...}). Ligado pelo main ao hub.
	bcast func([]byte)
}

type machineConfig struct {
	ip          string
	initTemp    float64
	initAmbient float64
}

func NewMachine(cfg machineConfig) *Machine {
	m := &Machine{
		boot:           time.Now(),
		wifiMode:       "sta",
		ip:             cfg.ip,
		setpointC:      tempBrewDefaultC,
		steamSetpointC: tempSteamDefaultC,
		pressSetpointB: 9.0,
		kp:             2.0,
		ki:             0.5,
		kd:             0.1,
		led:            true,
		tempC:          cfg.initTemp,
		reading:        cfg.initTemp,
		ambientC:       cfg.initAmbient,
		heaterWatts:    1400,
		thermalMass:    1200,
		lossCoeff:      8,
		noise:          0.12,
	}
	return m
}

func (m *Machine) nowMs() int64 { return time.Since(m.boot).Milliseconds() }

// emit/emitError disparam num goroutine à parte: serviceRun() e as mutações
// rodam com m.mu travado, e o broadcast faz I/O de rede nos clientes WS —
// não pode segurar o mutex da máquina enquanto escreve nos sockets.
func (m *Machine) emit(event string) {
	if m.bcast != nil {
		go m.bcast([]byte(`{"event":"` + event + `"}`))
	}
}

func (m *Machine) emitError(msg string) {
	if m.bcast != nil {
		go m.bcast([]byte(`{"event":"error","msg":"` + jsonEscape(msg) + `"}`))
	}
}

// effTarget: alvo efetivo do PID — vapor quando o modo está ligado, senão café.
// (DisplayModel::tempTarget)
func (m *Machine) effTarget() float64 {
	if m.steam {
		return m.steamSetpointC
	}
	return m.setpointC
}

func (m *Machine) timerElapsedMs() int64 {
	e := m.timerAccumMs
	if m.timerRunning {
		e += m.nowMs() - m.timerStartMs
	}
	return e
}

func (m *Machine) timerReset() {
	m.timerAccumMs = 0
	m.timerRunning = false
}

func (m *Machine) timerStart() {
	if !m.timerRunning {
		m.timerRunning = true
		m.timerStartMs = m.nowMs()
	}
}

func (m *Machine) timerStop() {
	if m.timerRunning {
		m.timerAccumMs += m.nowMs() - m.timerStartMs
		m.timerRunning = false
	}
}

// mode: porte fiel de DisplayModel::mode() — mesma ordem de prioridade.
func (m *Machine) mode() string {
	if m.timerRunning {
		return "extracting"
	}
	if m.preheating {
		return "preheating"
	}
	if m.steam {
		return "steaming"
	}
	if m.reading < m.effTarget()-tempModeToleranceC {
		return "heating"
	}
	return "idle"
}

// ---------------------------------------------------------------------------
// Laço de simulação
// ---------------------------------------------------------------------------

// Tick avança a planta térmica, o PID e o executor de perfil. dt em segundos.
func (m *Machine) Tick(dt float64) {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := m.nowMs()

	// Idade da leitura do termopar. Em falha injetada, o relógio congela e o
	// failsafe do PID entra depois de sensorFaultTimeoutMs.
	if !m.sensorFault {
		m.sensLastReadMs = now
	}

	// Planta: dT/dt = (Pin - Ploss) / C. Congelada em modo manual.
	if !m.manual {
		qIn := m.heaterWatts * m.duty / 100.0
		qLoss := m.lossCoeff * (m.tempC - m.ambientC)
		m.tempC += (qIn - qLoss) / m.thermalMass * dt
		if m.tempC < m.ambientC {
			m.tempC = m.ambientC // resfriamento passivo não passa do ambiente
		}
	}

	// Leitura ruidosa do termopar (o que o PID e a API enxergam).
	m.reading = m.tempC
	if m.noise > 0 {
		m.reading += m.noise * rand.NormFloat64()
	}

	// Pressão: sobe/decai com atraso de ~0,5 s rumo ao setpoint quando a bomba
	// está ligada, senão rumo a zero.
	targetP := 0.0
	if m.pump {
		targetP = m.pressSetpointB
	}
	k := dt / 0.5
	if k > 1 {
		k = 1
	}
	m.pressB += (targetP - m.pressB) * k
	if m.pressB < 0 {
		m.pressB = 0
	}

	m.pidUpdate(now)
	m.updateReady(now)
	m.serviceRun(now)
}

// pidUpdate: porte fiel de PidController::update() (cadência 200 ms,
// anti-windup na integral, derivada sobre a medição, dois failsafes).
func (m *Machine) pidUpdate(now int64) {
	if m.pidLastMs != 0 && now-m.pidLastMs < pidIntervalMs {
		return
	}
	temp := m.reading
	if m.pidLastMs == 0 {
		m.pidLastMs = now
		m.pidLastTemp = temp
		return
	}
	dt := float64(now-m.pidLastMs) / 1000.0
	m.pidLastMs = now

	if (now-m.sensLastReadMs) > sensorFaultTimeoutMs || temp > tempMaxSafetyC {
		m.duty = 0
		m.integral = 0
		m.pidLastTemp = temp
		return
	}

	sp := m.effTarget()
	err := sp - temp

	m.integral += m.ki * err * dt
	if m.integral < 0 {
		m.integral = 0
	}
	if m.integral > 100 {
		m.integral = 100
	}

	dTemp := (temp - m.pidLastTemp) / dt
	m.pidLastTemp = temp

	out := m.kp*err + m.integral - m.kd*dTemp
	if out < 0 {
		out = 0
	}
	if out > 100 {
		out = 100
	}
	m.duty = out
}

// updateReady: histerese do relé "temperatura pronta" (DisplayModel::update).
func (m *Machine) updateReady(now int64) {
	target := m.effTarget()
	switch {
	case now-m.sensLastReadMs >= sensorFaultTimeoutMs:
		m.ready = false
	case m.reading >= target-readyOnMarginC:
		m.ready = true
	case m.reading < target-readyOffMarginC:
		m.ready = false
	}
}

// serviceRun: porte de ApiServer::serviceProfileRun().
func (m *Machine) serviceRun(now int64) {
	switch m.run.phase {
	case phaseIdle:
		return
	case phasePreheat:
		if now-m.run.phaseStartMs > preheatTimeoutMs {
			m.emitError("tempo esgotado aquecendo para a extracao")
			m.endRun(true)
			return
		}
		if m.reading < m.setpointC-preheatToleranceC {
			m.run.inBandSinceMs = 0
			return
		}
		if m.run.inBandSinceMs == 0 {
			m.run.inBandSinceMs = now
		}
		if now-m.run.inBandSinceMs < preheatStableMs {
			return
		}
		m.run.phase = phaseSteps
		m.run.index = 0
		m.run.stepStartMs = now
		m.preheating = false
		m.timerReset()
		m.timerStart()
		m.pump = m.run.steps[0].pump
	case phaseSteps:
		stepMs := int64(m.run.steps[m.run.index].seconds * 1000)
		if now-m.run.stepStartMs < stepMs {
			return
		}
		m.run.index++
		if m.run.index >= len(m.run.steps) {
			m.endRun(true)
			return
		}
		m.run.stepStartMs = now
		m.pump = m.run.steps[m.run.index].pump
	}
}

// beginProfileRun: monta o executor a partir do perfil ativo. false => não há
// perfil utilizável (o chamador cai no start manual). Espelha
// ApiServer::beginProfileRun().
func (m *Machine) beginProfileRun(p *Profile) bool {
	if p == nil {
		return false
	}
	steps := make([]runStep, 0, maxProfileSteps)
	for _, s := range p.Steps {
		if s.Seconds <= 0 {
			continue
		}
		sec := s.Seconds
		if sec > maxProfileStepSeconds {
			sec = maxProfileStepSeconds
		}
		steps = append(steps, runStep{seconds: sec, pump: s.Pump})
		if len(steps) == maxProfileSteps {
			break
		}
	}
	if len(steps) == 0 {
		return false
	}
	m.run.steps = steps
	m.run.index = 0
	m.run.inBandSinceMs = 0

	hasTemp := p.TemperatureC >= 20 && p.TemperatureC <= tempMaxSafetyC
	if hasTemp {
		m.setpointC = p.TemperatureC
	}
	m.timerReset()
	m.pump = false

	now := m.nowMs()
	if hasTemp {
		m.run.phase = phasePreheat
		m.run.phaseStartMs = now
		m.preheating = true
	} else {
		m.run.phase = phaseSteps
		m.run.stepStartMs = now
		m.preheating = false
		m.timerStart()
		m.pump = steps[0].pump
	}
	return true
}

func (m *Machine) endRun(emitStopped bool) {
	was := m.run.phase != phaseIdle || m.extracting
	m.run.phase = phaseIdle
	m.run.steps = nil
	m.run.inBandSinceMs = 0
	m.preheating = false
	m.timerStop()
	m.pump = false
	m.extracting = false
	if emitStopped && was {
		m.emit("extraction_stopped")
	}
}

// ---------------------------------------------------------------------------
// Mutações da API (/api/*)
// ---------------------------------------------------------------------------

func (m *Machine) SetTempSetpoint(v float64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if v < 20 || v > tempMaxSafetyC {
		return errf(400, "temp fora da faixa (20-115)")
	}
	m.setpointC = v
	return nil
}

func (m *Machine) SetPressureSetpoint(v float64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if v < 0 || v > 15 {
		return errf(400, "press fora da faixa (0-15)")
	}
	m.pressSetpointB = v
	return nil
}

func (m *Machine) SetLed(on bool) {
	m.mu.Lock()
	m.led = on
	m.mu.Unlock()
}

func (m *Machine) SetPump(on bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.wifiMode == "ap" {
		return errf(409, "bomba indisponivel em modo de configuracao")
	}
	m.pump = on
	return nil
}

func (m *Machine) SetSteam(on bool, temp *float64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if on && (m.timerRunning || m.preheating) {
		return errf(409, "vaporizacao indisponivel durante extracao")
	}
	if temp != nil {
		if *temp < tempSteamMinC || *temp > tempSteamMaxC {
			return errf(400, "temp de vapor fora da faixa (80-115)")
		}
		m.steamSetpointC = *temp
	}
	wasSteaming := m.steam
	m.steam = on
	if wasSteaming && !on {
		m.setpointC = tempBrewDefaultC
	}
	return nil
}

func (m *Machine) SetPid(kp, ki, kd float64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if kp < 0 || ki < 0 || kd < 0 {
		return errf(400, "ganhos nao podem ser negativos")
	}
	m.kp, m.ki, m.kd = kp, ki, kd
	return nil
}

func (m *Machine) StartExtraction(p *Profile) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.wifiMode == "ap" {
		return errf(409, "extracao indisponivel em modo de configuracao")
	}
	if m.extracting {
		return errf(409, "extracao ja em andamento")
	}
	m.steam = false
	if !m.beginProfileRun(p) {
		m.timerReset()
		m.timerStart()
		m.pump = true
	}
	m.extracting = true
	m.emit("extraction_started")
	return nil
}

func (m *Machine) StopExtraction() {
	m.mu.Lock()
	m.endRun(false)
	m.mu.Unlock()
	m.emit("extraction_stopped") // stopReq sempre emite (ApiServer::loop)
}

func (m *Machine) SetActiveProfile(id string) {
	m.mu.Lock()
	m.activeProfileID = id
	m.mu.Unlock()
}

func (m *Machine) ClearActiveIfMatch(id string) {
	m.mu.Lock()
	if m.activeProfileID == id {
		m.activeProfileID = ""
	}
	m.mu.Unlock()
}

func (m *Machine) ActiveProfileID() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.activeProfileID
}

func (m *Machine) WifiMode() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.wifiMode
}

// ---------------------------------------------------------------------------
// Controles da simulação (/sim/*)
// ---------------------------------------------------------------------------

func (m *Machine) SimSetTemp(v float64) {
	m.mu.Lock()
	m.tempC = v
	m.reading = v // reflete já na próxima resposta, sem esperar um tick
	m.mu.Unlock()
}

func (m *Machine) SimSetAmbient(v float64) {
	m.mu.Lock()
	m.ambientC = v
	m.mu.Unlock()
}

func (m *Machine) SimSetPressure(v float64) {
	m.mu.Lock()
	if v < 0 {
		v = 0
	}
	m.pressB = v
	m.mu.Unlock()
}

func (m *Machine) SimSetPlant(heaterWatts, thermalMass, lossCoeff, noise *float64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if heaterWatts != nil && *heaterWatts > 0 {
		m.heaterWatts = *heaterWatts
	}
	if thermalMass != nil && *thermalMass > 0 {
		m.thermalMass = *thermalMass
	}
	if lossCoeff != nil && *lossCoeff >= 0 {
		m.lossCoeff = *lossCoeff
	}
	if noise != nil && *noise >= 0 {
		m.noise = *noise
	}
}

func (m *Machine) SimSetSensorFault(on bool) {
	m.mu.Lock()
	m.sensorFault = on
	m.mu.Unlock()
}

func (m *Machine) SimSetManual(on bool) {
	m.mu.Lock()
	m.manual = on
	m.mu.Unlock()
}

func (m *Machine) SetWifiMode(mode string) {
	m.mu.Lock()
	switch mode {
	case "ap", "sta", "offline":
		m.wifiMode = mode
	}
	m.mu.Unlock()
}

// Reset volta a máquina aos defaults de fábrica (usado por /api/factory-reset
// e /sim/reset).
func (m *Machine) Reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.endRun(false)
	m.wifiMode = "sta"
	m.setpointC = tempBrewDefaultC
	m.steamSetpointC = tempSteamDefaultC
	m.pressSetpointB = 9.0
	m.kp, m.ki, m.kd = 2.0, 0.5, 0.1
	m.led = true
	m.pump = false
	m.steam = false
	m.preheating = false
	m.tempC = m.ambientC
	m.reading = m.ambientC
	m.pressB = 0
	m.heaterWatts = 1400
	m.thermalMass = 1200
	m.lossCoeff = 8
	m.noise = 0.12
	m.manual = false
	m.sensorFault = false
	m.duty = 0
	m.integral = 0
	m.pidLastMs = 0
	m.activeProfileID = ""
	m.timerReset()
}

// Scenario aplica um preset de estado para facilitar testes manuais.
func (m *Machine) Scenario(name string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	switch name {
	case "cold-start":
		m.endRun(false)
		m.tempC = m.ambientC
		m.reading = m.ambientC
		m.duty = 0
		m.integral = 0
		m.pidLastMs = 0
		m.steam = false
		m.setpointC = 92
	case "at-temp":
		m.endRun(false)
		m.setpointC = 92
		m.tempC = 92
		m.reading = 92
		// Semeia a integral no duty de regime (perdas / potência) para a
		// caldeira ficar parada no alvo em vez de despencar.
		m.integral = clamp01x100(m.lossCoeff * (92 - m.ambientC) / m.heaterWatts * 100)
		m.pidLastMs = 0
	case "hot":
		m.tempC = 110
		m.reading = 110
	case "steam":
		m.endRun(false)
		m.steam = true
		m.steamSetpointC = tempSteamDefaultC
		m.tempC = 85
		m.reading = 85
	default:
		return errf(400, "cenario desconhecido")
	}
	return nil
}

// ---------------------------------------------------------------------------
// Snapshots (JSON)
// ---------------------------------------------------------------------------

func clamp01x100(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}

func round(v float64, dp int) float64 {
	p := math.Pow(10, float64(dp))
	return math.Round(v*p) / p
}

// Status é o corpo de GET /api/status — mesmos campos que
// ApiServer::buildStatusJson emite.
type Status struct {
	Api           int      `json:"api"`
	Temp          float64  `json:"temp"`
	Press         float64  `json:"press"`
	TempSetpoint  float64  `json:"tempSetpoint"`
	PressSetpoint float64  `json:"pressSetpoint"`
	Timer         float64  `json:"timer"`
	State         string   `json:"state"`
	Profile       *string  `json:"profile"`
	Led           bool     `json:"led"`
	Pump          bool     `json:"pump"`
	Steam         bool     `json:"steam"`
	SteamSetpoint float64  `json:"steamSetpoint"`
	Ready         bool     `json:"ready"`
	Duty          float64  `json:"duty"`
	Target        float64  `json:"target"`
	SensAgeMs     int64    `json:"sensAgeMs"`
	Uptime        int64    `json:"uptime"`
	WifiMode      string   `json:"wifiMode"`
	IP            string   `json:"ip"`
	Pid           PidGains `json:"pid"`
	Heap          int64    `json:"heap"`
}

type PidGains struct {
	Kp float64 `json:"kp"`
	Ki float64 `json:"ki"`
	Kd float64 `json:"kd"`
}

func (m *Machine) statusLocked() Status {
	var pp *string
	if m.activeProfileID != "" {
		id := m.activeProfileID
		pp = &id
	}
	now := m.nowMs()
	age := now - m.sensLastReadMs
	if age < 0 {
		age = 0
	}
	return Status{
		Api:           apiVersion,
		Temp:          round(m.reading, 2),
		Press:         round(m.pressB, 2),
		TempSetpoint:  round(m.setpointC, 2),
		PressSetpoint: round(m.pressSetpointB, 2),
		Timer:         round(float64(m.timerElapsedMs())/1000.0, 1),
		State:         m.mode(),
		Profile:       pp,
		Led:           m.led,
		Pump:          m.pump,
		Steam:         m.steam,
		SteamSetpoint: round(m.steamSetpointC, 2),
		Ready:         m.ready,
		Duty:          round(m.duty, 1),
		Target:        round(m.effTarget(), 2),
		SensAgeMs:     age,
		Uptime:        now / 1000,
		WifiMode:      m.wifiMode,
		IP:            m.ip,
		Pid:           PidGains{round(m.kp, 3), round(m.ki, 3), round(m.kd, 3)},
		Heap:          200000 + int64(rand.Intn(4000)),
	}
}

func (m *Machine) Status() Status {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.statusLocked()
}

// WsFrame é o frame de streaming do /ws (ApiServer::loop).
type WsFrame struct {
	T         int64   `json:"t"`
	Temp      float64 `json:"temp"`
	Press     float64 `json:"press"`
	Timer     float64 `json:"timer"`
	State     string  `json:"state"`
	Profile   *string `json:"profile"`
	Duty      float64 `json:"duty"`
	Target    float64 `json:"target"`
	SensAgeMs int64   `json:"sensAgeMs"`
}

func (m *Machine) Frame() WsFrame {
	m.mu.Lock()
	defer m.mu.Unlock()
	var pp *string
	if m.activeProfileID != "" {
		id := m.activeProfileID
		pp = &id
	}
	now := m.nowMs()
	age := now - m.sensLastReadMs
	if age < 0 {
		age = 0
	}
	return WsFrame{
		T:         now,
		Temp:      round(m.reading, 2),
		Press:     round(m.pressB, 2),
		Timer:     round(float64(m.timerElapsedMs())/1000.0, 1),
		State:     m.mode(),
		Profile:   pp,
		Duty:      round(m.duty, 1),
		Target:    round(m.effTarget(), 2),
		SensAgeMs: age,
	}
}

// SimState é o corpo de GET /sim/state: o status + o que só existe no
// simulador (planta, flags de teste, fase do executor).
type SimState struct {
	Status
	Ambient     float64 `json:"ambient"`
	HeaterWatts float64 `json:"heaterWatts"`
	ThermalMass float64 `json:"thermalMass"`
	LossCoeff   float64 `json:"lossCoeff"`
	Noise       float64 `json:"noise"`
	Manual      bool    `json:"manual"`
	SensorFault bool    `json:"sensorFault"`
	RunPhase    string  `json:"runPhase"`
	StepIndex   int     `json:"stepIndex"`
	StepCount   int     `json:"stepCount"`
	Integral    float64 `json:"integral"`
}

func (m *Machine) SimState() SimState {
	m.mu.Lock()
	defer m.mu.Unlock()
	phase := "idle"
	switch m.run.phase {
	case phasePreheat:
		phase = "preheat"
	case phaseSteps:
		phase = "steps"
	}
	return SimState{
		Status:      m.statusLocked(),
		Ambient:     round(m.ambientC, 1),
		HeaterWatts: m.heaterWatts,
		ThermalMass: m.thermalMass,
		LossCoeff:   m.lossCoeff,
		Noise:       m.noise,
		Manual:      m.manual,
		SensorFault: m.sensorFault,
		RunPhase:    phase,
		StepIndex:   m.run.index,
		StepCount:   len(m.run.steps),
		Integral:    round(m.integral, 1),
	}
}
