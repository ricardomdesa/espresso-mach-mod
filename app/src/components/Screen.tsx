import React from 'react'
import BottomNav from './BottomNav'
import ConnectionBadge from './ConnectionBadge'

interface ScreenProps {
  title: string
  /** Conteudo alinhado a direita no header (botao de acao, etc). */
  action?: React.ReactNode
  /** Mostra o indicador de conexao no header. */
  showConnection?: boolean
  /** Mostra a bottom nav fixa (desligado em fluxos modais como setup/editor). */
  showNav?: boolean
  children: React.ReactNode
}

const Screen: React.FC<ScreenProps> = ({
  title,
  action,
  showConnection = false,
  showNav = true,
  children,
}) => {
  return (
    <div className="min-h-screen bg-latte">
      <header className="sticky top-0 z-10 border-b border-line bg-latte/90 backdrop-blur safe-area-top">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between gap-3 px-4">
          <h1 className="truncate text-lg font-semibold tracking-tight text-ink">{title}</h1>
          <div className="flex shrink-0 items-center gap-3">
            {showConnection && <ConnectionBadge />}
            {action}
          </div>
        </div>
      </header>

      <main
        className={`mx-auto max-w-md px-4 pt-4 ${showNav ? 'pb-nav' : 'pb-6 safe-area-bottom'}`}
      >
        {children}
      </main>

      {showNav && <BottomNav />}
    </div>
  )
}

export default Screen
