import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NiveauType } from '../utils/rag';
import { supabase } from '../lib/supabase';

function generateDeviceId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export type Message = {
  id: string;
  role: 'user' | 'assistant' | 'refusal' | 'error';
  content: string;
  sources?: string[];
  images?: string[];
  userImageUri?: string;
  suggestions?: string[];
  timestamp: Date;
  feedback?: 'up' | 'down' | null;
  hallucination?: boolean;
  pdfName?: string;
  apiContent?: string;
};

export type CourseChunk = { title: string; content: string; index: number; images?: string[]; startPage?: number; endPage?: number };

export type Course = {
  id: string;
  name: string;
  subjectName: string;
  fileName: string;
  fileUri: string;
  pages: number;
  uploadedAt: Date;
  active: boolean;
  content: string;
  chunks: CourseChunk[];
  summary?: string;
  language?: string;
};

export type ChatSession = {
  id: string;
  courseId: string;
  courseName: string;
  subjectName: string;
  messages: Message[];
  createdAt: Date;
};

// Sauvegarde/actualise la session en cours dans l'historique, indexée sur le
// premier message (id stable) pour éviter les doublons quand on sauvegarde plusieurs fois.
function upsertSession(
  currentMessages: Message[],
  activeCourse: Course | null,
  chatHistory: ChatSession[]
): ChatSession[] {
  if (currentMessages.length === 0) return chatHistory;
  const sessionId = currentMessages[0].id;
  const existing = chatHistory.find((s) => s.id === sessionId);
  const session: ChatSession = {
    id: sessionId,
    courseId: activeCourse?.id ?? '',
    courseName: activeCourse?.name ?? 'Discussion libre',
    subjectName: activeCourse?.subjectName ?? '',
    messages: [...currentMessages],
    createdAt: existing?.createdAt ?? new Date(),
  };
  const rest = chatHistory.filter((s) => s.id !== sessionId);
  return [session, ...rest].slice(0, 50);
}

