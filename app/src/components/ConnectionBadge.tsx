import React from 'react'
import { useMachine } from '../context/MachineContext'

const ConnectionBadge: React.FC = () => {
  const { connected, wsState } = useMachine()

  // `connected` só prova que o REST respondeu uma vez; o streaming ao vivo
  // (wsState) é que garante que as leituras na tela não estão congeladas.
  const live = connected && wsState === 'open'

  return (
    <div
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        live ? 'bg-herb/10 text-herb' : 'bg-brick/10 text-brick'
      }`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${live ? 'bg-herb' : 'bg-brick'}`}
      />
      {live ? 'Conectado' : 'Offline'}
    </div>
  )
}

export default ConnectionBadge
