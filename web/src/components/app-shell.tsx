"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { PENDING_KEY } from "@/lib/duo";
import { useAuth } from "@/lib/useAuth";
import {
  AppContext,
  isPaid,
  PLAN_LABEL,
  type AppCtx,
  type DocSummary,
  type Profile,
  type Quota,
} from "./app-context";
import {
  IconBook,
  IconCalendar,
  IconCard,
  IconChat,
  IconClose,
  IconFile,
  IconHome,
  IconLogout,
  IconMenu,
  IconTimer,
  IconUser,
  IconSpark,
  IconUsers,
} from "./icons";
import { formatDate, useT } from "@/lib/app-i18n";
import { ExpiryNotices } from "./expiry-notices";
import { PomodoroProvider } from "./pomodoro-provider";
import { MiniPomodoro } from "./mini-pomodoro";

type NavItem = {
  href: string;
  label: string;
  icon: (p: { className?: string }) => React.JSX.Element;
  exact?: boolean;
};

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Réviser",
    items: [
      { href: "/app", label: "Accueil", icon: IconHome, exact: true },
      { href: "/app/chat", label: "Discussion", icon: IconChat },
      { href: "/app/cours", label: "Mes cours", icon: IconBook },
      { href: "/app/duo", label: "Révision à deux", icon: IconUsers },
    ],
  },
  {
    title: "Organiser",
    items: [
      { href: "/app/planning", label: "Planning", icon: IconCalendar },
      { href: "/app/pomodoro", label: "Pomodoro", icon: IconTimer },
    ],
  },
  {
    title: "Mon compte",
    items: [
      { href: "/app/abonnement", label: "Abonnement", icon: IconCard },
      { href: "/app/idees", label: "Écrire à l'équipe", icon: IconSpark },
      { href: "/app/compte", label: "Profil", icon: IconUser },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.items);

function titleFor(pathname: string): string {
  if (pathname.startsWith("/app/cours/")) return "Cours";
  if (pathname.startsWith("/app/erreurs")) return "Mes erreurs";
  const hit = ALL.filter((n) => (n.exact ? pathname === n.href : pathname.startsWith(n.href))).pop();
  return hit?.label ?? "Axone";
}

function Wordmark() {
  return (
    <span className="display text-2xl text-white">axone<span className="text-eosin">.</span>
    </span>
  );
}

const dateLongue = () => {
  const d = formatDate(new Date(), { weekday: "long", day: "numeric", month: "long" });
  return d.charAt(0).toUpperCase() + d.slice(1);
};

/** Le panneau « Bienvenue » (premier passage) n'a ni barre latérale ni en-tête. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/app/bienvenue")) return <>{children}</>;
  return <Guarded>{children}</Guarded>;
}

function Guarded({ children }: { children: React.ReactNode }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const { user, ready } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [quotaKey, setQuotaKey] = useState<string | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [docs, setDocs] = useState<DocSummary[] | null>(null);
  const [standardPrice, setStandardPrice] = useState<number | null>(null);

  const uid = user?.id;

  const refreshProfile = useCallback(async () => {
    const sb = getSupabase();
    if (!sb || !uid) return;
    const { data } = await sb.from("students").select("*").eq("user_id", uid).maybeSingle();
    if (!data?.name) {
      router.replace("/app/bienvenue");
      return;
    }
    setProfile(data as Profile);
  }, [uid, router]);

  const refreshQuota = useCallback(async () => {
    const sb = getSupabase();
    if (!sb || !uid) return;
    // Le plan du compte vit sous l'identifiant d'appareil relié (voir device_links), sinon sous l'uid.
    const { data: key } = await sb.rpc("account_quota_key");
    const k = (key as string | null) ?? uid;
    setQuotaKey(k);
    const { data: q } = await sb.rpc("get_quota_status", { p_user_id: k });
    if (q && typeof q.daily_limit === "number") setQuota(q as Quota);
  }, [uid]);

  const refreshDocs = useCallback(async () => {
    const sb = getSupabase();
    if (!sb || !uid) return;
    const { data } = await sb
      .from("documents")
      .select("id,name,subject_name,pages,updated_at")
      .order("updated_at", { ascending: false });
    setDocs((data ?? []) as DocSummary[]);
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const t = window.setTimeout(() => {
      refreshProfile();
      refreshQuota();
      refreshDocs();
      getSupabase()
        ?.from("plans")
        .select("price_monthly")
        .eq("plan", "standard")
        .maybeSingle()
        .then(({ data }) => {
          if (data && typeof data.price_monthly === "number") setStandardPrice(data.price_monthly);
        });
    }, 0); // chargement initial, hors du rendu
    return () => window.clearTimeout(t);
  }, [uid, refreshProfile, refreshQuota, refreshDocs]);

  // Invitation à une révision à deux reçue avant la connexion : une fois le profil prêt, on va rejoindre la session.
  useEffect(() => {
    if (!profile || pathname.startsWith("/app/duo")) return;
    try {
      if (localStorage.getItem(PENDING_KEY)) router.replace("/app/duo");
    } catch {
      /* stockage indisponible */
    }
  }, [profile, pathname, router]);

  async function signOut() {
    await getSupabase()?.auth.signOut();
    router.replace("/");
  }

  if (!ready || !user || !profile || !quotaKey) {
    return (
      <main className="grid min-h-screen place-items-center px-5">
        <p className="text-muted">{t("Chargement de ton espace…")}</p>
      </main>
    );
  }

  return (
    <AppFrame
      user={user}
      profile={profile}
      quotaKey={quotaKey}
      quota={quota}
      docs={docs}
      standardPrice={standardPrice}
      pathname={pathname}
      onSignOut={signOut}
      refreshQuota={refreshQuota}
      refreshDocs={refreshDocs}
      refreshProfile={refreshProfile}
    >
      {children}
    </AppFrame>
  );
}