type AppStore = {
  // UUID stable généré au premier lancement, envoyé à la Edge Function pour le quota
  deviceId: string;
  // ID Supabase Auth (anonymous) — unique par appareil, persisté
  userId: string;
  setUserId: (id: string) => void;

  darkMode: boolean;
  toggleDarkMode: () => void;

  uiLanguage: 'fr' | 'ar';
  setUiLanguage: (lang: 'fr' | 'ar') => void;

  // Élève
  studentName: string;
  studentClassId: string;
  studentClassName: string;
  studentSchoolName: string;
  setStudentInfo: (name: string, classId: string, className: string, schoolName?: string) => void;
  resetStudent: () => void;

  courses: Course[];
  activeCourse: Course | null;
  addCourse: (course: Course) => void;
  removeCourse: (id: string) => void;
  hydrateCoursesFromSupabase: () => Promise<void>;
  setActiveCourse: (id: string) => void;
  setCourseSummary: (id: string, summary: string) => void;
  updateCourseChunks: (id: string, chunks: CourseChunk[]) => void;
  updateCourseLanguage: (id: string, language: string) => void;

  currentMessages: Message[];
  chatHistory: ChatSession[];
  isLoading: boolean;
  addMessage: (msg: Message) => void;
  setLoading: (v: boolean) => void;
  clearChat: () => void;
  clearHistory: () => void;
  saveChatSession: () => void;
  resumeSession: (session: ChatSession) => void;
  setFeedback: (msgId: string, feedback: 'up' | 'down') => void;

  niveau: NiveauType;
  setNiveau: (n: NiveauType) => void;

  // Adaptive difficulty (IRT-inspired 2-Up/1-Down)
  difficultyScore: number;   // 0–10, démarre à 4 (moyen bas)
  updateDifficulty: (event: 'success' | 'struggle' | 'frustration') => void;
  setDifficultyScore: (score: number) => void;

  // Suivi des concepts demandés par l'élève (courseId → concept → { count, lastAsked })
  conceptHistory: Record<string, Record<string, { count: number; lastAsked: string }>>;
  trackConcept: (courseId: string, concept: string) => void;
  getWeakConcepts: (courseId: string, n?: number) => string[];

  // Fiches générées en cache (courseId_chunkIndex → texte)
  fiches: Record<string, string>;
  ficheContentHash: Record<string, string>; // hash du contenu au moment de la génération
  saveFiche: (courseId: string, chunkIndex: number, text: string, contentHash: string) => void;

  // Skill Tree — Mastery par chapitre (courseId → chunkIndex → score 0–100)
  chapterMastery: Record<string, Record<number, number>>;
  updateChapterMastery: (courseId: string, chapterIndex: number, delta: number) => void;

  // Chapitre actif par cours (courseId → chunkIndex)
  activeChapterIndex: Record<string, number>;
  setActiveChapterIndex: (courseId: string, index: number) => void;

  // Gamification — XP + Streak
  streakCurrent: number;
  streakBest: number;
  streakLastDate: string;
  xpTotal: number;
  xpToday: number;
  xpTodayDate: string;
  xpThisWeek: number;
  xpLastWeek: number;
  xpWeekStartDate: string;
  dailyGoal: number;
  setDailyGoal: (goal: number) => void;
  addXP: (amount: number) => void;

  onboardingDone: boolean;
  completeOnboarding: () => void;
  replayOnboarding: () => void;

  // Quota journalier
  quotaUsed: number;
  quotaLimit: number;
  quotaDate: string;
  plan: string;
  trialEndsAt: string | null;
  syncQuota: () => Promise<void>;
  decrementQuota: () => void;
};

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      deviceId: generateDeviceId(),
      userId: '',
      setUserId: (id) => set({ userId: id }),

      darkMode: false,
      toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),

      uiLanguage: 'fr',
      setUiLanguage: (lang) => set({ uiLanguage: lang }),

      studentName: '',
      studentClassId: '',
      studentClassName: '',
      studentSchoolName: '',
      setStudentInfo: (name, classId, className, schoolName) =>
        set(s => ({
          studentName: name,
          studentClassId: classId,
          studentClassName: className,
          studentSchoolName: schoolName ?? s.studentSchoolName,
        })),
      resetStudent: () =>
        set({ studentName: '', studentClassId: '', studentClassName: '', studentSchoolName: '', activeCourse: null, currentMessages: [] }),

      courses: [],
      activeCourse: null,
      addCourse: (course) => {
        set((s) => {
          const updated = s.courses.map((c) => ({ ...c, active: false }));
          return { courses: [...updated, { ...course, active: true }], activeCourse: course };
        });
        // Sync serveur best-effort — ne bloque pas l'UI, texte extrait uniquement (pas le PDF)
        const uid = get().userId;
        if (uid) {
          supabase.from('documents').upsert({
            id: course.id,
            user_id: uid,
            name: course.name,
            subject_name: course.subjectName,
            file_name: course.fileName,
            pages: course.pages,
            content: course.content,
            chunks: course.chunks,
            language: course.language ?? null,
            updated_at: new Date().toISOString(),
          }).then(({ error }) => { if (error) console.log('[documents] upsert error:', error.message); });
        }
      },
      setCourseSummary: (id, summary) =>
        set((s) => ({
          courses: s.courses.map((c) => c.id === id ? { ...c, summary } : c),
          activeCourse: s.activeCourse?.id === id ? { ...s.activeCourse, summary } : s.activeCourse,
        })),
      updateCourseChunks: (id, chunks) =>
        set((s) => ({
          courses: s.courses.map((c) => c.id === id ? { ...c, chunks } : c),
          activeCourse: s.activeCourse?.id === id ? { ...s.activeCourse, chunks } : s.activeCourse,
        })),
      updateCourseLanguage: (id, language) =>
        set((s) => ({
          courses: s.courses.map((c) => c.id === id ? { ...c, language } : c),
          activeCourse: s.activeCourse?.id === id ? { ...s.activeCourse, language } : s.activeCourse,
        })),
      removeCourse: (id) => {
        set((s) => {
          const filtered = s.courses.filter((c) => c.id !== id);
          const activeCourse = filtered.find((c) => c.active) || filtered[0] || null;
          return { courses: filtered, activeCourse };
        });
        supabase.from('documents').delete().eq('id', id)
          .then(({ error }) => { if (error) console.log('[documents] delete error:', error.message); });
      },
      hydrateCoursesFromSupabase: async () => {
        const uid = get().userId;
        if (!uid || get().courses.length > 0) return; // ne remplace pas des cours déjà présents localement
        const { data, error } = await supabase.from('documents').select('*').eq('user_id', uid);
        if (error) { console.log('[documents] hydrate error:', error.message); return; }
        if (!data || data.length === 0) return;
        const courses: Course[] = data.map((d: any, i: number) => ({
          id: d.id,
          name: d.name,
          subjectName: d.subject_name ?? '',
          fileName: d.file_name ?? '',
          fileUri: '',
          pages: d.pages ?? 1,
          uploadedAt: new Date(d.created_at),
          active: i === data.length - 1,
          content: d.content,
          chunks: d.chunks ?? [],
          language: d.language ?? undefined,
        }));
        const fiches: Record<string, string> = {};
        const ficheContentHash: Record<string, string> = {};
        for (const d of data) {
          if (d.fiche) {
            fiches[`${d.id}_0`] = d.fiche;
            if (d.fiche_hash) ficheContentHash[`${d.id}_0`] = d.fiche_hash;
          }
        }
        set((s) => ({
          courses,
          activeCourse: courses[courses.length - 1] ?? null,
          fiches: { ...fiches, ...s.fiches },
          ficheContentHash: { ...ficheContentHash, ...s.ficheContentHash },
        }));
        console.log('[documents] hydraté depuis Supabase —', courses.length, 'document(s)');
      },
      setActiveCourse: (id) =>
        set((s) => {
          if (s.activeCourse?.id === id) return {};
          const courses = s.courses.map((c) => ({ ...c, active: c.id === id }));
          const activeCourse = courses.find((c) => c.id === id) || null;
          // Auto-save current session then clear messages
          const chatHistory = upsertSession(s.currentMessages, s.activeCourse, s.chatHistory);
          return { courses, activeCourse, currentMessages: [], chatHistory };
        }),

      currentMessages: [],
      chatHistory: [],
      isLoading: false,
      addMessage: (msg) => set((s) => ({ currentMessages: [...s.currentMessages, msg] })),
      setLoading: (v) => set({ isLoading: v }),
      clearChat: () => set({ currentMessages: [] }),
      clearHistory: () => set({ chatHistory: [], currentMessages: [] }),
      resumeSession: (session) => {
        const { courses } = get();
        const course = courses.find((c) => c.id === session.courseId) || null;
        set({
          currentMessages: [...session.messages],
          activeCourse: course ?? get().activeCourse,
        });
      },
      saveChatSession: () => {
        const { currentMessages, activeCourse, chatHistory } = get();
        set({ chatHistory: upsertSession(currentMessages, activeCourse, chatHistory) });
      },
      setFeedback: (msgId, feedback) =>
        set((s) => ({
          currentMessages: s.currentMessages.map((m) =>
            m.id === msgId ? { ...m, feedback } : m
          ),
        })),

      niveau: 'moyen' as NiveauType,
      setNiveau: (n) => set({ niveau: n }),

      difficultyScore: 4,
      setDifficultyScore: (score) => set({ difficultyScore: Math.min(10, Math.max(0, score)) }),
      updateDifficulty: (event) => set(s => {
        let score = s.difficultyScore;
        if (event === 'frustration') score = Math.max(0, score - 3);
        else if (event === 'struggle')  score = Math.max(0, score - 1);
        else if (event === 'success')   score = Math.min(10, score + 1);
        return { difficultyScore: score };
      }),

      conceptHistory: {},
      trackConcept: (courseId, concept) => {
        if (!concept || concept.trim().length < 4) return;
        set((s) => {
          const courseMap = { ...(s.conceptHistory[courseId] || {}) };
          const prev = courseMap[concept] || { count: 0, lastAsked: '' };
          courseMap[concept] = { count: prev.count + 1, lastAsked: new Date().toISOString() };
          return { conceptHistory: { ...s.conceptHistory, [courseId]: courseMap } };
        });
      },
      getWeakConcepts: (courseId, n = 3) => {
        const map = get().conceptHistory[courseId] || {};
        return Object.entries(map)
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, n)
          .map(([concept]) => concept);
      },

      fiches: {},
      ficheContentHash: {},
      saveFiche: (courseId, chunkIndex, text, contentHash) =>
        set(s => {
          const key = `${courseId}_${chunkIndex}`;
          return {
            fiches: { ...s.fiches, [key]: text },
            ficheContentHash: { ...s.ficheContentHash, [key]: contentHash },
          };
        }),

      // Skill Tree
      chapterMastery: {},
      updateChapterMastery: (courseId, chapterIndex, delta) =>
        set((s) => {
          const course = { ...(s.chapterMastery[courseId] || {}) };
          const current = course[chapterIndex] ?? 0;
          course[chapterIndex] = Math.min(100, Math.max(0, current + delta));
          return { chapterMastery: { ...s.chapterMastery, [courseId]: course } };
        }),

      activeChapterIndex: {},
      setActiveChapterIndex: (courseId, index) =>
        set((s) => ({ activeChapterIndex: { ...s.activeChapterIndex, [courseId]: index } })),

      // Gamification
      streakCurrent: 0, streakBest: 0, streakLastDate: '',
      xpTotal: 0, xpToday: 0, xpTodayDate: '', xpThisWeek: 0, xpLastWeek: 0, xpWeekStartDate: '', dailyGoal: 50,
      setDailyGoal: (goal) => set({ dailyGoal: goal }),

      addXP: (amount) => {
        set((s) => {
          const today = new Date().toISOString().split('T')[0];
          const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
          const weekStart = (() => {
            const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().split('T')[0];
          })();

          // Streak
          let { streakCurrent, streakBest, streakLastDate } = s;
          if (streakLastDate !== today) {
            if (streakLastDate === yesterday) streakCurrent += 1;
            else streakCurrent = 1;
            streakLastDate = today;
            streakBest = Math.max(streakBest, streakCurrent);
          }

          // XP today (reset si nouveau jour)
          const xpToday = s.xpTodayDate === today ? s.xpToday + amount : amount;

          // XP weekly (reset si nouvelle semaine)
          let xpThisWeek = s.xpThisWeek + amount;
          let xpLastWeek = s.xpLastWeek;
          let xpWeekStartDate = s.xpWeekStartDate;
          if (s.xpWeekStartDate !== weekStart) {
            xpLastWeek = s.xpThisWeek;
            xpThisWeek = amount;
            xpWeekStartDate = weekStart;
          }

          return { streakCurrent, streakBest, streakLastDate, xpTotal: s.xpTotal + amount, xpToday, xpTodayDate: today, xpThisWeek, xpLastWeek, xpWeekStartDate };
        });
      },

      onboardingDone: false,
      completeOnboarding: () => set({ onboardingDone: true }),
      replayOnboarding: () => set({ onboardingDone: false }),

      quotaUsed: 0,
      quotaLimit: 20,
      quotaDate: '',
      plan: 'trial',
      trialEndsAt: null,
      syncQuota: async () => {
        const { deviceId } = get();
        if (!deviceId) return;
        try {
          const { data, error } = await supabase.rpc('get_quota_status', { p_user_id: deviceId });
          if (error || !data) return;
          set({
            quotaUsed: data.daily_used ?? 0,
            quotaLimit: data.daily_limit ?? 20,
            quotaDate: new Date().toISOString().split('T')[0],
            plan: data.plan ?? 'trial',
            trialEndsAt: data.trial_ends_at ?? null,
          });
        } catch (e) {
          console.warn('[quota] syncQuota failed:', e);
        }
      },
      decrementQuota: () => set(s => ({ quotaUsed: Math.min(s.quotaUsed + 1, s.quotaLimit) })),
    }),
    {
      name: 'mednum-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        deviceId: s.deviceId,
        courses: s.courses,
        activeCourse: s.activeCourse,
        chatHistory: s.chatHistory,
        niveau: s.niveau,
        darkMode: s.darkMode,
        uiLanguage: s.uiLanguage,
        onboardingDone: s.onboardingDone,
        studentName: s.studentName,
        studentClassId: s.studentClassId,
        studentClassName: s.studentClassName,
        studentSchoolName: s.studentSchoolName,
        conceptHistory: s.conceptHistory,
        difficultyScore: s.difficultyScore,
        streakCurrent: s.streakCurrent, streakBest: s.streakBest, streakLastDate: s.streakLastDate,
        xpTotal: s.xpTotal, xpToday: s.xpToday, xpTodayDate: s.xpTodayDate,
        xpThisWeek: s.xpThisWeek, xpLastWeek: s.xpLastWeek, xpWeekStartDate: s.xpWeekStartDate,
        dailyGoal: s.dailyGoal,
        chapterMastery: s.chapterMastery,
        activeChapterIndex: s.activeChapterIndex,
        quotaUsed: s.quotaUsed,
        quotaLimit: s.quotaLimit,
        quotaDate: s.quotaDate,
        plan: s.plan,
        trialEndsAt: s.trialEndsAt,
      }),
    }
  )
);
