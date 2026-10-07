"use client";

import type { DuoRoomPayload, DuoState } from "@/lib/duo";
import { DuoChat } from "./duo-chat";
import { DuoShell } from "./duo-shell";
import { useT } from "@/lib/app-i18n";

type Props = {
  st: DuoState;
  refresh: () => Promise<void>;
  expired: boolean;
  error: string | null;
  setError: (e: string | null) => void;
};

/** Salle d'étude à deux : un cours partagé, et Dr. Ahmed qui répond devant les deux. */
export function DuoRoom({ st, refresh, expired, error, setError }: Props) {
  const t = useT();
  const room = st.payload as DuoRoomPayload;
  return (
    <DuoShell st={st} total={0} expired={expired} error={error}>
      <section className="mt-5 rounded-2xl border border-line bg-white p-5">
        <p className="label text-muted">{t("Cours partagé")}</p>
        <p dir="auto" className="display mt-1 text-2xl text-ink">
          {room.name}
        </p>
        <p className="mt-2 text-sm text-muted">{t("Dr. Ahmed répond d'après ce cours, puis va plus loin si besoin. Seul ce cours est partagé dans la salle, pas le reste de tes documents.")}</p>
      </section>
      <DuoChat st={st} refresh={refresh} setError={setError} expired={expired} ai />
    </DuoShell>
  );
}
