import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { MachineProvider } from './context/MachineContext'
import { SettingsProvider } from './context/SettingsContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SettingsProvider>
      <MachineProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </MachineProvider>
    </SettingsProvider>
  </React.StrictMode>,
)
