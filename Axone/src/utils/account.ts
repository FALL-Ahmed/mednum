import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';

// Nécessaire pour terminer proprement la session de navigateur (Android/web).
WebBrowser.maybeCompleteAuthSession();

export type AccountInfo = { linked: boolean; email: string | null };

export type AuthResult =
  | { ok: true }
  | { ok: false; reason: 'cancelled' | 'already_linked' | 'error' };

export async function getAccountInfo(): Promise<AccountInfo> {
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  if (!u) return { linked: false, email: null };
  return { linked: !u.is_anonymous, email: u.email ?? null };
}

function param(url: string, key: string): string | null {
  const m = url.match(new RegExp('[?#&]' + key + '=([^&#]*)'));
  return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
}

/** Termine la connexion à partir de l'URL de retour (flux PKCE : ?code=, sinon jetons dans le fragment). */
async function finishOAuth(url: string): Promise<'ok' | 'already_linked' | 'error'> {
  const errDesc = param(url, 'error_description') || param(url, 'error');
  if (errDesc) {
    return /already|identity_already_exists|linked/i.test(errDesc) ? 'already_linked' : 'error';
  }
  const code = param(url, 'code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error ? 'error' : 'ok';
  }
  const access = param(url, 'access_token');
  const refresh = param(url, 'refresh_token');
  if (access && refresh) {
    const { error } = await supabase.auth.setSession({ access_token: access, refresh_token: refresh });
    return error ? 'error' : 'ok';
  }
  return 'error';
}

/**
 * Relie le compte courant (même anonyme) à l'identifiant d'appareil sous lequel vivent quota et abonnement,
 * ou adopte l'identifiant déjà lié au compte. Sans effet si la fonction n'est pas encore déployée côté serveur.
 */
export async function linkCurrentDevice(): Promise<void> {
  try {
    const store = useAppStore.getState();
    const { data } = await supabase.rpc('link_device', { p_device_id: store.deviceId });
    const key = data && typeof data.quota_key === 'string' ? data.quota_key : null;
    if (key && key !== store.deviceId) useAppStore.setState({ deviceId: key });
  } catch {
    /* fonction pas encore déployée : on garde l'identifiant actuel */
  }
}

/**
 * Après une connexion : relie ce compte à l'identifiant d'appareil sous lequel vivent quota et abonnement
 * (ou adopte l'identifiant déjà lié au compte), puis resynchronise le profil et les cours.
 */
async function afterLogin(): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return;

  const store = useAppStore.getState();
  store.setUserId(uid);

  await linkCurrentDevice();

  // Profil de l'étudiant enregistré sur le compte (utile sur un nouveau téléphone).
  const { data: row } = await supabase
    .from('students')
    .select('name,promotion_id,promotion_name,school_name')
    .eq('user_id', uid)
    .maybeSingle();
  if (row?.name) {
    useAppStore.getState().setStudentInfo(
      row.name,
      row.promotion_id ?? '',
      row.promotion_name ?? '',
      row.school_name ?? '',
    );
  }

  useAppStore.getState().syncQuota();
  useAppStore.getState().hydrateCoursesFromSupabase();
}

async function runOAuth(mode: 'link' | 'signin'): Promise<AuthResult> {
  const redirectTo = Linking.createURL('auth-callback');
  const opts = { redirectTo, skipBrowserRedirect: true };
  const { data, error } =
    mode === 'link'
      ? await supabase.auth.linkIdentity({ provider: 'google', options: opts })
      : await supabase.auth.signInWithOAuth({ provider: 'google', options: opts });
  if (error || !data?.url) {
    return { ok: false, reason: /already|identity_already_exists/i.test(error?.message ?? '') ? 'already_linked' : 'error' };
  }

  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return { ok: false, reason: 'cancelled' };

  const done = await finishOAuth(res.url);
  if (done !== 'ok') return { ok: false, reason: done };

  await afterLogin();
  return { ok: true };
}

/** Compte anonyme -> compte Google permanent. L'identifiant utilisateur (et donc les données) ne change pas. */
export const linkGoogleAccount = () => runOAuth('link');

/** Se connecter à un compte Axone existant (autre téléphone, réinstallation). */
export const signInGoogleAccount = () => runOAuth('signin');
