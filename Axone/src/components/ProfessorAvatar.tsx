import React, { useState } from 'react';
import { Image as ExpoImage } from 'expo-image';
import { SubjectMascot } from './SubjectMascots';
import { getSubjectKey } from '../utils/subjectStyles';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';

// Noms des fichiers dans Supabase Storage > bucket "professors"
// Exemple : https://<project>.supabase.co/storage/v1/object/public/professors/maths.png
const KEY_TO_FILE: Record<string, string> = {
  svt:          'svt.png',
  math:         'maths.png',
  français:     'francais.png',
  histoire:     'histoire.png',
  physique:     'physique.png',
  chimie:       'chimie.png',
  arabe:        'arabe.png',
  informatique: 'informatique.png',
  anglais:      'anglais.png',
  islamique:    'islamique.png',
  civique:      'civique.png',
  default:      'default.png',
};

interface ProfessorAvatarProps {
  subjectName: string;
  width?:       number;
  height?:      number;
  fallbackSize?: number;
  animate?:     boolean;
}

export function ProfessorAvatar({
  subjectName,
  width        = 90,
  height       = 120,
  fallbackSize = 82,
  animate      = true,
}: ProfessorAvatarProps) {
  const [hasError, setHasError] = useState(false);

  const key      = getSubjectKey(subjectName);
  const fileName = KEY_TO_FILE[key] ?? KEY_TO_FILE.default;
  const uri      = `${SUPABASE_URL}/storage/v1/object/public/professors/${fileName}`;

  // Fallback → mascotte emoji animée si image non uploadée ou erreur réseau
  if (hasError || !SUPABASE_URL) {
    return (
      <SubjectMascot
        subjectName={subjectName}
        size={fallbackSize}
        animate={animate}
      />
    );
  }

  return (
    <ExpoImage
      source={{ uri }}
      style={{ width, height }}
      contentFit="contain"
      cachePolicy="memory-disk"
      transition={0}
      onError={() => setHasError(true)}
    />
  );
}
