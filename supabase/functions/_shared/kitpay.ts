// Outils partagés pour l'intégration KitPay (paiement par mobile money en Mauritanie).
// Documentation de KitPay : https://github.com/MoulayeHamoni/kitpay-solutionia (docs/api.md, docs/integration.md)

/** Moyens de paiement d'Axone -> nom attendu par l'API KitPay (« Masrvi » s'écrit ainsi chez KitPay). */
export const KITPAY_METHODS: Record<string, string> = {
  bankily: 'Bankily',
  masrivi: 'Masrvi',
  sedad: 'Sedad',
  click: 'Click',
}

const hex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')

/** Comparaison en temps constant de deux chaînes (évite de révéler la signature par le temps de réponse). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Vérifie l'en-tête `X-KitPay-Signature: t=<unix_ts>,v1=<hex_hmac_sha256>`.
 * La signature est un HMAC-SHA256 de « {t}.{corps brut} » avec le secret du webhook.
 * Les requêtes plus vieilles que `toleranceSec` secondes sont refusées (protection contre le rejeu).
 */
export async function verifyKitPaySignature(
  rawBody: string,
  header: string,
  secret: string,
  toleranceSec = 300,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const parts: Record<string, string> = {}
  for (const p of header.split(',')) {
    const [k, ...rest] = p.split('=')
    if (k && rest.length) parts[k.trim()] = rest.join('=').trim()
  }
  const t = parseInt(parts.t, 10)
  const v1 = parts.v1
  if (!t || !v1) return false
  if (Math.abs(nowSec - t) > toleranceSec) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${rawBody}`)))
  return safeEqual(expected, v1.toLowerCase())
}
