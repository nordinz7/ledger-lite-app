import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import {
  TransactionWithDetails,
  deleteTransaction,
  getFilteredTransactions,
  getAccounts,
  getCategories,
  Account,
  Category
} from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useCallback, useState } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay } from 'date-fns';
import { Alert, FlatList, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

type Period = 'today' | 'week' | 'month';

function getDateRange(date: Period): { from: string; to: string } {
  const now = new Date();
  switch (date) {
    case 'today':
      return { from: format(startOfDay(now), 'yyyy-MM-dd'), to: format(endOfDay(now), 'yyyy-MM-dd') };
    case 'week':
      return { from: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'), to: format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd') };
    case 'month':
      return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to: format(endOfMonth(now), 'yyyy-MM-dd') };
  }
}

function formatMoney(amount: number, symbol: string): string {
  const val = Math.abs(amount) / 100;
  return `${symbol}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
    headerTitle: { fontSize: FontSizes.xxxl, fontWeight: '800', color: c.text },
    filterRow: { flexDirection: 'row', paddingHorizontal: Spacing.xl, gap: Spacing.sm, marginBottom: Spacing.md },
    filterScroll: { paddingHorizontal: Spacing.xl, gap: Spacing.sm, paddingBottom: Spacing.md },
    filterBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.md, backgroundColor: c.filterInactive },
    filterBtnActive: { backgroundColor: c.primary },
    filterText: { fontSize: FontSizes.sm, fontWeight: '600', color: c.textSecondary },
    filterTextActive: { color: '#FFFFFF' },
    summaryBar: { flexDirection: 'row', marginHorizontal: Spacing.xl, marginBottom: Spacing.md, gap: Spacing.md },
    summaryItem: { flex: 1, backgroundColor: c.card, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', elevation: 1 },
    summaryLabel: { fontSize: FontSizes.xs, color: c.textMuted, fontWeight: '600' },
    summaryValue: { fontSize: FontSizes.md, fontWeight: '700', marginTop: 2 },
    listContent: { paddingHorizontal: Spacing.xl, paddingBottom: 80 },
    txnCard: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: c.card, borderRadius: Radius.lg, padding: Spacing.lg,
      marginBottom: Spacing.sm, elevation: 1,
    },
    txnIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
    txnInfo: { flex: 1 },
    txnCat: { fontSize: FontSizes.md, fontWeight: '600', color: c.text },
    txnMeta: { fontSize: FontSizes.xs, color: c.textMuted, marginTop: 2 },
    txnAmount: { fontSize: FontSizes.lg, fontWeight: '700' },
    emptyText: { fontSize: FontSizes.md, color: c.textMuted, textAlign: 'center', paddingVertical: Spacing.xxl * 2 },
    fab: {
      position: 'absolute', bottom: Spacing.xl, right: Spacing.xl,
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center',
      elevation: 4,
    },
    filterChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      flexShrink: 0,
      paddingHorizontal: Spacing.md, paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: c.filterInactive,
    },
    filterChipActive: { backgroundColor: c.primary },
    filterChipText: { fontSize: FontSizes.sm, fontWeight: '700', color: c.textSecondary },
    filterChipTextActive: { color: '#FFFFFF' },
    filterSpacer: { flex: 1 },
  });
}

export default function TransactionsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors, currencySymbol } = useSettings();
  const S = makeStyles(colors);
  const params = useLocalSearchParams<{ filterDate?: string }>();

  const [selectedType, setSelectedType] = useState<'INCOME' | 'EXPENSE' | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);

  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [totals, setTotals] = useState({ income: 0, expense: 0 });
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => {
      if (params.filterDate) {
        const d = new Date(params.filterDate);
        if (!isNaN(d.getTime())) return d;
      }
      return new Date();
    });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const dateChipLabel = selectedDate ? format(selectedDate, 'dd MMM yyyy') : null;


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

  const handleDelete = (txn: TransactionWithDetails) => {
    Alert.alert('Delete Transaction', `Delete this ${txn.category_name} transaction?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deleteTransaction(db, txn.id);
          loadData();
        },
      },
    ]);
  };

  // Filter categories based on selected type
  const availableCategories = selectedType
    ? categories.filter(c => c.type === selectedType)
    : categories;

     const onDateChange = (_event: DateTimePickerEvent, date?: Date) => {
        if (Platform.OS === 'android') setShowDatePicker(false);
        if (date) setSelectedDate(date);
      };

  return (
    <View style={S.container}>
      <View style={S.header}>
        <Text style={S.headerTitle}>Transactions</Text>
      </View>

      <View>
        {/* Date Filter (Matches Dashboard) */}
        <View style={S.filterRow}>
          <TouchableOpacity
            style={[S.filterChip, selectedDate ? S.filterChipActive : undefined]}
            onPress={() => {
              if (selectedDate) {
                setSelectedDate(null);
              } else {
                setShowDatePicker(true);
              }
            }}
          >
            <MaterialIcons
              name={selectedDate ? 'close' : 'calendar-today'}
              size={16}
              color={selectedDate ? '#FFFFFF' : colors.textSecondary}
            />
            {dateChipLabel ? (
              <Text style={[S.filterChipText, S.filterChipTextActive]} numberOfLines={1}>
                {dateChipLabel}
              </Text>
            ) : (
              <Text style={S.filterChipText}>Date</Text>
            )}
          </TouchableOpacity>
        </View>

         {showDatePicker && (
        <DateTimePicker
          value={selectedDate ?? new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={onDateChange}
          themeVariant={colors.background === '#000000' || colors.background === '#121212' ? 'dark' : 'light'}
        />
      )}

        {/* Dynamic Secondary Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.filterScroll}>
          {/* Type Filters */}
          <TouchableOpacity style={[S.filterBtn, selectedType === null && S.filterBtnActive]} onPress={() => { setSelectedType(null); setSelectedCategoryId(null); }}>
            <Text style={[S.filterText, selectedType === null && S.filterTextActive]}>All Types</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[S.filterBtn, selectedType === 'INCOME' && S.filterBtnActive]} onPress={() => { setSelectedType('INCOME'); setSelectedCategoryId(null); }}>
            <Text style={[S.filterText, selectedType === 'INCOME' && S.filterTextActive]}>Income</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[S.filterBtn, selectedType === 'EXPENSE' && S.filterBtnActive]} onPress={() => { setSelectedType('EXPENSE'); setSelectedCategoryId(null); }}>
            <Text style={[S.filterText, selectedType === 'EXPENSE' && S.filterTextActive]}>Expense</Text>
          </TouchableOpacity>

          {/* Account Filters */}
          <View style={{ width: 1, backgroundColor: colors.separator, marginHorizontal: Spacing.xs, marginVertical: Spacing.xs }} />
          <TouchableOpacity style={[S.filterBtn, selectedAccountId === null && S.filterBtnActive]} onPress={() => setSelectedAccountId(null)}>
            <Text style={[S.filterText, selectedAccountId === null && S.filterTextActive]}>All Accounts</Text>
          </TouchableOpacity>
          {accounts.map(acc => (
            <TouchableOpacity key={`acc-${acc.id}`} style={[S.filterBtn, selectedAccountId === acc.id && S.filterBtnActive]} onPress={() => setSelectedAccountId(acc.id)}>
              <Text style={[S.filterText, selectedAccountId === acc.id && S.filterTextActive]}>{acc.name}</Text>
            </TouchableOpacity>
          ))}

          {/* Category Filters */}
          <View style={{ width: 1, backgroundColor: colors.separator, marginHorizontal: Spacing.xs, marginVertical: Spacing.xs }} />
          <TouchableOpacity style={[S.filterBtn, selectedCategoryId === null && S.filterBtnActive]} onPress={() => setSelectedCategoryId(null)}>
            <Text style={[S.filterText, selectedCategoryId === null && S.filterTextActive]}>All Categories</Text>
          </TouchableOpacity>
          {availableCategories.map(cat => (
            <TouchableOpacity key={`cat-${cat.id}`} style={[S.filterBtn, selectedCategoryId === cat.id && S.filterBtnActive]} onPress={() => setSelectedCategoryId(cat.id)}>
              <Text style={[S.filterText, selectedCategoryId === cat.id && S.filterTextActive]}>{cat.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Summary bar */}
      <View style={S.summaryBar}>
        <View style={S.summaryItem}>
          <Text style={S.summaryLabel}>Income</Text>
          <Text style={[S.summaryValue, { color: colors.success }]}>{formatMoney(totals.income, currencySymbol)}</Text>
        </View>
        <View style={S.summaryItem}>
          <Text style={S.summaryLabel}>Expense</Text>
          <Text style={[S.summaryValue, { color: colors.danger }]}>{formatMoney(totals.expense, currencySymbol)}</Text>
        </View>
        <View style={S.summaryItem}>
          <Text style={S.summaryLabel}>Count</Text>
          <Text style={[S.summaryValue, { color: colors.text }]}>{transactions.length}</Text>
        </View>
      </View>

      {/* Transaction list */}
      <FlatList
        data={transactions}
        contentContainerStyle={S.listContent}
        keyExtractor={i => String(i.id)}
        ListEmptyComponent={<Text style={S.emptyText}>No transactions found for these filters</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={S.txnCard}
            onPress={() => router.push({ pathname: '/edit-transaction', params: { id: item.id } })}
            onLongPress={() => handleDelete(item)}
          >
            <View style={[S.txnIcon, { backgroundColor: item.category_type === 'INCOME' ? colors.successLight : colors.dangerLight }]}>
              <MaterialIcons name={item.category_icon as any} size={20} color={item.category_type === 'INCOME' ? colors.success : colors.danger} />
            </View>
            <View style={S.txnInfo}>
              <Text style={S.txnCat}>{item.category_name}</Text>
              <Text style={S.txnMeta}>
                {item.account_name}{item.note ? ` - ${item.note}` : ''} - {format(new Date(item.transaction_date), 'MMM d, yyyy')}
              </Text>
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