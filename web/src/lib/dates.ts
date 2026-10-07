import { getAppLang, translate } from "./app-i18n";
const pad = (n: number) => String(n).padStart(2, "0");

/** Date locale au format AAAA-MM-JJ. */
export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const todayISO = () => toISO(new Date());

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

const loc = () => (getAppLang() === "ar" ? "ar-u-nu-latn" : "fr-FR");

/** Nom du mois (0 = janvier) et du jour de la semaine (0 = dimanche), dans la langue choisie. */
export const monthName = (m: number) => new Date(2024, m, 1).toLocaleDateString(loc(), { month: "long" });
export const weekdayName = (dow: number) => new Date(2024, 0, 7 + dow).toLocaleDateString(loc(), { weekday: "long" });
export const weekdayShort = (dow: number) =>
  getAppLang() === "ar"
    ? new Date(2024, 0, 7 + dow).toLocaleDateString(loc(), { weekday: "short" })
    : weekdayName(dow).slice(0, 3);

export const jourCourt = (iso: string) => weekdayShort(fromISO(iso).getDay());

export function labelJour(iso: string): string {
  const today = todayISO();
  if (iso === today) return translate(getAppLang(), "Aujourd'hui");
  if (iso === addDays(today, 1)) return translate(getAppLang(), "Demain");
  const d = fromISO(iso);
  return `${weekdayName(d.getDay())} ${d.getDate()} ${monthName(d.getMonth())}`;
}