/** Cadre de l'espace connecté : barre latérale, en-tête, contenu. Séparé de la logique de session. */
export function AppFrame({
  user,
  profile,
  quotaKey,
  quota,
  docs,
  standardPrice,
  pathname,
  onSignOut,
  refreshQuota,
  refreshDocs,
  refreshProfile,
  children,
}: {
  user: AppCtx["user"];
  profile: Profile;
  quotaKey: string;
  quota: Quota | null;
  docs: DocSummary[] | null;
  standardPrice?: number | null;
  pathname: string;
  onSignOut: () => void;
  refreshQuota: () => Promise<void>;
  refreshDocs: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  children: React.ReactNode;
}) {
  const t = useT();
  const [drawer, setDrawer] = useState(false);

  const used = quota?.daily_used ?? 0;
  const limit = quota?.daily_limit ?? 0;
  const left = quota ? Math.max(limit - used, 0) : null;
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const lowQuota = left !== null && left <= 1;
  const paid = isPaid(quota?.plan);
  const planName = t(PLAN_LABEL[quota?.plan ?? "freemium"] ?? "Gratuit");
  const initial = profile.name.trim().charAt(0).toUpperCase() || "?";
  const recent = (docs ?? []).slice(0, 3);
  const expires = quota?.expires_at
    ? formatDate(new Date(quota.expires_at), { day: "numeric", month: "long" })
    : null;

  const sidebar = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-6">
        <Link href="/app" onClick={onNavigate} aria-label={t("Axone, accueil")}>
          <Wordmark />
        </Link>
      </div>

      <nav className="mt-2 flex-1 overflow-hidden px-3" aria-label={t("Navigation principale")}>
        <div className="space-y-0.5">
          {ALL.filter((n) => n.href !== "/app/abonnement").map((n) => {
            const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
            const Icon = n.icon;
            const badge =
              n.href === "/app/cours" && docs
                ? String(docs.length)
                : n.href === "/app/abonnement"
                  ? planName
                  : null;
            return (
              <div key={n.href}>
                <Link
                  href={n.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] font-medium transition-colors ${
                    active ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {active && <span aria-hidden className="absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-eosin" />}
                  <Icon className={`h-[18px] w-[18px] ${active ? "text-eosin" : ""}`} />
                  <span className="flex-1">{t(n.label)}</span>
                  {badge && (
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                        n.href === "/app/abonnement" && paid ? "bg-eosin text-ink" : "bg-white/10 text-white/70"
                      }`}
                    >
                      {badge}
                    </span>
                  )}
                </Link>

                {/* Raccourcis vers les derniers cours : seulement si l'écran est assez haut pour ne jamais défiler */}
                {n.href === "/app/cours" && (
                  <div className="hidden lg:[@media(min-height:860px)]:block">
                    {recent.map((d) => {
                      const dActive = pathname === `/app/cours/${d.id}`;
                      return (
                        <Link
                          key={d.id}
                          href={`/app/cours/${encodeURIComponent(d.id)}`}
                          onClick={onNavigate}
                          className={`ms-5 mt-0.5 flex items-center gap-2 rounded-md py-1.5 ps-3 pe-2 text-sm transition-colors ${
                            dActive ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          <IconFile className="h-4 w-4 shrink-0" />
                          <span dir="auto" className="truncate">{d.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      <div className="space-y-3 p-3">
        {/* Quotas du jour */}
        {quota && (
          <div className="rounded-xl bg-white/6 px-4 py-3">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-white/70">{t("Questions aujourd'hui")}</span>
              <span className="font-bold text-white">
                {used}/{limit}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
              <div
                className={`h-full rounded-full ${lowQuota ? "bg-[#ffb74d]" : "bg-eosin"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {/* Plan */}
        <Link
          href="/app/abonnement"
          onClick={onNavigate}
          className="flex items-center justify-between gap-3 rounded-lg border border-white/20 px-3.5 py-2.5 text-white transition hover:border-white/50 hover:bg-white/5"
        >
          {!paid ? (
            <>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{t("Passer à Standard")}</span>
                <span className="block text-xs text-white/55">
                  {standardPrice ? t("{a} MRU par mois", { a: standardPrice.toLocaleString("fr-FR") }) : t("Plus de questions et de QCM")}
                </span>
              </span>
              <span aria-hidden className="inline-block text-white/60 rtl:-scale-x-100">→</span>
            </>
          ) : (
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{t("Plan {a}", { a: planName })}</span>
              {expires && <span className="block text-xs text-white/55">{t("Jusqu'au {a}", { a: expires })}</span>}
            </span>
          )}
        </Link>

        <a
          href="https://wa.me/22241513211?text=Bonjour%2C%20j%27ai%20besoin%20d%27aide%20sur%20Axone."
          target="_blank"
          rel="noopener noreferrer"
          className="hidden items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/60 transition hover:bg-white/5 hover:text-white [@media(min-height:720px)]:flex"
        >
          <IconChat className="h-4 w-4" />{t("Besoin d'aide ? WhatsApp")}</a>

        <div className="flex items-center gap-3 px-1 py-1">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 text-sm font-bold text-white">
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{profile.name}</p>
            <p className="truncate text-xs text-white/55">
              {[profile.promotion_name, profile.country ? t(profile.country) : null].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button
            onClick={onSignOut}
            aria-label={t("Se déconnecter")}
            title={t("Se déconnecter")}
            className="rounded-lg p-2 text-white/55 transition hover:bg-white/10 hover:text-white"
          >
            <IconLogout className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <AppContext.Provider
      value={{ user, profile, quotaKey, quota, docs, standardPrice: standardPrice ?? null, refreshQuota, refreshDocs, refreshProfile }}
    >
      <PomodoroProvider>
      <MiniPomodoro />
      <div className="min-h-screen bg-slide">
        <ExpiryNotices banner={false} />
        {/* Barre latérale (ordinateur) */}
        <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 bg-ink lg:block">{sidebar()}</aside>

        {/* Tiroir (téléphone et tablette) */}
        {drawer && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              aria-label={t("Fermer le menu")}
              className="absolute inset-0 bg-black/50"
              onClick={() => setDrawer(false)}
            />
            <aside className="absolute inset-y-0 start-0 w-72 bg-ink shadow-2xl">
              <button
                aria-label={t("Fermer le menu")}
                onClick={() => setDrawer(false)}
                className="absolute end-3 top-4 rounded-lg p-2 text-white/70 hover:bg-white/10"
              >
                <IconClose />
              </button>
              {sidebar(() => setDrawer(false))}
            </aside>
          </div>
        )}

        <div className="lg:ps-64">
          <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-8">
            <button
              onClick={() => setDrawer(true)}
              aria-label={t("Ouvrir le menu")}
              className="-ms-2 rounded-lg p-2 text-ink hover:bg-slide lg:hidden"
            >
              <IconMenu />
            </button>
            <h1 className="display text-xl text-ink">{t(titleFor(pathname))}</h1>
            <span className="hidden text-sm text-muted md:inline">{dateLongue()}</span>

            <div className="ms-auto flex items-center gap-2 sm:gap-3">
              {left !== null && (
                <Link
                  href="/app/abonnement"
                  className={`hidden items-center gap-2.5 rounded-full border px-3.5 py-1.5 text-sm sm:flex ${
                    lowQuota ? "border-[#ffb74d] bg-[#fff6e6]" : "border-line bg-white"
                  }`}
                  title={t("Questions restantes aujourd'hui")}
                >
                  <span className="relative h-1.5 w-12 overflow-hidden rounded-full bg-slide">
                    <span
                      className={`absolute inset-y-0 start-0 rounded-full ${lowQuota ? "bg-[#ffb74d]" : "bg-eosin"}`}
                      style={{ width: `${100 - pct}%` }}
                    />
                  </span>
                  <span className="font-bold text-ink">{left}</span>
                  <span className="text-muted">{t(left > 1 ? "restantes" : "restante")}</span>
                </Link>
              )}
              <Link
                href="/app/abonnement"
                className={
                  paid
                    ? "rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink"
                    : "rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-eosin hover:text-ink"
                }
              >
                {paid ? planName : t("Passer à Standard")}
              </Link>
            </div>
          </header>

          {pathname.startsWith("/app/chat") ? (
            <main>
              {children}
            </main>
          ) : (
            <main className="px-5 py-6 sm:px-10 sm:py-8 lg:px-14 xl:px-20">
              <div className="mx-auto w-full max-w-[1600px]">
                <ExpiryNotices modal={false} />
                {children}
              </div>
            </main>
          )}
        </div>
      </div>
      </PomodoroProvider>
    </AppContext.Provider>
  );
}
