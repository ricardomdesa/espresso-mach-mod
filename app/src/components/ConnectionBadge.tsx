import React from 'react'
import { Link } from 'react-router-dom'
import { useMachine } from '../context/MachineContext'

const ConnectionBadge: React.FC = () => {
  const { connected, wsState } = useMachine()

  // `connected` só prova que o REST respondeu uma vez; o streaming ao vivo
  // (wsState) é que garante que as leituras na tela não estão congeladas.
  const live = connected && wsState === 'open'

  const className = `flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
    live ? 'bg-herb/10 text-herb' : 'bg-brick/10 text-brick'
  }`
  const dot = (
    <span className={`inline-block h-2 w-2 rounded-full ${live ? 'bg-herb' : 'bg-brick'}`} />
  )

  if (live) {
    return (
      <div className={className}>
        {dot}
        Conectado
      </div>
    )
  }

  // Offline: o badge vira o atalho para reconectar/parear a máquina.
  return (
    <Link to="/setup" className={`${className} active:opacity-70`} title="Conectar à máquina">
      {dot}
      Offline
    </Link>
  )
}

export default ConnectionBadge
