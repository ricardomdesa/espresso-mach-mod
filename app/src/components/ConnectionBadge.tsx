import React from 'react'
import { useMachine } from '../context/MachineContext'

const ConnectionBadge: React.FC = () => {
  const { connected } = useMachine()

  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-3 w-3 rounded-full"
        style={{
          backgroundColor: connected ? 'var(--color-success)' : 'var(--color-danger)',
        }}
      />
      <span className="text-sm text-neutral-400">
        {connected ? 'Conectado' : 'Desconectado'}
      </span>
    </div>
  )
}

export default ConnectionBadge
