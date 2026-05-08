import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NiveauType } from '../utils/rag';

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
};

export type ChatSession = {
  id: string;
  courseId: string;
  courseName: string;
  messages: Message[];
  createdAt: Date;
};

type AppStore = {
  darkMode: boolean;
  toggleDarkMode: () => void;

  // Élève
  studentName: string;
  studentClassId: string;
  studentClassName: string;
  setStudentInfo: (name: string, classId: string, className: string) => void;
  resetStudent: () => void;

  courses: Course[];
  activeCourse: Course | null;
  addCourse: (course: Course) => void;
  removeCourse: (id: string) => void;
  setActiveCourse: (id: string) => void;
  setCourseSummary: (id: string, summary: string) => void;
  updateCourseChunks: (id: string, chunks: CourseChunk[]) => void;

  currentMessages: Message[];
  chatHistory: ChatSession[];
  isLoading: boolean;
  addMessage: (msg: Message) => void;
  setLoading: (v: boolean) => void;
  clearChat: () => void;
  saveChatSession: () => void;
  resumeSession: (session: ChatSession) => void;
  setFeedback: (msgId: string, feedback: 'up' | 'down') => void;

  niveau: NiveauType;
  setNiveau: (n: NiveauType) => void;

  // Suivi des concepts demandés par l'élève (courseId → concept → { count, lastAsked })
  conceptHistory: Record<string, Record<string, { count: number; lastAsked: string }>>;
  trackConcept: (courseId: string, concept: string) => void;
  getWeakConcepts: (courseId: string, n?: number) => string[];

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
  addXP: (amount: number) => void;

  onboardingDone: boolean;
  completeOnboarding: () => void;
};

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      darkMode: false,
      toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),

      studentName: '',
      studentClassId: '',
      studentClassName: '',
      setStudentInfo: (name, classId, className) =>
        set({ studentName: name, studentClassId: classId, studentClassName: className }),
      resetStudent: () =>
        set({ studentName: '', studentClassId: '', studentClassName: '', activeCourse: null, currentMessages: [] }),

      courses: [],
      activeCourse: null,
      addCourse: (course) =>
        set((s) => {
          const updated = s.courses.map((c) => ({ ...c, active: false }));
          return { courses: [...updated, { ...course, active: true }], activeCourse: course };
        }),
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
      removeCourse: (id) =>
        set((s) => {
          const filtered = s.courses.filter((c) => c.id !== id);
          const activeCourse = filtered.find((c) => c.active) || filtered[0] || null;
          return { courses: filtered, activeCourse };
        }),
      setActiveCourse: (id) =>
        set((s) => {
          if (s.activeCourse?.id === id) return {};
          const courses = s.courses.map((c) => ({ ...c, active: c.id === id }));
          const activeCourse = courses.find((c) => c.id === id) || null;
          // Auto-save current session then clear messages
          let chatHistory = s.chatHistory;
          if (s.currentMessages.length > 0 && s.activeCourse) {
            const session: ChatSession = {
              id: Date.now().toString(),
              courseId: s.activeCourse.id,
              courseName: s.activeCourse.name,
              messages: [...s.currentMessages],
              createdAt: new Date(),
            };
            chatHistory = [session, ...chatHistory].slice(0, 50);
          }
          return { courses, activeCourse, currentMessages: [], chatHistory };
        }),

      currentMessages: [],
      chatHistory: [],
      isLoading: false,
      addMessage: (msg) => set((s) => ({ currentMessages: [...s.currentMessages, msg] })),
      setLoading: (v) => set({ isLoading: v }),
      clearChat: () => set({ currentMessages: [] }),
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
        if (!activeCourse || currentMessages.length === 0) return;
        const session: ChatSession = {
          id: Date.now().toString(),
          courseId: activeCourse.id,
          courseName: activeCourse.name,
          messages: [...currentMessages],
          createdAt: new Date(),
        };
        set({ chatHistory: [session, ...chatHistory].slice(0, 50) });
      },
      setFeedback: (msgId, feedback) =>
        set((s) => ({
          currentMessages: s.currentMessages.map((m) =>
            m.id === msgId ? { ...m, feedback } : m
          ),
        })),

      niveau: 'moyen' as NiveauType,
      setNiveau: (n) => set({ niveau: n }),

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

      // Gamification
      streakCurrent: 0, streakBest: 0, streakLastDate: '',
      xpTotal: 0, xpToday: 0, xpTodayDate: '', xpThisWeek: 0, xpLastWeek: 0, xpWeekStartDate: '', dailyGoal: 50,

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
    }),
    {
      name: 'profnum-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        courses: s.courses,
        activeCourse: s.activeCourse,
        chatHistory: s.chatHistory,
        niveau: s.niveau,
        darkMode: s.darkMode,
        onboardingDone: s.onboardingDone,
        studentName: s.studentName,
        studentClassId: s.studentClassId,
        studentClassName: s.studentClassName,
        conceptHistory: s.conceptHistory,
        streakCurrent: s.streakCurrent, streakBest: s.streakBest, streakLastDate: s.streakLastDate,
        xpTotal: s.xpTotal, xpToday: s.xpToday, xpTodayDate: s.xpTodayDate,
        xpThisWeek: s.xpThisWeek, xpLastWeek: s.xpLastWeek, xpWeekStartDate: s.xpWeekStartDate,
        dailyGoal: s.dailyGoal,
      }),
    }
  )
);
