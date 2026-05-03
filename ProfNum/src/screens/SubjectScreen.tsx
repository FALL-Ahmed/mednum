import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import { supabase, SBCourse } from '../lib/supabase';
import { useAppStore, Course } from '../store';
import { extractPDFText } from '../utils/pdfExtractor';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { useTheme } from '../components';

export default function SubjectScreen() {
  const {
    studentClassId,
    studentName,
    activeCourse,
    courses: storeCourses,
    addCourse,
    setActiveCourse,
  } = useAppStore();
  const t = useTheme();
  const [sbCourses, setSbCourses] = useState<SBCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (!studentClassId) { setLoading(false); return; }
    supabase
      .from('courses')
      .select('*, classes(name), subjects(name)')
      .eq('class_id', studentClassId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setSbCourses(data as SBCourse[]);
        setLoading(false);
      });
  }, [studentClassId]);

  const handleSelect = useCallback(async (course: SBCourse) => {
    if (downloading) return;

    // Already in local store — just activate
    const existing = storeCourses.find(c => c.id === course.id);
    if (existing) {
      setActiveCourse(course.id);
      return;
    }

    setDownloading(course.id);
    try {
      const { data: { publicUrl } } = supabase.storage
        .from('courses')
        .getPublicUrl(course.pdf_path);

      const localUri = FileSystem.cacheDirectory + course.id + '.pdf';
      const info = await FileSystem.getInfoAsync(localUri);
      if (!info.exists) {
        await FileSystem.downloadAsync(publicUrl, localUri);
      }

      const { text, pages } = await extractPDFText(localUri);

      const courseObj: Course = {
        id: course.id,
        name: course.name,
        fileName: course.pdf_path.split('/').pop() || course.name,
        fileUri: localUri,
        pages,
        uploadedAt: new Date(),
        active: true,
        content: text,
      };
      addCourse(courseObj);
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || 'Impossible de charger ce cours.');
    }
    setDownloading(null);
  }, [downloading, storeCourses, addCourse, setActiveCourse]);

  const renderItem = ({ item }: { item: SBCourse }) => {
    const isActive = activeCourse?.id === item.id;
    const isLoading = downloading === item.id;
    return (
      <TouchableOpacity
        style={[
          styles.card,
          {
            backgroundColor: t.surface,
            borderColor: isActive ? Colors.blue : t.border,
            borderWidth: isActive ? 1.5 : 1,
          },
        ]}
        onPress={() => handleSelect(item)}
        activeOpacity={0.8}
        disabled={!!downloading}
      >
        <View style={[styles.cardIcon, { backgroundColor: isActive ? Colors.blue : Colors.blueLight }]}>
          {isLoading ? (
            <ActivityIndicator color={isActive ? '#fff' : Colors.blue} size="small" />
          ) : (
            <Text style={{ fontSize: 22 }}>📖</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardName, { color: t.text }]} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={[styles.cardSub, { color: t.textMuted }]}>
            {item.subjects?.name}
          </Text>
        </View>
        {isActive && (
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>✓ Actif</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.blue} />
      <View style={styles.header}>
        <SafeAreaView>
          <Text style={styles.headerTitle}>Mes cours</Text>
          <Text style={styles.headerSub}>
            {studentName ? `Bonjour ${studentName} 👋` : 'Choisis un cours'}
          </Text>
        </SafeAreaView>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.blue} size="large" />
        </View>
      ) : !studentClassId ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>📋</Text>
          <Text style={[styles.emptyText, { color: t.textMuted }]}>
            Configure ton profil d'abord.
          </Text>
        </View>
      ) : sbCourses.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>📭</Text>
          <Text style={[styles.emptyText, { color: t.textMuted }]}>
            Aucun cours disponible pour ta classe.{'\n'}L'admin en ajoutera bientôt.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sbCourses}
          keyExtractor={c => c.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 30 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    backgroundColor: Colors.blue,
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  headerTitle: { ...Typography.h2, color: '#fff', marginTop: Spacing.md },
  headerSub: { ...Typography.caption, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { ...Typography.body, textAlign: 'center', lineHeight: 24 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: { ...Typography.label, lineHeight: 20, marginBottom: 2 },
  cardSub: { ...Typography.caption },
  activeBadge: {
    backgroundColor: Colors.blueLight,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  activeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.blue,
  },
});
