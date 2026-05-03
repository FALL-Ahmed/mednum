import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NiveauType } from '../utils/rag';

export type Message = {
  id: string;
  role: 'user' | 'assistant' | 'refusal' | 'error';
  content: string;
  sources?: string[];
  suggestions?: string[];
  timestamp: Date;
  feedback?: 'up' | 'down' | null;
};

export type Course = {
  id: string;
  name: string;
  fileName: string;
  fileUri: string;
  pages: number;
  uploadedAt: Date;
  active: boolean;
  content: string;
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
      removeCourse: (id) =>
        set((s) => {
          const filtered = s.courses.filter((c) => c.id !== id);
          const activeCourse = filtered.find((c) => c.active) || filtered[0] || null;
          return { courses: filtered, activeCourse };
        }),
      setActiveCourse: (id) =>
        set((s) => {
          const courses = s.courses.map((c) => ({ ...c, active: c.id === id }));
          const activeCourse = courses.find((c) => c.id === id) || null;
          return { courses, activeCourse };
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
      }),
    }
  )
);
