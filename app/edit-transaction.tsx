import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { Account, Category, getAccounts, getCategories, updateTransaction, deleteTransaction } from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
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

export default function EditTransactionScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useSettings();
  const S = makeStyles(colors);
  const { id } = useLocalSearchParams<{ id: string }>();

  const [tab, setTab] = useState<Tab>('EXPENSE');
  const [amount, setAmount] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [selectedAcc, setSelectedAcc] = useState<number | null>(null);
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [note, setNote] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [cats, accs] = await Promise.all([getCategories(db), getAccounts(db)]);
      setCategories(cats);
      setAccounts(accs);

      // Load existing transaction
      const txn = await db.getFirstAsync<{
        id: number; account_id: number; category_id: number; amount: number;
        transaction_date: string; note: string;
      }>('SELECT * FROM transactions WHERE id = ?', Number(id));

      if (txn) {
        setAmount((txn.amount / 100).toFixed(2));
        setSelectedCat(txn.category_id);
        setSelectedAcc(txn.account_id);
        setDate(new Date(txn.transaction_date));
        setNote(txn.note);

        const cat = cats.find(c => c.id === txn.category_id);
        if (cat) setTab(cat.type);
      }
      setLoaded(true);
    })();
  }, [db, id]);

  const filteredCats = categories.filter(c => c.type === tab);

  const handleSave = async () => {
    const cents = Math.round(parseFloat(amount) * 100);
    if (!amount || isNaN(cents) || cents <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }
    if (!selectedCat || !selectedAcc) {
      Alert.alert('Missing Fields', 'Please select a category and account.');
      return;
    }

    await updateTransaction(db, Number(id), selectedAcc, selectedCat, cents, format(date, 'yyyy-MM-dd'), note);
    router.back();
  };

  const handleDelete = () => {
    Alert.alert('Delete Transaction', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deleteTransaction(db, Number(id));
          router.back();
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
            <TouchableOpacity key={t} style={[S.tab, tab === t && S.tabActive]} onPress={() => { setTab(t); setSelectedCat(null); }}>
              <Text style={[S.tabText, tab === t && S.tabTextActive]}>
                {t === 'INCOME' ? 'Income' : 'Expense'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={S.section}>
          <Text style={S.label}>Amount</Text>
          <TextInput
            style={S.amountInput}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
          />
        </View>

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

        <View style={S.section}>
          <Text style={S.label}>Account</Text>
          <View style={S.accGrid}>
            {accounts.map(acc => (
              <TouchableOpacity
                key={acc.id}
                style={[S.accChip, selectedAcc === acc.id && S.accChipActive]}
                onPress={() => setSelectedAcc(acc.id)}
              >
                <Text style={[S.accChipText, selectedAcc === acc.id && S.accChipTextActive]}>{acc.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

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
