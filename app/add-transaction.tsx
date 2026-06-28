import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { AccountWithGroups, Category, getAccountsWithGroups, getCategories, addTransaction, addTransfer } from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import * as Haptics from 'expo-haptics'; // Remember to install if not present

type Tab = 'EXPENSE' | 'INCOME' | 'TRANSFER';

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
    card: { backgroundColor: c.card, borderRadius: Radius.lg, overflow: 'hidden', elevation: 1 },
    amountInput: {
      fontSize: FontSizes.xxxl, fontWeight: '800', color: c.text,
      textAlign: 'center', paddingVertical: Spacing.xl,
      backgroundColor: c.card, borderRadius: Radius.lg,
    },
    catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    catChip: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
      paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
      borderRadius: Radius.md, backgroundColor: c.filterInactive,
    },
    catChipActive: { backgroundColor: c.primary },
    catChipText: { fontSize: FontSizes.sm, fontWeight: '600', color: c.textSecondary },
    catChipTextActive: { color: '#FFFFFF' },
    row: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg,
      borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    rowLast: { borderBottomWidth: 0 },
    rowIcon: { marginRight: Spacing.md },
    rowInput: { flex: 1, fontSize: FontSizes.md, color: c.text, paddingVertical: 0 },
    rowValue: { fontSize: FontSizes.md, color: c.text, fontWeight: '500' },
    accGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    accChip: {
      paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
      borderRadius: Radius.md, backgroundColor: c.filterInactive,
    },
    accChipActive: { backgroundColor: c.primary },
    accChipText: { fontSize: FontSizes.sm, fontWeight: '600', color: c.textSecondary },
    accChipTextActive: { color: '#FFFFFF' },
    saveBtn: {
      margin: Spacing.lg, backgroundColor: c.primary,
      borderRadius: Radius.lg, paddingVertical: Spacing.lg,
      alignItems: 'center',
    },
    saveBtnText: { fontSize: FontSizes.lg, fontWeight: '700', color: '#FFFFFF' },
  });
}

