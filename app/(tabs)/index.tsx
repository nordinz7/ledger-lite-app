import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import {
  CategorySummary,
  DashboardSummary,
  TransactionWithDetails,
  getDashboardSummary,
  getCategorySummary,
  getRecentTransactions,
  getAccounts,
  Account,
} from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay } from 'date-fns';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Period = 'today' | 'week' | 'month';

function getDateRange(period: Period): { from: string; to: string } {
  const now = new Date();
  switch (period) {
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
    filterRow: { flexDirection: 'row', paddingHorizontal: Spacing.xl, gap: Spacing.sm, marginBottom: Spacing.lg },
    filterBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.md, backgroundColor: c.filterInactive },
    filterBtnActive: { backgroundColor: c.primary },
    filterText: { fontSize: FontSizes.sm, fontWeight: '600', color: c.textSecondary },
    filterTextActive: { color: '#FFFFFF' },
    summaryRow: { flexDirection: 'row', paddingHorizontal: Spacing.xl, gap: Spacing.md, marginBottom: Spacing.lg },
    summaryCard: { flex: 1, backgroundColor: c.card, borderRadius: Radius.lg, padding: Spacing.lg, elevation: 1 },
    summaryLabel: { fontSize: FontSizes.xs, fontWeight: '600', color: c.textMuted, textTransform: 'uppercase', marginBottom: Spacing.xs },
    summaryIncome: { fontSize: FontSizes.xl, fontWeight: '800', color: c.success },
    summaryExpense: { fontSize: FontSizes.xl, fontWeight: '800', color: c.danger },
    netCard: { marginHorizontal: Spacing.xl, backgroundColor: c.card, borderRadius: Radius.lg, padding: Spacing.xl, elevation: 1, marginBottom: Spacing.lg, alignItems: 'center' },
    netLabel: { fontSize: FontSizes.sm, fontWeight: '600', color: c.textMuted, textTransform: 'uppercase', marginBottom: Spacing.xs },
    netAmount: { fontSize: FontSizes.xxxl, fontWeight: '800' },
    section: { marginHorizontal: Spacing.xl, marginBottom: Spacing.lg },
    sectionTitle: { fontSize: FontSizes.sm, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm },
    card: { backgroundColor: c.card, borderRadius: Radius.lg, overflow: 'hidden', elevation: 1 },
    catRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: c.separator },
    catRowLast: { borderBottomWidth: 0 },
    catIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
    catName: { flex: 1, fontSize: FontSizes.md, fontWeight: '500', color: c.text },
    catAmount: { fontSize: FontSizes.md, fontWeight: '700' },
    txnRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: c.separator },
    txnRowLast: { borderBottomWidth: 0 },
    txnIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
    txnInfo: { flex: 1 },
    txnCat: { fontSize: FontSizes.md, fontWeight: '600', color: c.text },
    txnNote: { fontSize: FontSizes.xs, color: c.textMuted, marginTop: 2 },
    txnAmount: { fontSize: FontSizes.md, fontWeight: '700' },
    accountsRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg, paddingHorizontal: Spacing.xl },
    accountCard: { flex: 1, backgroundColor: c.card, borderRadius: Radius.lg, padding: Spacing.lg, elevation: 1 },
    accountName: { fontSize: FontSizes.sm, fontWeight: '600', color: c.textMuted, marginBottom: Spacing.xs },
    accountBalance: { fontSize: FontSizes.lg, fontWeight: '700', color: c.text },
    emptyText: { fontSize: FontSizes.md, color: c.textMuted, textAlign: 'center', paddingVertical: Spacing.xxl },
    fab: {
      position: 'absolute', bottom: Spacing.xl, right: Spacing.xl,
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center',
      elevation: 4,
    },
  });
}

