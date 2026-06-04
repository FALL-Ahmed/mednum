import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: AsyncStorage,
  },
})

export type SBClass = { id: string; name: string }
export type SBSubject = { id: string; name: string }
export type SBCourse = {
  id: string
  class_id: string
  subject_id: string
  name: string
  pdf_path: string
  pages: number
  content: string | null
  chunks: string | null
  fiches: Record<string, string> | null
  created_at: string
  classes: { name: string }
  subjects: { name: string }
}
