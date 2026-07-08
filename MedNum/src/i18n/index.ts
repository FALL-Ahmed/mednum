import { useAppStore } from '../store';
import { fr, ar } from './translations';

export type { TranslationShape } from './translations';

export function useT() {
  const lang = useAppStore((s) => s.uiLanguage);
  return lang === 'ar' ? ar : fr;
}

export function useUiLang() {
  return useAppStore((s) => s.uiLanguage);
}
