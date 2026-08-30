package main

import (
	"fmt"
	"sync"
)

// ProfileStep e Profile têm o mesmo formato JSON que app/src/api/types.ts e a
// NVS do firmware usam.
type ProfileStep struct {
	Seconds float64 `json:"seconds"`
	Pump    bool    `json:"pump"`
}

type Profile struct {
	ID           string        `json:"id"`
	Name         string        `json:"name"`
	Description  string        `json:"description,omitempty"`
	TemperatureC float64       `json:"temperature_c"`
	Steps        []ProfileStep `json:"steps"`
}

// ProfileStore guarda os perfis em memória (no hardware seria a NVS). IDs
// sequenciais "p1", "p2", ... como no firmware (contador persistido).
type ProfileStore struct {
	mu     sync.Mutex
	items  []Profile
	nextID int
}

func NewProfileStore() *ProfileStore {
	return &ProfileStore{
		items: []Profile{{
			ID:           "p1",
			Name:         "Padrão",
			Description:  "Pré-infusão curta e extração",
			TemperatureC: 92,
			Steps: []ProfileStep{
				{Seconds: 3, Pump: true},
				{Seconds: 5, Pump: false},
				{Seconds: 27, Pump: true},
			},
		}},
		nextID: 2,
	}
}

func (s *ProfileStore) List() []Profile {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Profile, len(s.items))
	copy(out, s.items)
	return out
}

func (s *ProfileStore) Get(id string) (Profile, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, p := range s.items {
		if p.ID == id {
			return p, true
		}
	}
	return Profile{}, false
}

func (s *ProfileStore) Create(p Profile) Profile {
	s.mu.Lock()
	defer s.mu.Unlock()
	p.ID = fmt.Sprintf("p%d", s.nextID)
	s.nextID++
	s.items = append(s.items, p)
	return p
}

func (s *ProfileStore) Update(id string, p Profile) (Profile, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.items {
		if s.items[i].ID == id {
			p.ID = id
			s.items[i] = p
			return p, true
		}
	}
	return Profile{}, false
}

func (s *ProfileStore) Delete(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.items {
		if s.items[i].ID == id {
			s.items = append(s.items[:i], s.items[i+1:]...)
			return true
		}
	}
	return false
}
