import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
)

export type Class = { id: string; name: string }
export type Subject = { id: string; name: string }
export type Course = {
  id: string
  class_id: string
  subject_id: string
  name: string
  pdf_path: string
  pages: number
  created_at: string
  content?: string
  chunks?: string
  classes?: { name: string }
  subjects?: { name: string }
}