export default function DashboardScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors, currencySymbol } = useSettings();
  const S = makeStyles(colors);

  const [period, setPeriod] = useState<Period>('month');
  const [summary, setSummary] = useState<DashboardSummary>({ totalIncome: 0, totalExpense: 0, netBalance: 0 });
  const [catSummary, setCatSummary] = useState<CategorySummary[]>([]);
  const [recentTxns, setRecentTxns] = useState<TransactionWithDetails[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const loadData = useCallback(async () => {
    const range = getDateRange(period);
    const [sum, cats, txns, accs] = await Promise.all([
      getDashboardSummary(db, range.from, range.to),
      getCategorySummary(db, range.from, range.to),
      getRecentTransactions(db, 5),
      getAccounts(db),
    ]);
    setSummary(sum);
    setCatSummary(cats);
    setRecentTxns(txns);
    setAccounts(accs);
  }, [db, period]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  return (
    <View style={S.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <View style={S.header}>
          <Text style={S.headerTitle}>Dashboard</Text>
        </View>

        {/* Period filter */}
        <View style={S.filterRow}>
          {(['today', 'week', 'month'] as Period[]).map(p => (
            <TouchableOpacity
              key={p}
              style={[S.filterBtn, period === p && S.filterBtnActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[S.filterText, period === p && S.filterTextActive]}>
                {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : 'This Month'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Income / Expense cards */}
        <View style={S.summaryRow}>
          <View style={S.summaryCard}>
            <Text style={S.summaryLabel}>Income</Text>
            <Text style={S.summaryIncome}>{formatMoney(summary.totalIncome, currencySymbol)}</Text>
          </View>
          <View style={S.summaryCard}>
            <Text style={S.summaryLabel}>Expense</Text>
            <Text style={S.summaryExpense}>{formatMoney(summary.totalExpense, currencySymbol)}</Text>
          </View>
        </View>

        {/* Net balance */}
        <View style={S.netCard}>
          <Text style={S.netLabel}>Net Balance</Text>
          <Text style={[S.netAmount, { color: summary.netBalance >= 0 ? colors.success : colors.danger }]}>
            {summary.netBalance < 0 ? '-' : ''}{formatMoney(summary.netBalance, currencySymbol)}
          </Text>
        </View>

        {/* Accounts */}
        {accounts.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.accountsRow}>
            {accounts.map(acc => (
              <View key={acc.id} style={S.accountCard}>
                <Text style={S.accountName}>{acc.name}</Text>
                <Text style={[S.accountBalance, { color: acc.balance >= 0 ? colors.success : colors.danger }]}>
                  {formatMoney(acc.balance, currencySymbol)}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Category breakdown */}
        {catSummary.length > 0 && (
          <View style={S.section}>
            <Text style={S.sectionTitle}>By Category</Text>
            <View style={S.card}>
              {catSummary.map((cat, i) => (
                <View key={cat.category_id} style={[S.catRow, i === catSummary.length - 1 && S.catRowLast]}>
                  <View style={[S.catIcon, { backgroundColor: cat.category_type === 'INCOME' ? colors.successLight : colors.dangerLight }]}>
                    <MaterialIcons name={cat.icon_name as any} size={20} color={cat.category_type === 'INCOME' ? colors.success : colors.danger} />
                  </View>
                  <Text style={S.catName}>{cat.category_name}</Text>
                  <Text style={[S.catAmount, { color: cat.category_type === 'INCOME' ? colors.success : colors.danger }]}>
                    {formatMoney(cat.total, currencySymbol)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Recent transactions */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>Recent Transactions</Text>
          {recentTxns.length === 0 ? (
            <Text style={S.emptyText}>No transactions yet</Text>
          ) : (
            <View style={S.card}>
              {recentTxns.map((txn, i) => (
                <View key={txn.id} style={[S.txnRow, i === recentTxns.length - 1 && S.txnRowLast]}>
                  <View style={[S.txnIcon, { backgroundColor: txn.category_type === 'INCOME' ? colors.successLight : colors.dangerLight }]}>
                    <MaterialIcons name={txn.category_icon as any} size={18} color={txn.category_type === 'INCOME' ? colors.success : colors.danger} />
                  </View>
                  <View style={S.txnInfo}>
                    <Text style={S.txnCat}>{txn.category_name}</Text>
                    <Text style={S.txnNote}>{txn.note || txn.account_name} - {format(new Date(txn.transaction_date), 'MMM d')}</Text>
                  </View>
                  <Text style={[S.txnAmount, { color: txn.category_type === 'INCOME' ? colors.success : colors.danger }]}>
                    {txn.category_type === 'INCOME' ? '+' : '-'}{formatMoney(txn.amount, currencySymbol)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={S.fab} onPress={() => router.push('/add-transaction')}>
        <MaterialIcons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}
