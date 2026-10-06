"use client";

import { Suspense } from "react";
import { ChatApp } from "@/components/chat/chat-app";

export default function ChatPage() {
  return (
    <Suspense fallback={<p className="p-8 text-muted">Chargement de la discussion…</p>}>
      <ChatApp />
    </Suspense>
  );
}
