import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import type { ChatSession } from '../store';

const LAST_REPORT_KEY = 'lastParentReportSentAt';
const REPORT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

export async function maybeSendParentReport(params: {
  userId:      string;
  studentName: string;
  chatHistory: ChatSession[];
}): Promise<void> {
  const { userId, studentName, chatHistory } = params;

  // 1. Vérifie si un parent phone existe
  const { data: parentPhone } = await supabase.rpc('get_parent_phone', { p_student_id: userId });
  if (!parentPhone) return;

  // 2. Vérifie si le rapport a déjà été envoyé cette semaine
  const lastSentRaw = await AsyncStorage.getItem(LAST_REPORT_KEY);
  if (lastSentRaw) {
    const lastSent = new Date(lastSentRaw).getTime();
    if (Date.now() - lastSent < REPORT_INTERVAL_MS) return;
  }

  // 3. Collecte tous les messages élève des 7 derniers jours
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date();

  const messages: Array<{ content: string; timestamp: string; subject?: string }> = [];

  for (const session of chatHistory) {
    for (const msg of session.messages) {
      if (msg.role !== 'user') continue;
      const ts = new Date(msg.timestamp);
      if (ts < weekStart) continue;
      messages.push({
        content:   msg.content,
        timestamp: ts.toISOString(),
        subject:   session.subjectName ?? undefined,
      });
    }
  }

  // Pas assez d'activité pour un rapport utile
  if (messages.length < 3) return;

  // 4. Appelle l'Edge Function
  const { error } = await supabase.functions.invoke('generate-parent-report', {
    body: {
      student_id:   userId,
      student_name: studentName,
      parent_phone: parentPhone,
      messages,
      week_start: weekStart.toISOString().slice(0, 10),
      week_end:   weekEnd.toISOString().slice(0, 10),
    },
  });

  if (!error) {
    await AsyncStorage.setItem(LAST_REPORT_KEY, new Date().toISOString());
  }
}
