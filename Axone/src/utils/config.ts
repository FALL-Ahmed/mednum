/**
 * URL du backend prof ia (FastAPI).
 * - En développement sur le même PC : http://localhost:8000
 * - Si tu testes sur un vrai téléphone : remplace par l'IP locale du PC
 *   (ex: http://192.168.1.42:8000) — doit être sur le même réseau Wi-Fi.
 */
export const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';
