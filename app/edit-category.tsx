import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { updateCategory, deleteCategory, categoryExists } from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
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
    btnRow: { flexDirection: 'row', margin: Spacing.lg, gap: Spacing.md },
    saveBtn: {
      flex: 1, backgroundColor: c.primary,
      borderRadius: Radius.lg, paddingVertical: Spacing.lg,
      alignItems: 'center',
    },
    saveBtnText: { fontSize: FontSizes.lg, fontWeight: '700', color: '#FFFFFF' },
    deleteBtn: {
      backgroundColor: c.dangerLight,
      borderRadius: Radius.lg, paddingVertical: Spacing.lg, paddingHorizontal: Spacing.xl,
      alignItems: 'center',
    },
  });
}

export default function EditCategoryScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useSettings();
  const S = makeStyles(colors);
  const { id } = useLocalSearchParams<{ id: string }>();

  const [tab, setTab] = useState<Tab>('EXPENSE');
  const [name, setName] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const cat = await db.getFirstAsync<{ id: number; name: string; type: string; }>(
        'SELECT * FROM categories WHERE id = ?', Number(id)
      );
      if (cat) {
        setName(cat.name);
        setTab(cat.type as Tab);
      }
      setLoaded(true);
    })();
  }, [db, id]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Missing Name', 'Please enter a category name.');
      return;
    }

    // Check for duplicate name (ignoring the current category's id)
    const exists = await categoryExists(db, trimmedName, Number(id));
    if (exists) {
      Alert.alert('Duplicate Name', 'A category with this name already exists.');
      return;
    }

    await updateCategory(db, Number(id), trimmedName, tab, 'more-horiz');
    router.back();
  };

  const handleDelete = () => {
    Alert.alert('Delete Category', `Delete "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const deleted = await deleteCategory(db, Number(id));
          if (!deleted) {
            Alert.alert('Cannot Delete', 'This category is used by existing transactions.');
          } else {
            router.back();
          }
        },
      },
    ]);
  };

  if (!loaded) return null;

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
          />
        </View>

        <View style={S.btnRow}>
          <TouchableOpacity style={S.deleteBtn} onPress={handleDelete}>
            <MaterialIcons name="delete" size={24} color={colors.danger} />
          </TouchableOpacity>
          <TouchableOpacity style={S.saveBtn} onPress={handleSave}>
            <Text style={S.saveBtnText}>Update</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}