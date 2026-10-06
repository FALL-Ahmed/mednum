import { getSupabase } from "./supabase";

export type Conversation = {
  id: string;
  title: string;
  course_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Attachment = { path: string; name: string; type: string };

export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments: Attachment[];
  source: string | null;
  created_at: string;
};

const BUCKET = "chat-attachments";

/** Renvoie null si l'historique n'est pas disponible (tables absentes ou erreur), pour que le chat continue sans enregistrer. */
export async function listConversations(): Promise<Conversation[] | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("chat_conversations")
    .select("id,title,course_id,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) return null;
  return (data ?? []) as Conversation[];
}

export async function createConversation(
  userId: string,
  title: string,
  courseId: string | null,
): Promise<Conversation | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("chat_conversations")
    .insert({ user_id: userId, title, course_id: courseId })
    .select("id,title,course_id,created_at,updated_at")
    .single();
  return error ? null : (data as Conversation);
}

export async function renameConversation(id: string, title: string): Promise<void> {
  await getSupabase()?.from("chat_conversations").update({ title }).eq("id", id);
}

export async function setConversationCourse(id: string, courseId: string | null): Promise<void> {
  await getSupabase()?.from("chat_conversations").update({ course_id: courseId }).eq("id", id);
}

export async function touchConversation(id: string): Promise<void> {
  await getSupabase()
    ?.from("chat_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);
}

export async function deleteConversation(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  // Supprime d'abord les images jointes (le reste part avec la conversation).
  const { data } = await sb.from("chat_messages").select("attachments").eq("conversation_id", id);
  const paths = ((data ?? []) as { attachments: Attachment[] }[]).flatMap((m) => (m.attachments ?? []).map((a) => a.path));
  if (paths.length > 0) await sb.storage.from(BUCKET).remove(paths);
  await sb.from("chat_conversations").delete().eq("id", id);
}

export async function loadMessages(conversationId: string): Promise<StoredMessage[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("chat_messages")
    .select("id,role,content,attachments,source,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at");
  return ((data ?? []) as StoredMessage[]).map((m) => ({ ...m, attachments: m.attachments ?? [] }));
}

export async function addMessage(
  userId: string,
  conversationId: string,
  m: { role: "user" | "assistant"; content: string; attachments?: Attachment[]; source?: string | null },
): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("chat_messages")
    .insert({
      user_id: userId,
      conversation_id: conversationId,
      role: m.role,
      content: m.content,
      attachments: m.attachments ?? [],
      source: m.source ?? null,
    })
    .select("id")
    .single();
  return error ? null : (data.id as string);
}

export async function deleteMessage(id: string): Promise<void> {
  await getSupabase()?.from("chat_messages").delete().eq("id", id);
}

/** Enregistre une image jointe dans le dossier privé de l'étudiant. */
export async function uploadAttachment(
  userId: string,
  conversationId: string,
  blob: Blob,
  name: string,
): Promise<Attachment | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60) || "image.jpg";
  const path = `${userId}/${conversationId}/${crypto.randomUUID()}-${safe}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || "image/jpeg" });
  return error ? null : { path, name, type: blob.type || "image/jpeg" };
}

/** Liens temporaires (1 h) pour afficher les images d'une conversation rechargée. */
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const sb = getSupabase();
  if (!sb || paths.length === 0) return {};
  const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths, 3600);
  const map: Record<string, string> = {};
  for (const r of data ?? []) if (r.path && r.signedUrl) map[r.path] = r.signedUrl;
  return map;
}
