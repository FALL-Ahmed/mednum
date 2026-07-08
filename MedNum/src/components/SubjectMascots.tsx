import React, { useEffect, useRef } from 'react';
import { View, Text, Animated } from 'react-native';
import { getSubjectStyle, getSubjectKey } from '../utils/subjectStyles';

export interface SubjectMascotProps {
  subjectName: string;
  size?: number;
  animate?: boolean;
  opacity?: number;
}

export function SubjectMascot({
  subjectName,
  size = 70,
  animate = true,
  opacity = 1,
}: SubjectMascotProps) {
  const s = getSubjectStyle(subjectName);
  const key = getSubjectKey(subjectName);
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -5, duration: 2400, useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0,  duration: 2400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [animate]);

  const r = size / 2;

  return (
    <Animated.View
      style={{
        width: size, height: size,
        alignItems: 'center', justifyContent: 'center',
        opacity,
        transform: animate ? [{ translateY: floatAnim }] : [],
      }}
    >
      {/* Aura rings */}
      <View style={{ position: 'absolute', width: size, height: size, borderRadius: r, backgroundColor: s.accent + '1C' }} />
      <View style={{ position: 'absolute', width: size * 0.74, height: size * 0.74, borderRadius: r * 0.74, backgroundColor: s.accent + '2E' }} />
      <View style={{ position: 'absolute', width: size * 0.54, height: size * 0.54, borderRadius: r * 0.54, backgroundColor: s.accent + '52' }} />

      {/* Physique: orbital rings rendered behind emoji */}
      {key === 'physique' && [0, 60, 120].map(angle => (
        <View key={angle} style={{
          position: 'absolute',
          width: size * 0.88, height: size * 0.34,
          top: size * 0.33, left: size * 0.06,
          borderRadius: size * 0.44,
          borderWidth: 1.5, borderColor: s.accent + '60',
          transform: [{ rotateZ: `${angle}deg` }],
        }} />
      ))}

      {/* Emoji character */}
      <Text style={{ fontSize: size * 0.43 }}>{s.emoji}</Text>

      {/* Front decorations — unique per subject */}
      <SubjectDecor subjectKey={key} accent={s.accent} size={size} />
    </Animated.View>
  );
}

// ─── Per-subject decorative elements ─────────────────────────────────────────

