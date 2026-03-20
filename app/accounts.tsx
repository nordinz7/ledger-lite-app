// app/accounts.tsx
import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { Account, getAllAccounts } from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    listContent: { padding: Spacing.lg, paddingBottom: 80 },
    card: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: c.card, borderRadius: Radius.lg, padding: Spacing.lg,
      marginBottom: Spacing.sm, elevation: 1,
    },
    inactiveCard: { opacity: 0.6 },
    info: { flex: 1 },
    name: { fontSize: FontSizes.lg, fontWeight: '600', color: c.text },
    balance: { fontSize: FontSizes.md, color: c.textMuted, marginTop: 4 },
    badge: {
      fontSize: FontSizes.xs, fontWeight: '700', color: '#fff',
      backgroundColor: c.textMuted, paddingHorizontal: 6, paddingVertical: 2,
      borderRadius: Radius.sm, alignSelf: 'flex-start', marginTop: 4
    },
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

export default function AccountsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors, currencySymbol } = useSettings();
  const S = makeStyles(colors);

  const [accounts, setAccounts] = useState<Account[]>([]);

  useFocusEffect(
    useCallback(() => {
      getAllAccounts(db).then(setAccounts);
    }, [db])
  );

  return (
    <View style={S.container}>
      <FlatList
        data={accounts}
        contentContainerStyle={S.listContent}
        keyExtractor={(item) => String(item.id)}
        ListEmptyComponent={<Text style={S.emptyText}>No accounts found</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[S.card, !item.is_active && S.inactiveCard]}
            onPress={() => router.push({ pathname: '/edit-account', params: { id: item.id, name: item.name, isActive: item.is_active } })}
          >
            <View style={S.info}>
              <Text style={S.name}>{item.name}</Text>
              <Text style={S.balance}>Balance: {currencySymbol}{item.balance.toLocaleString()}</Text>
              {!item.is_active && <Text style={S.badge}>INACTIVE</Text>}
            </View>
            <MaterialIcons name="edit" size={22} color={colors.textMuted} style={S.chevron} />
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity style={S.fab} onPress={() => router.push('/add-account')}>
        <MaterialIcons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}