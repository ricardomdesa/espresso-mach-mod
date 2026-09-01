import { registerPlugin, Capacitor } from '@capacitor/core'

export interface NetworkStatus {
  /** Há uma VPN ativa capturando o tráfego do app. */
  vpnActive: boolean
  /** Existe uma rede Wi-Fi conectada. */
  wifiAvailable: boolean
  /** O app conseguiu prender seus sockets a uma rede específica. */
  bound: boolean
}

export interface NetworkBinderPlugin {
  /** Pede a Wi-Fi ao sistema e prende os sockets do app a ela. */
  bind(): Promise<{ requested: boolean }>
  /** Devolve o app para a rota padrão do sistema. */
  unbind(): Promise<void>
  status(): Promise<NetworkStatus>
}

const NetworkBinder = registerPlugin<NetworkBinderPlugin>('NetworkBinder')

// A máquina serve um AP sem internet. Sem este bind, o Android manda as
// requisições do app pelos dados móveis e elas nunca chegam no ESP32.
// No iOS não existe API equivalente: o plugin resolve com `requested: false` e
// quem segura a rede é o usuário no prompt do sistema.
// No browser (dev) não existe plugin nativo — vira no-op.
export async function bindToWifi(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { requested } = await NetworkBinder.bind()
    return requested
  } catch (err) {
    console.warn('[networkBinder] bind falhou', err)
    return false
  }
}

// Explica em português por que a máquina pode estar inalcançável, ou null se
// não há nada de errado com a rede do aparelho.
export async function diagnoseNetwork(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null
  let status: NetworkStatus
  try {
    status = await NetworkBinder.status()
  } catch {
    return null
  }

  if (status.vpnActive) {
    return 'Ha uma VPN ligada no celular. Ela captura todo o trafego do app e ' +
      'bloqueia o acesso a maquina na rede local — desligue a VPN e tente de novo.'
  }
  if (!status.wifiAvailable) {
    return 'O celular nao esta em nenhuma rede Wi-Fi. Conecte na rede da casa ' +
      '(ou em Philco-Setup, se for configurar a maquina).'
  }
  if (!status.bound) {
    // No Android o app prende os sockets na Wi-Fi; no iOS quem escolhe a rota e
    // o sistema, entao a acao que resolve e diferente em cada plataforma.
    return Capacitor.getPlatform() === 'ios'
      ? 'O iPhone esta mandando o trafego pelos dados moveis em vez da Wi-Fi ' +
        '(a rede da maquina nao tem internet). Toque em "Manter conexao" no ' +
        'aviso do sistema, ou desligue os dados moveis e tente de novo.'
      : 'O Android nao deixou o app usar a Wi-Fi (rede sem internet). ' +
        'Desligue os dados moveis e tente de novo.'
  }
  return null
}

export async function unbindFromWifi(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await NetworkBinder.unbind()
  } catch (err) {
    console.warn('[networkBinder] unbind falhou', err)
  }
}
