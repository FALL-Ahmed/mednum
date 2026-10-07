"use client";

import { SITE, type Lang } from "@/lib/site-i18n";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { Clarity } from "./clarity";
import { HeroDemo } from "@/app/hero-demo";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

/* Types minimaux du bouton officiel « Sign in with Google » (Google Identity Services). */
type GsiCredential = { credential: string };
type GsiId = {
  initialize: (cfg: { client_id: string; callback: (r: GsiCredential) => void; nonce?: string; ux_mode?: string }) => void;
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GsiId } };
  }
}

const toHex = (buf: ArrayBuffer | Uint8Array) =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.5-4.7 7.2l7.5 5.8c4.4-4.1 7-10.1 7-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.6a14.5 14.5 0 0 1 0-9.2l-7.9-6.2a24 24 0 0 0 0 21.6l7.9-6.2z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/** Faux côté serveur, vrai une fois la page affichée dans le navigateur (évite les écarts serveur/navigateur). */
const useHydrated = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

export function ConnexionView({ lang = "fr" }: { lang?: Lang }) {
  const t = SITE[lang].login;
  const home = lang === "ar" ? "/ar" : "/";
  const router = useRouter();
  const hydrated = useHydrated();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gsiReady, setGsiReady] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);
  // Tant qu'on ne sait pas si l'étudiant est déjà connecté, on n'affiche pas le formulaire (évite un éclair de la page).
  const [checking, setChecking] = useState(true);

  // Déjà connecté : direct vers l'espace.
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      Promise.resolve().then(() => setChecking(false));
      return;
    }
    sb.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/app");
      else setChecking(false);
    });
  }, [router]);

  // Bouton officiel Google : la fenêtre affiche le nom de l'application, pas l'adresse du serveur d'authentification.
  const setupGoogle = useCallback(async () => {
    const sb = getSupabase();
    const gsi = window.google?.accounts.id;
    if (!sb || !gsi || !GOOGLE_CLIENT_ID || !buttonRef.current) return;

    const raw = toHex(crypto.getRandomValues(new Uint8Array(16)));
    const hashed = toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)));

    gsi.initialize({
      client_id: GOOGLE_CLIENT_ID,
      nonce: hashed,
      ux_mode: "popup",
      callback: async ({ credential }) => {
        setError(null);
        setBusy(true);
        const { error: err } = await sb.auth.signInWithIdToken({ provider: "google", token: credential, nonce: raw });
        if (err) {
          setError(t.failed);
          setBusy(false);
          return;
        }
        router.replace("/app");
      },
    });
    gsi.renderButton(buttonRef.current, {
      theme: "outline",
      size: "large",
      shape: "pill",
      text: "continue_with",
      locale: t.googleLocale,
      // Le bouton de Google a une largeur fixe (200 à 400 px) : on l'ajuste à la place disponible pour qu'il ne déborde pas sur petit écran
      width: Math.max(200, Math.min(360, Math.floor(buttonRef.current.parentElement?.clientWidth ?? 360))),
    });
    setGsiReady(true);
  }, [router, t]);

  useEffect(() => {
    if (!checking && window.google?.accounts.id) setupGoogle();
  }, [setupGoogle, checking]);

  // Repli si l'identifiant Google n'est pas configuré : connexion par redirection.
  async function signInRedirect() {
    const sb = getSupabase();
    if (!sb) {
      setError(t.notConfigured);
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/app` },
    });
    if (err) {
      setError(t.failed);
      setBusy(false);
    }
  }

  if (checking) return <main className="min-h-screen" aria-busy="true" />;

  return (
    <main className="grid min-h-screen md:grid-cols-2">
      <Clarity />
      <section className="flex flex-col justify-center px-5 py-14 sm:px-12 md:px-10 lg:px-16 xl:px-24">
      <div className="w-full max-w-md">
      {GOOGLE_CLIENT_ID && (
        <Script src={`https://accounts.google.com/gsi/client?hl=${t.googleLocale}`} strategy="afterInteractive" onLoad={setupGoogle} />
      )}

      <Link href={home} className="display text-2xl text-ink">
        axone<span className="text-eosin">.</span>
      </Link>
      <h1 className="display mt-10 text-4xl leading-[1] text-ink sm:text-5xl">{t.title}</h1>
      <p className="mt-4 text-lg text-muted">{t.text}</p>

      <div className="mt-10 min-h-[56px]">
        {!hydrated ? null : GOOGLE_CLIENT_ID ? (
          <>
            <div ref={buttonRef} className="flex min-h-[44px] justify-start" />
            {!gsiReady && <p className="text-sm text-muted">{t.loadingButton}</p>}
          </>
        ) : (
          <button
            onClick={signInRedirect}
            disabled={busy}
            className="flex w-full items-center justify-center gap-3 rounded-full border border-line bg-white px-6 py-4 text-base font-semibold text-ink transition hover:border-ink disabled:opacity-60"
          >
            <GoogleG />
            {busy ? t.redirecting : t.google}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-2xl bg-[#fff1f0] px-4 py-3 text-sm text-[#a3271c]">
          {error}
        </p>
      )}

      <p className="mt-4 text-xs leading-relaxed text-muted">
        {lang === "ar" ? (
          <>
            بمتابعتك فإنك توافق على <Link href="/ar/conditions" className="underline underline-offset-2 hover:text-ink">شروط الاستخدام</Link> و
            <Link href="/ar/confidentialite" className="underline underline-offset-2 hover:text-ink">سياسة الخصوصية</Link>.
          </>
        ) : (
          <>
            En continuant, tu acceptes les <Link href="/conditions" className="underline underline-offset-2 hover:text-ink">conditions d&apos;utilisation</Link> et la{" "}
            <Link href="/confidentialite" className="underline underline-offset-2 hover:text-ink">politique de confidentialité</Link>.
          </>
        )}
      </p>

      <ul className="mt-10 space-y-3 border-t border-line pt-8 text-[15px] text-ink/80">
        {t.bullets.map((b) => (
          <li key={b} className="flex gap-3">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-eosin" />
            {b}
          </li>
        ))}
      </ul>

      <p className="mt-8 text-sm text-muted">
        {t.trouble}{" "}
        <a
          href="https://wa.me/22241513211"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-ink underline decoration-eosin decoration-2 underline-offset-4"
        >
          WhatsApp
        </a>
        .
      </p>
      </div>
      </section>

      {/* Panneau visuel (ordinateur) : Dr. Ahmed et un exemple de question */}
      <aside className="relative hidden overflow-hidden bg-ink md:block" aria-hidden>
        <Image
          src="/dr-ahmed-v2.webp"
          alt=""
          fill
          priority
          sizes="50vw"
          className="object-cover"
          style={{ objectPosition: "50% 12%" }}
        />
        <div className="absolute inset-x-10 bottom-10 xl:inset-x-16 xl:bottom-16">
          <p className="label mb-3 w-fit rounded-full bg-white/90 px-3 py-1.5 text-ink">
            {SITE[lang].hero.chip}
          </p>
          <HeroDemo lang={lang} />
        </div>
      </aside>
    </main>
  );
}
