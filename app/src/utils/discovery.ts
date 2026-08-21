const MDNS_HOSTNAME = 'philco.local'
const AP_FALLBACK_IP = '192.168.4.1'
const SCAN_TIMEOUT_MS = 400
const COMMON_SUBNETS = ['192.168.1', '192.168.0', '192.168.15', '10.0.0']
const BATCH_SIZE = 32

async function tryFetch(url: string, timeout = SCAN_TIMEOUT_MS): Promise<boolean> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(`${url}/api/status`, { signal: controller.signal })
    if (!res.ok) return false
    // Um roteador ou qualquer outro host da rede também responde 200 em /.
    // Só aceitamos quem devolve o JSON de status da máquina.
    const body = await res.json()
    return typeof body === 'object' && body !== null && 'wifiMode' in body
  } catch {
    return false
  } finally {
    clearTimeout(id)
  }
}

// Descobre o /24 do próprio aparelho pelos candidatos ICE do WebRTC. Evita
// varrer subnets erradas (o roteador pode usar 192.168.15.x, por exemplo).
// Pode falhar por causa da ofuscacao mDNS da WebView — daí o fallback.
async function localSubnets(): Promise<string[]> {
  const RTC = (window as any).RTCPeerConnection
  if (!RTC) return []

  return new Promise<string[]>((resolve) => {
    const found = new Set<string>()
    let pc: any
    try {
      pc = new RTC({ iceServers: [] })
    } catch {
      resolve([])
      return
    }

    const done = () => {
      try {
        pc.close()
      } catch {
        /* ignora */
      }
      resolve([...found])
    }

    const timer = setTimeout(done, 1500)

    pc.onicecandidate = (ev: any) => {
      if (!ev.candidate) {
        clearTimeout(timer)
        done()
        return
      }
      const m = /(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}/.exec(ev.candidate.candidate || '')
      if (m && !m[1].startsWith('127.')) found.add(m[1])
    }

    try {
      pc.createDataChannel('probe')
      pc.createOffer().then((o: any) => pc.setLocalDescription(o)).catch(done)
    } catch {
      clearTimeout(timer)
      done()
    }
  })
}

async function scanSubnet(subnet: string): Promise<string | null> {
  const candidates: string[] = []
  for (let i = 1; i <= 254; i++) candidates.push(`http://${subnet}.${i}`)

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(
      batch.map(async (url) => ({ url, ok: await tryFetch(url) })),
    )
    const found = results.find((r) => r.ok)
    if (found) return found.url
  }
  return null
}

export async function discoverMachine(): Promise<string | null> {
  // 1. mDNS (caminho normal em modo STA)
  const mdnsUrl = `http://${MDNS_HOSTNAME}`
  if (await tryFetch(mdnsUrl, 1500)) return mdnsUrl

  // 2. AP de provisionamento (celular conectado na rede "Philco-Setup")
  const apUrl = `http://${AP_FALLBACK_IP}`
  if (await tryFetch(apUrl, 800)) return apUrl

  // 3. Varredura: subnet do proprio aparelho primeiro, depois as comuns
  const preferred = await localSubnets()
  const subnets = [...new Set([...preferred, ...COMMON_SUBNETS])]
  for (const subnet of subnets) {
    const found = await scanSubnet(subnet)
    if (found) return found
  }

  return null
}

// Checa se a maquina esta acessivel no endereco do AP de provisionamento.
export async function isProvisioningApReachable(): Promise<boolean> {
  return tryFetch(`http://${AP_FALLBACK_IP}`, 1500)
}

export const PROVISIONING_AP_URL = `http://${AP_FALLBACK_IP}`
