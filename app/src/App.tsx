import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useMachine } from './context/MachineContext'
import SetupScreen from './screens/SetupScreen'
import ProvisionScreen from './screens/ProvisionScreen'
import DashboardScreen from './screens/DashboardScreen'
import SteamScreen from './screens/SteamScreen'
import ProfilesScreen from './screens/ProfilesScreen'
import ProfileEditorScreen from './screens/ProfileEditorScreen'
import SettingsScreen from './screens/SettingsScreen'
import HistoryScreen from './screens/HistoryScreen'

const App: React.FC = () => {
  const { connected } = useMachine()

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
          element={connected ? <DashboardScreen /> : <Navigate to="/setup" replace />}
        />
        <Route
          path="/steam"
          element={connected ? <SteamScreen /> : <Navigate to="/setup" replace />}
        />
        <Route
          path="/profiles"
          element={connected ? <ProfilesScreen /> : <Navigate to="/setup" replace />}
        />
        <Route
          path="/profiles/new"
          element={connected ? <ProfileEditorScreen /> : <Navigate to="/setup" replace />}
        />
        <Route
          path="/profiles/:id/edit"
          element={connected ? <ProfileEditorScreen /> : <Navigate to="/setup" replace />}
        />
        <Route
          path="/settings"
          element={connected ? <SettingsScreen /> : <Navigate to="/setup" replace />}
        />
        <Route
          path="/history"
          element={<HistoryScreen />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default App
