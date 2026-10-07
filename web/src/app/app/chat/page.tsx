"use client";

import { Suspense } from "react";
import { ChatApp } from "@/components/chat/chat-app";
import { useT } from "@/lib/app-i18n";

export default function ChatPage() {
  const t = useT();
  return (
    <Suspense fallback={<p className="p-8 text-muted">{t("Chargement de la discussion…")}</p>}>
      <ChatApp />
    </Suspense>
  );
}