export default function AddTransactionScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useSettings();
  const S = makeStyles(colors);

  const [tab, setTab] = useState<Tab>('EXPENSE');
  const [amount, setAmount] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<AccountWithGroups[]>([]);
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [selectedAcc, setSelectedAcc] = useState<number | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  const [selectedToAcc, setSelectedToAcc] = useState<number | null>(null);
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    (async () => {
      const [cats, accs] = await Promise.all([getCategories(db), getAccountsWithGroups(db)]);
      setCategories(cats);
      setAccounts(accs);
      if (accs.length > 0) {
        setSelectedAcc(accs[0].id);
        setSelectedGroup(pickDefaultGroup(accs[0]));
      }
    })();
  }, [db]);

  const filteredCats = categories.filter(c => c.type === tab);
  const accountGroups = accounts.find(a => a.id === selectedAcc)?.groups ?? [];

  // Groups are mandatory; default to the account's Cash group (or its first group).
  const pickDefaultGroup = (acc?: AccountWithGroups): number | null => {
    const grps = acc?.groups ?? [];
    return grps.find(g => g.name.toLowerCase() === 'cash')?.id ?? grps[0]?.id ?? null;
  };

  const selectAccount = (id: number) => {
    setSelectedAcc(id);
    setSelectedGroup(pickDefaultGroup(accounts.find(a => a.id === id))); // group choices are scoped to the account
  };

  const handleSave = async () => {
    // Haptic feedback on save attempt
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const cents = Math.round(parseFloat(amount) * 100);
    if (!amount || isNaN(cents) || cents <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }

    if (tab === 'TRANSFER') {
      if (!selectedAcc || !selectedToAcc) {
        Alert.alert('Select Accounts', 'Please choose both a "from" and "to" account.');
        return;
      }
      if (selectedAcc === selectedToAcc) {
        Alert.alert('Same Account', 'Choose two different accounts to transfer between.');
        return;
      }
      await addTransfer(db, selectedAcc, selectedToAcc, cents, format(date, 'yyyy-MM-dd'), note);
      router.back();
      return;
    }

    if (!selectedCat) {
      Alert.alert('Select Category', 'Please select a category.');
      return;
    }
    if (!selectedAcc) {
      Alert.alert('Select Account', 'Please select an account.');
      return;
    }
    if (!selectedGroup) {
      Alert.alert('Select Group', 'Please select a group for this transaction.');
      return;
    }

    await addTransaction(db, selectedAcc, selectedCat, cents, format(date, 'yyyy-MM-dd'), note, selectedGroup);
    router.back();
  };

  return (
    <KeyboardAvoidingView style={S.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

          {/* Add Haptics to Tabs */}
          <View style={S.tabRow}>
            {(['EXPENSE', 'INCOME', 'TRANSFER'] as Tab[]).map(t => (
              <TouchableOpacity
                key={t}
                style={[S.tab, tab === t && S.tabActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setTab(t);
                  setSelectedCat(null);
                }}>
                <Text style={[S.tabText, tab === t && S.tabTextActive]}>
                  {t === 'INCOME' ? 'Income' : t === 'EXPENSE' ? 'Expense' : 'Transfer'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Auto-focus the Amount Input */}
          <View style={S.section}>
            <Text style={S.label}>Amount</Text>
            <TextInput
              style={S.amountInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              autoFocus={true} // Pops the keyboard immediately
            />
          </View>

        {/* Category (income/expense only) */}
        {tab !== 'TRANSFER' && (
          <View style={S.section}>
            <Text style={S.label}>Category</Text>
            <View style={S.catGrid}>
              {filteredCats.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[S.catChip, selectedCat === cat.id && S.catChipActive]}
                  onPress={() => setSelectedCat(cat.id)}
                >
                  <MaterialIcons name={cat.icon_name as any} size={18} color={selectedCat === cat.id ? '#FFFFFF' : colors.textSecondary} />
                  <Text style={[S.catChipText, selectedCat === cat.id && S.catChipTextActive]}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Account — single for income/expense, From for transfer */}
        <View style={S.section}>
          <Text style={S.label}>{tab === 'TRANSFER' ? 'From Account' : 'Account'}</Text>
          <View style={S.accGrid}>
            {accounts.map(acc => (
              <TouchableOpacity
                key={acc.id}
                style={[S.accChip, selectedAcc === acc.id && S.accChipActive]}
                onPress={() => selectAccount(acc.id)}
              >
                <Text style={[S.accChipText, selectedAcc === acc.id && S.accChipTextActive]}>{acc.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Group (income/expense only, when the account has groups) */}
        {tab !== 'TRANSFER' && accountGroups.length > 0 && (
          <View style={S.section}>
            <Text style={S.label}>Group</Text>
            <View style={S.accGrid}>
              {accountGroups.map(g => (
                <TouchableOpacity
                  key={g.id}
                  style={[S.accChip, selectedGroup === g.id && S.accChipActive]}
                  onPress={() => setSelectedGroup(g.id)}
                >
                  <Text style={[S.accChipText, selectedGroup === g.id && S.accChipTextActive]}>{g.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* To Account (transfer only) */}
        {tab === 'TRANSFER' && (
          <View style={S.section}>
            <Text style={S.label}>To Account</Text>
            <View style={S.accGrid}>
              {accounts.map(acc => {
                const disabled = acc.id === selectedAcc;
                return (
                  <TouchableOpacity
                    key={acc.id}
                    disabled={disabled}
                    style={[S.accChip, selectedToAcc === acc.id && S.accChipActive, disabled && { opacity: 0.4 }]}
                    onPress={() => setSelectedToAcc(acc.id)}
                  >
                    <Text style={[S.accChipText, selectedToAcc === acc.id && S.accChipTextActive]}>{acc.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Date & Note */}
        <View style={S.section}>
          <Text style={S.label}>Details</Text>
          <View style={S.card}>
            <TouchableOpacity style={S.row} onPress={() => setShowDatePicker(true)}>
              <MaterialIcons name="event" size={22} color={colors.primary} style={S.rowIcon} />
              <Text style={S.rowValue}>{format(date, 'MMM d, yyyy')}</Text>
            </TouchableOpacity>
            <View style={[S.row, S.rowLast]}>
              <MaterialIcons name="notes" size={22} color={colors.primary} style={S.rowIcon} />
              <TextInput
                style={S.rowInput}
                value={note}
                onChangeText={setNote}
                placeholder="Add a note..."
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={date}
            mode="date"
            onChange={(_, d) => { setShowDatePicker(false); if (d) setDate(d); }}
          />
        )}

        {/* Save */}
        <TouchableOpacity style={S.saveBtn} onPress={handleSave}>
          <Text style={S.saveBtnText}>Save Transaction</Text>
        </TouchableOpacity>
      </ScrollView>
    </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}
