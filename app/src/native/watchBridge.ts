import { registerPlugin, Capacitor } from '@capacitor/core'

export interface WatchBridgePlugin {
  /** Manda endereço e código ao Apple Watch. Sem campos = desconectado. */
  sync(opts: { baseUrl?: string; token?: string }): Promise<{ delivered: boolean }>
}

const WatchBridge = registerPlugin<WatchBridgePlugin>('WatchBridge')

// O app do relógio (ios/App/EspressoWatch) não tem setup próprio: herda a
// conexão do iPhone. Só existe no iOS; no Android e no browser vira no-op.
export async function syncWatch(baseUrl: string | null, token: string | null): Promise<void> {
  if (Capacitor.getPlatform() !== 'ios') return
  try {
    await WatchBridge.sync({
      ...(baseUrl ? { baseUrl } : {}),
      ...(baseUrl && token ? { token } : {}),
    })
  } catch (err) {
    console.warn('[watchBridge] sync falhou', err)
  }
}
