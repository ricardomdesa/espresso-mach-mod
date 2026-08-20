import React from 'react'
import { useMachine } from '../context/MachineContext'

const ConnectionBadge: React.FC = () => {
  const { connected } = useMachine()

  return (
    <div
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        connected ? 'bg-herb/10 text-herb' : 'bg-brick/10 text-brick'
      }`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-herb' : 'bg-brick'}`}
      />
      {connected ? 'Conectado' : 'Offline'}
    </div>
  )
}

export default ConnectionBadge
