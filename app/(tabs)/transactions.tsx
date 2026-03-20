import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import {
  TransactionWithDetails,
  getFilteredTransactions,
  getAccounts,
  getCategories,
  Account,
  Category
} from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useCallback, useState } from 'react';
import { format } from 'date-fns';
import { Alert, FlatList, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

// Helper for currency formatting
function formatMoney(amount: number, symbol: string): string {
  const val = Math.abs(amount) / 100;
  return `${symbol}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.xs },
    headerTitle: { fontSize: FontSizes.xxl, fontWeight: '800', color: c.text },

    // Minimized Filter Section
    filterContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: Spacing.lg,
      gap: 6,
      marginBottom: Spacing.sm
    },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: c.filterInactive,
      borderWidth: 1,
      borderColor: c.border,
    },
    filterChipActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    filterChipText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
    filterChipTextActive: { color: '#FFFFFF' },

    summaryBar: { flexDirection: 'row', marginHorizontal: Spacing.lg, marginBottom: Spacing.sm, gap: Spacing.sm },
    summaryItem: { flex: 1, backgroundColor: c.card, borderRadius: Radius.md, padding: Spacing.sm, alignItems: 'center', elevation: 1 },
    summaryLabel: { fontSize: 10, color: c.textMuted, fontWeight: '600', textTransform: 'uppercase' },
    summaryValue: { fontSize: FontSizes.sm, fontWeight: '700' },

    listContent: { paddingHorizontal: Spacing.lg, paddingBottom: 80 },
    txnCard: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: c.card, borderRadius: Radius.md, padding: Spacing.md,
      marginBottom: 6, elevation: 1,
    },
    txnIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
    txnInfo: { flex: 1 },
    txnCat: { fontSize: FontSizes.sm, fontWeight: '600', color: c.text },
    txnMeta: { fontSize: 11, color: c.textMuted, marginTop: 1 },
    txnAmount: { fontSize: FontSizes.md, fontWeight: '700' },
    emptyText: { fontSize: FontSizes.md, color: c.textMuted, textAlign: 'center', marginTop: 40 },
    fab: {
      position: 'absolute', bottom: Spacing.xl, right: Spacing.xl,
      width: 50, height: 50, borderRadius: 25,
      backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center',
      elevation: 4,
    },
  });
}

export default function TransactionsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors, currencySymbol } = useSettings();
  const S = makeStyles(colors);

  const [selectedType, setSelectedType] = useState<'INCOME' | 'EXPENSE' | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [totals, setTotals] = useState({ income: 0, expense: 0 });

  const loadData = useCallback(async () => {
    const [txns, accs, cats] = await Promise.all([
      getFilteredTransactions(db, {
        date: selectedDate,
        type: selectedType,
        accountId: selectedAccountId,
        categoryId: selectedCategoryId,
      }),
      getAccounts(db),
      getCategories(db)
    ]);
    setTransactions(txns);
    setAccounts(accs);
    setCategories(cats);

    const inc = txns.filter(t => t.category_type === 'INCOME').reduce((s, t) => s + t.amount, 0);
    const exp = txns.filter(t => t.category_type === 'EXPENSE').reduce((s, t) => s + t.amount, 0);
    setTotals({ income: inc, expense: exp });
  }, [db, selectedDate, selectedType, selectedAccountId, selectedCategoryId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // Modal Selectors
  const showTypePicker = () => {
    Alert.alert('Select Type', '', [
      { text: 'All Types', onPress: () => { setSelectedType(null); setSelectedCategoryId(null); } },
      { text: 'Income', onPress: () => { setSelectedType('INCOME'); setSelectedCategoryId(null); } },
      { text: 'Expense', onPress: () => { setSelectedType('EXPENSE'); setSelectedCategoryId(null); } },
      { text: 'Cancel', style: 'cancel' }
    ]);
  };

  const showAccountPicker = () => {
    const options = accounts.map(acc => ({
      text: acc.name,
      onPress: () => setSelectedAccountId(acc.id)
    }));
    Alert.alert('Select Account', '', [
      { text: 'All Accounts', onPress: () => setSelectedAccountId(null) },
      ...options,
      { text: 'Cancel', style: 'cancel' }
    ]);
  };

  const showCategoryPicker = () => {
    const available = selectedType ? categories.filter(c => c.type === selectedType) : categories;
    const options = available.map(cat => ({
      text: cat.name,
      onPress: () => setSelectedCategoryId(cat.id)
    }));
    Alert.alert('Select Category', '', [
      { text: 'All Categories', onPress: () => setSelectedCategoryId(null) },
      ...options,
      { text: 'Cancel', style: 'cancel' }
    ]);
  };

  const onDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (date) setSelectedDate(date);
  };

  // UI Label Helpers
  const activeAccount = accounts.find(a => a.id === selectedAccountId)?.name || 'All Accounts';
  const activeCategory = categories.find(c => c.id === selectedCategoryId)?.name || 'All Categories';

  return (
    <View style={S.container}>
      <View style={S.header}>
        <Text style={S.headerTitle}>Transactions</Text>
      </View>

      {/* Refactored Compact Filter Chips */}
      <View style={S.filterContainer}>
        {/* Date Chip */}
        <TouchableOpacity
          style={[S.filterChip, selectedDate && S.filterChipActive]}
          onPress={() => (selectedDate ? setSelectedDate(null) : setShowDatePicker(true))}
        >
          <MaterialIcons name="calendar-today" size={14} color={selectedDate ? '#FFF' : colors.textSecondary} />
          <Text style={[S.filterChipText, selectedDate && S.filterChipTextActive]}>
            {selectedDate ? format(selectedDate, 'MMM d') : 'Date'}
          </Text>
        </TouchableOpacity>

        {/* Type Chip */}
        <TouchableOpacity
          style={[S.filterChip, selectedType && S.filterChipActive]}
          onPress={showTypePicker}
        >
          <Text style={[S.filterChipText, selectedType && S.filterChipTextActive]}>
            {selectedType ? selectedType.toLowerCase() : 'All Types'}
          </Text>
          <MaterialIcons name="arrow-drop-down" size={14} color={selectedType ? '#FFF' : colors.textSecondary} />
        </TouchableOpacity>

        {/* Account Chip */}
        <TouchableOpacity
          style={[S.filterChip, selectedAccountId !== null && S.filterChipActive]}
          onPress={showAccountPicker}
        >
          <Text style={[S.filterChipText, selectedAccountId !== null && S.filterChipTextActive]} numberOfLines={1}>
            {activeAccount}
          </Text>
          <MaterialIcons name="arrow-drop-down" size={14} color={selectedAccountId !== null ? '#FFF' : colors.textSecondary} />
        </TouchableOpacity>

        {/* Category Chip */}
        <TouchableOpacity
          style={[S.filterChip, selectedCategoryId !== null && S.filterChipActive]}
          onPress={showCategoryPicker}
        >
          <Text style={[S.filterChipText, selectedCategoryId !== null && S.filterChipTextActive]} numberOfLines={1}>
            {activeCategory}
          </Text>
          <MaterialIcons name="arrow-drop-down" size={14} color={selectedCategoryId !== null ? '#FFF' : colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={selectedDate ?? new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={onDateChange}
        />
      )}

      {/* Compact Summary bar */}
      <View style={S.summaryBar}>
        <View style={S.summaryItem}>
          <Text style={S.summaryLabel}>In</Text>
          <Text style={[S.summaryValue, { color: colors.success }]}>{formatMoney(totals.income, currencySymbol)}</Text>
        </View>
        <View style={S.summaryItem}>
          <Text style={S.summaryLabel}>Out</Text>
          <Text style={[S.summaryValue, { color: colors.danger }]}>{formatMoney(totals.expense, currencySymbol)}</Text>
        </View>
        <View style={S.summaryItem}>
          <Text style={S.summaryLabel}>Count</Text>
          <Text style={[S.summaryValue, { color: colors.text }]}>{transactions.length}</Text>
        </View>
      </View>

      <FlatList
        data={transactions}
        contentContainerStyle={S.listContent}
        keyExtractor={i => String(i.id)}
        ListEmptyComponent={<Text style={S.emptyText}>No transactions found</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={S.txnCard}
            onPress={() => router.push({ pathname: '/edit-transaction', params: { id: item.id } })}
          >
            <View style={[S.txnIcon, { backgroundColor: item.category_type === 'INCOME' ? colors.successLight : colors.dangerLight }]}>
              <MaterialIcons name={item.category_icon as any} size={18} color={item.category_type === 'INCOME' ? colors.success : colors.danger} />
            </View>
            <View style={S.txnInfo}>
              <Text style={S.txnCat}>{item.category_name}</Text>
              <Text style={S.txnMeta}>{item.account_name} • {format(new Date(item.transaction_date), 'MMM d')}</Text>
            </View>
            <Text style={[S.txnAmount, { color: item.category_type === 'INCOME' ? colors.success : colors.danger }]}>
              {item.category_type === 'INCOME' ? '+' : '-'}{formatMoney(item.amount, currencySymbol)}
            </Text>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity style={S.fab} onPress={() => router.push('/add-transaction')}>
        <MaterialIcons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}