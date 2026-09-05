import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useMachine } from './context/MachineContext'
import { getIndex, migrate } from './utils/shotRepository'
import { sweepOrphanPhotos } from './utils/photoStore'
import SetupScreen from './screens/SetupScreen'
import ProvisionScreen from './screens/ProvisionScreen'
import DashboardScreen from './screens/DashboardScreen'
import SteamScreen from './screens/SteamScreen'
import ProfilesScreen from './screens/ProfilesScreen'
import ProfileEditorScreen from './screens/ProfileEditorScreen'
import SettingsScreen from './screens/SettingsScreen'
import HistoryScreen from './screens/HistoryScreen'
import PrepScreen from './screens/PrepScreen'
import ShotDetailScreen from './screens/ShotDetailScreen'

const App: React.FC = () => {
  const { connected, baseUrl } = useMachine()

  // A máquina pode estar desligada. Se o app já foi pareado alguma vez
  // (`baseUrl` conhecido), o shell abre offline — dashboard mostra "Offline",
  // e ajustes/perfis funcionam via cache local. Só a primeira execução, sem
  // endereço nenhum, cai direto no /setup.
  const shellReady = connected || !!baseUrl

  // Migração do histórico (schema 1 -> 2, SDD-008) precisa terminar antes da
  // primeira renderização do histórico ou de qualquer tela que leia shots.
  const [migrated, setMigrated] = useState(false)
  useEffect(() => {
    migrate()
      .finally(() => setMigrated(true))
      .then(() => getIndex())
      .then((index) => sweepOrphanPhotos(index.map((e) => e.id)))
      .catch(() => {}) // varredura de orfaos (R3): melhor esforco, nao bloqueia o app
  }, [])
  if (!migrated) return null

  return (
    <div className="min-h-screen bg-latte text-ink">
      <Routes>
        <Route path="/setup" element={<SetupScreen />} />
        <Route
          path="/provision"
          element={connected ? <ProvisionScreen /> : <Navigate to="/setup" replace />}
        />
        <Route
          path="/"
          element={shellReady ? <DashboardScreen /> : <Navigate to="/setup" replace />}
        />
        <Route
          path="/steam"
          element={shellReady ? <SteamScreen /> : <Navigate to="/setup" replace />}
        />
        {/* Perfis e ajustes não dependem da máquina — abrem offline. */}
        <Route path="/profiles" element={<ProfilesScreen />} />
        <Route path="/profiles/new" element={<ProfileEditorScreen />} />
        <Route path="/profiles/:id/edit" element={<ProfileEditorScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/history" element={<HistoryScreen />} />
        <Route path="/shots/:id" element={<ShotDetailScreen />} />
        {/* Preparo nao depende da maquina — abre offline, igual ao historico. */}
        <Route path="/prep" element={<PrepScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default App
