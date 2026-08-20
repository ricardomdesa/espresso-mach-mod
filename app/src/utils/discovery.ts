const MDNS_HOSTNAME = 'philco.local'
const AP_FALLBACK_IP = '192.168.4.1'
const SCAN_TIMEOUT_MS = 200
const COMMON_SUBNETS = ['192.168.1', '192.168.0', '10.0.0']

async function tryFetch(url: string, timeout = SCAN_TIMEOUT_MS): Promise<boolean> {
  try {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), timeout)
    const res = await fetch(`${url}/api/status`, {
      signal: controller.signal,
    })
    clearTimeout(id)
    return res.ok
  } catch {
    return false
  }
}

export async function discoverMachine(): Promise<string | null> {
  // 1. Tentar mDNS
  try {
    const mdnsUrl = `http://${MDNS_HOSTNAME}`
    if (await tryFetch(mdnsUrl, 1000)) {
      return mdnsUrl
    }
  } catch {
    // mDNS falhou
  }

  // 2. Fallback AP direto
  const apUrl = `http://${AP_FALLBACK_IP}`
  if (await tryFetch(apUrl, 500)) {
    return apUrl
  }

  // 3. Subnet scan (background, paralelo)
  const candidates: string[] = []
  for (const subnet of COMMON_SUBNETS) {
    for (let i = 1; i <= 254; i++) {
      candidates.push(`http://${subnet}.${i}`)
    }
  }

  // Scan em lotes de 10 para nao saturar
  const batchSize = 10
  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize)
    const results = await Promise.all(
      batch.map(async (url) => ({ url, ok: await tryFetch(url) })),
    )
    const found = results.find((r) => r.ok)
    if (found) return found.url
  }

  return null
}
