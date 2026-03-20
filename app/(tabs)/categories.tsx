import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { Category, getCategories, deleteCategory } from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Tab = 'INCOME' | 'EXPENSE';

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
    headerTitle: { fontSize: FontSizes.xxxl, fontWeight: '800', color: c.text },
    tabRow: { flexDirection: 'row', marginHorizontal: Spacing.xl, marginBottom: Spacing.lg, backgroundColor: c.filterInactive, borderRadius: Radius.md, overflow: 'hidden' },
    tab: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center' },
    tabActive: { backgroundColor: c.primary },
    tabText: { fontSize: FontSizes.md, fontWeight: '600', color: c.textSecondary },
    tabTextActive: { color: '#FFFFFF' },
    listContent: { paddingHorizontal: Spacing.xl, paddingBottom: 80 },
    catCard: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: c.card, borderRadius: Radius.lg, padding: Spacing.lg,
      marginBottom: Spacing.sm, elevation: 1,
    },
    catIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
    catName: { flex: 1, fontSize: FontSizes.lg, fontWeight: '600', color: c.text },
    catType: { fontSize: FontSizes.xs, fontWeight: '600', paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.sm, overflow: 'hidden' },
    chevron: { marginLeft: Spacing.sm },
    emptyText: { fontSize: FontSizes.md, color: c.textMuted, textAlign: 'center', paddingVertical: Spacing.xxl * 2 },
    fab: {
      position: 'absolute', bottom: Spacing.xl, right: Spacing.xl,
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center',
      elevation: 4,
    },
  });
}

export default function CategoriesScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useSettings();
  const S = makeStyles(colors);

  const [tab, setTab] = useState<Tab>('EXPENSE');
  const [categories, setCategories] = useState<Category[]>([]);

  const loadData = useCallback(async () => {
    const cats = await getCategories(db);
    setCategories(cats);
  }, [db]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const filtered = categories.filter(c => c.type === tab);

  const handleDelete = (cat: Category) => {
    Alert.alert('Delete Category', `Delete "${cat.name}"? This only works if no transactions use it.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const deleted = await deleteCategory(db, cat.id);
          if (!deleted) {
            Alert.alert('Cannot Delete', 'This category is used by existing transactions.');
          } else {
            loadData();
          }
        },
      },
    ]);
  };

  return (
    <View style={S.container}>
      <View style={S.header}>
        <Text style={S.headerTitle}>Categories</Text>
      </View>

      {/* Tab toggle */}
      <View style={S.tabRow}>
        {(['EXPENSE', 'INCOME'] as Tab[]).map(t => (
          <TouchableOpacity key={t} style={[S.tab, tab === t && S.tabActive]} onPress={() => setTab(t)}>
            <Text style={[S.tabText, tab === t && S.tabTextActive]}>
              {t === 'INCOME' ? 'Income' : 'Expense'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        contentContainerStyle={S.listContent}
        keyExtractor={i => String(i.id)}
        ListEmptyComponent={<Text style={S.emptyText}>No categories</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={S.catCard}
            onPress={() => router.push({ pathname: '/edit-category', params: { id: item.id } })}
            onLongPress={() => handleDelete(item)}
          >
            {/* The icon View block has been removed here */}
            <Text style={S.catName}>{item.name}</Text>
            <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} style={S.chevron} />
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity style={S.fab} onPress={() => router.push('/add-category')}>
        <MaterialIcons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}
