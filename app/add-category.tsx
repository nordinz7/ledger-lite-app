import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { addCategory, categoryExists } from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Tab = 'EXPENSE' | 'INCOME';

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    tabRow: { flexDirection: 'row', margin: Spacing.lg, backgroundColor: c.filterInactive, borderRadius: Radius.md, overflow: 'hidden' },
    tab: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center' },
    tabActive: { backgroundColor: c.primary },
    tabText: { fontSize: FontSizes.md, fontWeight: '600', color: c.textSecondary },
    tabTextActive: { color: '#FFFFFF' },
    section: { marginHorizontal: Spacing.lg, marginBottom: Spacing.lg },
    label: { fontSize: FontSizes.sm, fontWeight: '600', color: c.textMuted, marginBottom: Spacing.sm },
    input: {
      backgroundColor: c.card, borderRadius: Radius.lg,
      paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
      fontSize: FontSizes.lg, color: c.text, fontWeight: '600',
    },
    saveBtn: {
      margin: Spacing.lg, backgroundColor: c.primary,
      borderRadius: Radius.lg, paddingVertical: Spacing.lg,
      alignItems: 'center',
    },
    saveBtnText: { fontSize: FontSizes.lg, fontWeight: '700', color: '#FFFFFF' },
  });
}

export default function AddCategoryScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useSettings();
  const S = makeStyles(colors);

  const [tab, setTab] = useState<Tab>('EXPENSE');
  const [name, setName] = useState('');

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Missing Name', 'Please enter a category name.');
      return;
    }

    // Check for duplicate name
    const exists = await categoryExists(db, trimmedName);
    if (exists) {
      Alert.alert('Duplicate Name', 'A category with this name already exists.');
      return;
    }

    // Pass a default hidden icon string ('more-horiz') to satisfy the DB schema
    await addCategory(db, trimmedName, tab, 'more-horiz');
    router.back();
  };

  return (
    <KeyboardAvoidingView style={S.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={S.tabRow}>
          {(['EXPENSE', 'INCOME'] as Tab[]).map(t => (
            <TouchableOpacity key={t} style={[S.tab, tab === t && S.tabActive]} onPress={() => setTab(t)}>
              <Text style={[S.tabText, tab === t && S.tabTextActive]}>
                {t === 'INCOME' ? 'Income' : 'Expense'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={S.section}>
          <Text style={S.label}>Category Name</Text>
          <TextInput
            style={S.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Groceries"
            placeholderTextColor={colors.textMuted}
            autoFocus
          />
        </View>

        <TouchableOpacity style={S.saveBtn} onPress={handleSave}>
          <Text style={S.saveBtnText}>Add Category</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}