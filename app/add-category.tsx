import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { addCategory } from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Tab = 'EXPENSE' | 'INCOME';

const ICON_OPTIONS: string[] = [
  'restaurant', 'directions-car', 'home', 'bolt', 'shopping-cart', 'movie',
  'local-hospital', 'school', 'fitness-center', 'pets', 'flight',
  'phone', 'wifi', 'local-gas-station', 'build', 'card-giftcard',
  'account-balance-wallet', 'storefront', 'work', 'add-circle',
  'trending-up', 'savings', 'payments', 'monetization-on', 'more-horiz',
];

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
    iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    iconBtn: {
      width: 48, height: 48, borderRadius: 24,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.filterInactive,
    },
    iconBtnActive: { backgroundColor: c.primary },
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
  const [icon, setIcon] = useState('more-horiz');

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Missing Name', 'Please enter a category name.');
      return;
    }
    await addCategory(db, name.trim(), tab, icon);
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

        <View style={S.section}>
          <Text style={S.label}>Icon</Text>
          <View style={S.iconGrid}>
            {ICON_OPTIONS.map(ic => (
              <TouchableOpacity
                key={ic}
                style={[S.iconBtn, icon === ic && S.iconBtnActive]}
                onPress={() => setIcon(ic)}
              >
                <MaterialIcons name={ic as any} size={24} color={icon === ic ? '#FFFFFF' : colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={S.saveBtn} onPress={handleSave}>
          <Text style={S.saveBtnText}>Add Category</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
