import React from 'react'

interface Props {
  children: React.ReactNode
}

interface State {
  error: Error | null
}

// Sem este boundary, qualquer exceção durante o render/efeito desmonta a
// árvore inteira e o usuário vê só uma tela branca, sem pista do que houve.
class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleReload = () => {
    this.setState({ error: null })
    window.location.hash = '#/setup'
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-latte px-6 text-center safe-area-top safe-area-bottom">
        <div className="w-full max-w-sm rounded-2xl border border-brick/30 bg-cream p-5 shadow-card">
          <h1 className="text-base font-bold text-brick">Algo quebrou</h1>
          <p className="mt-2 text-xs text-muted">
            O app encontrou um erro inesperado e parou esta tela.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded-xl bg-latte p-3 text-left text-[11px] leading-relaxed text-ink">
            {error.message}
          </pre>
          <button
            onClick={this.handleReload}
            className="mt-4 w-full rounded-xl bg-mocha py-3 text-sm font-bold uppercase tracking-wide text-cream shadow-raised active:bg-mocha-dark"
          >
            Recarregar
          </button>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
