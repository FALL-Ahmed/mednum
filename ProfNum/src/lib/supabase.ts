import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
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
  created_at: string
  classes: { name: string }
  subjects: { name: string }
}
