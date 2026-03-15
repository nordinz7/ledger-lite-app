import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { TransactionWithDetails, getTransactionsByDateRange, deleteTransaction } from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths, startOfDay, endOfDay, subDays } from 'date-fns';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Filter = 'today' | 'yesterday' | 'week' | 'month' | 'last_month';

function getDateRange(filter: Filter): { from: string; to: string; label: string } {
  const now = new Date();
  switch (filter) {
    case 'today':
      return { from: format(startOfDay(now), 'yyyy-MM-dd'), to: format(endOfDay(now), 'yyyy-MM-dd'), label: format(now, 'MMM d, yyyy') };
    case 'yesterday': {
      const y = subDays(now, 1);
      return { from: format(startOfDay(y), 'yyyy-MM-dd'), to: format(endOfDay(y), 'yyyy-MM-dd'), label: format(y, 'MMM d, yyyy') };
    }
    case 'week':
      return { from: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'), to: format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'), label: 'This Week' };
    case 'month':
      return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to: format(endOfMonth(now), 'yyyy-MM-dd'), label: format(now, 'MMMM yyyy') };
    case 'last_month': {
      const lm = subMonths(now, 1);
      return { from: format(startOfMonth(lm), 'yyyy-MM-dd'), to: format(endOfMonth(lm), 'yyyy-MM-dd'), label: format(lm, 'MMMM yyyy') };
    }
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
    filterScroll: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md },
    filterRow: { flexDirection: 'row', gap: Spacing.sm },
    filterBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.md, backgroundColor: c.filterInactive },
    filterBtnActive: { backgroundColor: c.primary },
    filterText: { fontSize: FontSizes.sm, fontWeight: '600', color: c.textSecondary },
    filterTextActive: { color: '#FFFFFF' },
    summaryBar: { flexDirection: 'row', marginHorizontal: Spacing.xl, marginBottom: Spacing.md, gap: Spacing.md },
    summaryItem: { flex: 1, backgroundColor: c.card, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center' },
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
  });
}

export default function TransactionsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors, currencySymbol } = useSettings();
  const S = makeStyles(colors);

  const [filter, setFilter] = useState<Filter>('month');
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [totals, setTotals] = useState({ income: 0, expense: 0 });

  const loadData = useCallback(async () => {
    const range = getDateRange(filter);
    const txns = await getTransactionsByDateRange(db, range.from, range.to);
    setTransactions(txns);
    const inc = txns.filter(t => t.category_type === 'INCOME').reduce((s, t) => s + t.amount, 0);
    const exp = txns.filter(t => t.category_type === 'EXPENSE').reduce((s, t) => s + t.amount, 0);
    setTotals({ income: inc, expense: exp });
  }, [db, filter]);

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

  const filters: { key: Filter; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'last_month', label: 'Last Month' },
  ];

  return (
    <View style={S.container}>
      <View style={S.header}>
        <Text style={S.headerTitle}>Transactions</Text>
      </View>

      {/* Filters */}
      <FlatList
        data={filters}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={S.filterScroll}
        keyExtractor={i => i.key}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[S.filterBtn, filter === item.key && S.filterBtnActive]}
            onPress={() => setFilter(item.key)}
          >
            <Text style={[S.filterText, filter === item.key && S.filterTextActive]}>{item.label}</Text>
          </TouchableOpacity>
        )}
      />

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
        ListEmptyComponent={<Text style={S.emptyText}>No transactions found</Text>}
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
