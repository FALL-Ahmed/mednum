import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { supabase, SBClass } from '../lib/supabase';
import { useAppStore } from '../store';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { useTheme } from '../components';

export default function StudentSetupScreen() {
  const { setStudentInfo } = useAppStore();
  const t = useTheme();
  const [name, setName] = useState('');
  const [classes, setClasses] = useState<SBClass[]>([]);
  const [selected, setSelected] = useState<SBClass | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('classes')
      .select('*')
      .order('name')
      .then(({ data }) => {
        if (data) setClasses(data as SBClass[]);
        setLoading(false);
      });
  }, []);

  const handleContinue = () => {
    if (!name.trim() || !selected) return;
    setStudentInfo(name.trim(), selected.id, selected.name);
  };

  const renderClass = ({ item }: { item: SBClass }) => {
    const active = selected?.id === item.id;
    return (
      <TouchableOpacity
        style={[
          styles.classChip,
          {
            borderColor: active ? Colors.blue : t.border,
            backgroundColor: active ? Colors.blueLight : t.surface,
          },
        ]}
        onPress={() => setSelected(item)}
        activeOpacity={0.7}
      >
        <Text style={[styles.classChipText, { color: active ? Colors.blue : t.text }]}>
          🏫 {item.name}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.blue} />
      <View style={styles.header}>
        <SafeAreaView>
          <Text style={styles.headerTitle}>Bienvenue 👋</Text>
          <Text style={styles.headerSub}>Dis-nous qui tu es pour commencer</Text>
        </SafeAreaView>
      </View>

      <View style={styles.body}>
        <Text style={[styles.label, { color: t.text }]}>Ton prénom</Text>
        <TextInput
          style={[styles.input, { backgroundColor: t.surface, borderColor: t.border, color: t.text }]}
          placeholder="Entre ton prénom…"
          placeholderTextColor={t.textMuted}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoFocus
        />

        <Text style={[styles.label, { color: t.text, marginTop: Spacing.lg }]}>Ta classe</Text>

        {loading ? (
          <ActivityIndicator color={Colors.blue} style={{ marginTop: 24 }} />
        ) : classes.length === 0 ? (
          <Text style={[styles.emptyText, { color: t.textMuted }]}>
            Aucune classe disponible pour l'instant.{'\n'}Demande à ton administrateur d'en créer une.
          </Text>
        ) : (
          <FlatList
            data={classes}
            keyExtractor={c => c.id}
            numColumns={2}
            columnWrapperStyle={styles.classRow}
            renderItem={renderClass}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            style={{ marginTop: 8, flexGrow: 0 }}
          />
        )}

        <TouchableOpacity
          style={[styles.btn, (!name.trim() || !selected) && { opacity: 0.4 }]}
          onPress={handleContinue}
          disabled={!name.trim() || !selected}
          activeOpacity={0.8}
        >
          <Text style={styles.btnText}>Commencer →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { backgroundColor: Colors.blue, paddingBottom: Spacing.xl, paddingHorizontal: Spacing.lg },
  headerTitle: { ...Typography.h2, color: '#fff', marginTop: Spacing.md },
  headerSub: { ...Typography.body, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  body: { flex: 1, padding: Spacing.lg },
  label: { ...Typography.label, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: 16,
  },
  classRow: { gap: 10 },
  classChip: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  classChipText: { ...Typography.label, textAlign: 'center' },
  emptyText: { ...Typography.body, textAlign: 'center', marginTop: Spacing.lg, lineHeight: 24 },
  btn: {
    backgroundColor: Colors.blue,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  btnText: { ...Typography.button, color: '#fff' },
});
