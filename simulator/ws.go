package main

import (
	"bytes"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// wsClient serializa as escritas num socket: o broadcaster e o handler de
// leitura (que responde "pong") escrevem no mesmo conn, e o gorilla proíbe
// escrita concorrente.
type wsClient struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

func (c *wsClient) write(msg []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	_ = c.conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	return c.conn.WriteMessage(websocket.TextMessage, msg)
}

// Hub replica o AsyncWebSocket do firmware: guarda os clientes de /ws e
// espalha frames de streaming e eventos ({"event":...}).
type Hub struct {
	mu      sync.Mutex
	clients map[*wsClient]struct{}
}

func NewHub() *Hub {
	return &Hub{clients: map[*wsClient]struct{}{}}
}

func (h *Hub) add(c *wsClient) {
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()
}

func (h *Hub) remove(c *wsClient) {
	h.mu.Lock()
	delete(h.clients, c)
	h.mu.Unlock()
	_ = c.conn.Close()
}

// Broadcast manda msg para todos; quem falhar na escrita é descartado.
func (h *Hub) Broadcast(msg []byte) {
	h.mu.Lock()
	targets := make([]*wsClient, 0, len(h.clients))
	for c := range h.clients {
		targets = append(targets, c)
	}
	h.mu.Unlock()

	for _, c := range targets {
		if err := c.write(msg); err != nil {
			h.remove(c)
		}
	}
}

func (h *Hub) Count() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.clients)
}

var wsUpgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// A app roda em http://localhost dentro da WebView: origem sempre diferente.
	CheckOrigin: func(*http.Request) bool { return true },
}

func (h *Hub) handler(w http.ResponseWriter, r *http.Request) {
	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	c := &wsClient{conn: conn}
	h.add(c)
	defer h.remove(c)

	for {
		mt, data, err := conn.ReadMessage()
		if err != nil {
			return
		}
		// Único comando aceito: keepalive (igual ao firmware).
		if mt == websocket.TextMessage && bytes.Contains(data, []byte("ping")) {
			_ = c.write([]byte(`{"event":"pong"}`))
		}
	}
}