function SubjectDecor({ subjectKey, accent, size }: { subjectKey: string; accent: string; size: number }) {
  switch (subjectKey) {

    case 'svt':
      return (
        <>
          {/* Two leaves at the top */}
          <View style={{
            position: 'absolute', width: size * 0.2, height: size * 0.3,
            borderRadius: size * 0.1, backgroundColor: '#22C55E',
            top: size * 0.08, left: size * 0.14,
            transform: [{ rotateZ: '-42deg' }],
          }} />
          <View style={{
            position: 'absolute', width: size * 0.2, height: size * 0.3,
            borderRadius: size * 0.1, backgroundColor: '#15803D',
            top: size * 0.08, right: size * 0.14,
            transform: [{ rotateZ: '42deg' }],
          }} />
          {/* Dewdrops */}
          <View style={{ position: 'absolute', width: 5, height: 5, borderRadius: 2.5, backgroundColor: accent + 'AA', bottom: size * 0.1, left: size * 0.2 }} />
          <View style={{ position: 'absolute', width: 5, height: 5, borderRadius: 2.5, backgroundColor: accent + 'AA', bottom: size * 0.1, left: size * 0.38 }} />
        </>
      );

    case 'math':
      return (
        <>
          {/* Antenna */}
          <View style={{ position: 'absolute', width: 3, height: size * 0.2, backgroundColor: accent, borderRadius: 1.5, top: size * 0.02, left: size * 0.47 }} />
          <View style={{ position: 'absolute', width: 9, height: 9, borderRadius: 4.5, backgroundColor: accent, top: -2, left: size * 0.435 }} />
          {/* Math symbols */}
          <Text style={{ position: 'absolute', fontSize: size * 0.16, fontWeight: '800', color: accent + 'BB', bottom: size * 0.08, right: size * 0.06 }}>π</Text>
          <Text style={{ position: 'absolute', fontSize: size * 0.16, fontWeight: '800', color: accent + 'BB', bottom: size * 0.08, left: size * 0.06 }}>∑</Text>
        </>
      );

    case 'français':
      return (
        <>
          {/* Quill feather */}
          <View style={{
            position: 'absolute', width: size * 0.11, height: size * 0.3,
            backgroundColor: accent, borderRadius: size * 0.055,
            top: -size * 0.06, right: size * 0.24,
            transform: [{ rotateZ: '22deg' }],
          }} />
          {/* Ink drops */}
          <View style={{ position: 'absolute', width: 7, height: 7, borderRadius: 3.5, backgroundColor: accent + 'AA', bottom: size * 0.09, right: size * 0.09 }} />
          <View style={{ position: 'absolute', width: 4, height: 4, borderRadius: 2, backgroundColor: accent + '77', bottom: size * 0.14, right: size * 0.22 }} />
        </>
      );

    case 'histoire':
      return (
        <>
          {/* Equator line on the globe */}
          <View style={{ position: 'absolute', width: size * 0.68, height: 1.5, backgroundColor: accent + '55', top: size * 0.49 }} />
          {/* Stars scattered */}
          <View style={{ position: 'absolute', width: 5, height: 5, borderRadius: 2.5, backgroundColor: accent, top: size * 0.05, left: size * 0.08 }} />
          <View style={{ position: 'absolute', width: 5, height: 5, borderRadius: 2.5, backgroundColor: accent, top: size * 0.07, right: size * 0.08 }} />
          <View style={{ position: 'absolute', width: 4, height: 4, borderRadius: 2, backgroundColor: accent + 'AA', bottom: size * 0.08, left: size * 0.42 }} />
        </>
      );

    case 'chimie':
      return (
        <>
          {/* Bubbles (outline circles) */}
          <View style={{ position: 'absolute', width: 9, height: 9, borderRadius: 4.5, borderWidth: 1.5, borderColor: accent + '88', top: size * 0.06, right: size * 0.09 }} />
          <View style={{ position: 'absolute', width: 6, height: 6, borderRadius: 3, borderWidth: 1.5, borderColor: accent + '88', top: size * 0.2, right: size * 0.04 }} />
          <View style={{ position: 'absolute', width: 11, height: 11, borderRadius: 5.5, borderWidth: 1.5, borderColor: accent + '88', top: size * 0.04, left: size * 0.1 }} />
        </>
      );

    case 'physique':
      return (
        <>
          {/* Electrons as glowing dots */}
          <View style={{ position: 'absolute', width: 7, height: 7, borderRadius: 3.5, backgroundColor: accent, top: size * 0.04, left: size * 0.44 }} />
          <View style={{ position: 'absolute', width: 7, height: 7, borderRadius: 3.5, backgroundColor: accent, bottom: size * 0.07, left: size * 0.06 }} />
          <View style={{ position: 'absolute', width: 7, height: 7, borderRadius: 3.5, backgroundColor: accent, bottom: size * 0.07, right: size * 0.06 }} />
        </>
      );

    case 'arabe':
      return (
        <>
          {/* 4-pointed star (two crossed bars) */}
          <View style={{ position: 'absolute', width: 12, height: 2.5, borderRadius: 1.25, backgroundColor: accent, top: size * 0.1, right: size * 0.1 }} />
          <View style={{ position: 'absolute', width: 2.5, height: 12, borderRadius: 1.25, backgroundColor: accent, top: size * 0.065, right: size * 0.158 }} />
          {/* Small star bottom-left */}
          <View style={{ position: 'absolute', width: 7, height: 2, borderRadius: 1, backgroundColor: accent + 'AA', bottom: size * 0.1, left: size * 0.1 }} />
          <View style={{ position: 'absolute', width: 2, height: 7, borderRadius: 1, backgroundColor: accent + 'AA', bottom: size * 0.075, left: size * 0.143 }} />
        </>
      );

    case 'informatique':
      return (
        <>
          {/* Antenna */}
          <View style={{ position: 'absolute', width: 2.5, height: size * 0.19, backgroundColor: accent, borderRadius: 1.25, top: 0, left: size * 0.47 }} />
          <View style={{ position: 'absolute', width: 9, height: 9, borderRadius: 4.5, backgroundColor: accent, top: -3, left: size * 0.435 }} />
          {/* Code brackets */}
          <Text style={{ position: 'absolute', fontSize: size * 0.19, fontWeight: '800', color: accent + 'BB', left: size * 0.04, top: size * 0.34 }}>{'<'}</Text>
          <Text style={{ position: 'absolute', fontSize: size * 0.19, fontWeight: '800', color: accent + 'BB', right: size * 0.04, top: size * 0.34 }}>{'>'}</Text>
        </>
      );

    case 'anglais': {
      const cw = size * 0.48;
      const cl = (size - cw) / 2;
      return (
        <>
          {/* Crown base */}
          <View style={{ position: 'absolute', width: cw, height: size * 0.09, backgroundColor: accent, borderRadius: 2, top: size * 0.03, left: cl }} />
          {/* Left peak */}
          <View style={{ position: 'absolute', width: size * 0.09, height: size * 0.14, backgroundColor: accent, borderRadius: 2, top: -size * 0.03, left: cl + size * 0.02 }} />
          {/* Center peak (tallest) */}
          <View style={{ position: 'absolute', width: size * 0.09, height: size * 0.19, backgroundColor: accent, borderRadius: 2, top: -size * 0.08, left: size / 2 - size * 0.045 }} />
          {/* Right peak */}
          <View style={{ position: 'absolute', width: size * 0.09, height: size * 0.14, backgroundColor: accent, borderRadius: 2, top: -size * 0.03, right: cl + size * 0.02 }} />
        </>
      );
    }

    default:
      return (
        <>
          {/* Generic sparkle dots */}
          <View style={{ position: 'absolute', width: 5, height: 5, borderRadius: 2.5, backgroundColor: accent + '99', top: size * 0.06, right: size * 0.07 }} />
          <View style={{ position: 'absolute', width: 4, height: 4, borderRadius: 2, backgroundColor: accent + '77', top: size * 0.15, right: size * 0.04 }} />
          <View style={{ position: 'absolute', width: 5, height: 5, borderRadius: 2.5, backgroundColor: accent + '99', bottom: size * 0.1, left: size * 0.07 }} />
        </>
      );
  }
}
