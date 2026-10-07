import { supabase } from './supabase'

/*
  Notifications push de l'administration : un message sur le téléphone / l'ordinateur à chaque abonnement à valider.
  La clé publique ci-dessous n'est pas un secret (la clé privée est dans les secrets de l'Edge Function notify-admin).
*/
const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || 'BDGe1YvBTOB6Z9i98GJu-qKNUVAoyLDkwuSsNVn35qZsQes4jIyJm1O6JZwAdI34ZtNjCHfnG3JWGItEpS_7z9o'

const b64ToBytes = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

export type PushState = 'unsupported' | 'denied' | 'off' | 'on'

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** État actuel : non géré par ce navigateur, refusé, désactivé, ou activé sur cet appareil. */
export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return sub && Notification.permission === 'granted' ? 'on' : 'off'
  } catch {
    return 'off'
  }
}

/** Demande l'autorisation, abonne cet appareil et l'enregistre côté serveur. Renvoie un message d'erreur ou null. */
export async function enablePush(): Promise<string | null> {
  if (!pushSupported()) return "Ce navigateur ne gère pas les notifications. Sur iPhone, installe d'abord l'application sur l'écran d'accueil."
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return "Notifications refusées : autorise-les dans les réglages du navigateur pour ce site."
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) }))
    const j = sub.toJSON()
    const { data: u } = await supabase.auth.getUser()
    const { error } = await supabase.from('admin_push_subscriptions').upsert({
      endpoint: sub.endpoint, user_id: u.user?.id, p256dh: j.keys?.p256dh, auth: j.keys?.auth, user_agent: navigator.userAgent.slice(0, 200),
    })
    if (error) return /admin_push_subscriptions/.test(error.message) ? "La table des notifications n'existe pas encore : exécute le fichier 20261015000000_admin_push.sql dans Supabase." : error.message
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Activation impossible'
  }
}

/** Coupe les notifications sur cet appareil. */
export async function disablePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await supabase.from('admin_push_subscriptions').delete().eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
    }
  } catch { /* rien à couper */ }
}

/** Envoie une notification de test à tous les appareils de l'admin. */
export async function sendTestPush(): Promise<string | null> {
  const { error } = await supabase.functions.invoke('notify-admin', { body: { test: true } })
  return error ? error.message : null
}
