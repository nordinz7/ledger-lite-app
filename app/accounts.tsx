// app/accounts.tsx
import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import {
  AccountGroup,
  AccountWithGroups,
  accountGroupExists,
  addAccountGroup,
  deleteAccountGroup,
  getAccountGroups,
  getAccountsWithGroups,
  updateAccountGroup,
} from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    listContent: { padding: Spacing.lg, paddingBottom: 80 },

    sectionTitle: { fontSize: FontSizes.sm, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm },
    sectionHint: { fontSize: FontSizes.xs, color: c.textMuted, marginBottom: Spacing.sm },
    groupsCard: { backgroundColor: c.card, borderRadius: Radius.lg, overflow: 'hidden', elevation: 1, marginBottom: Spacing.xl },
    groupRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
      borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    groupName: { flex: 1, fontSize: FontSizes.md, fontWeight: '500', color: c.text },
    groupInput: {
      flex: 1, fontSize: FontSizes.md, color: c.text, fontWeight: '500',
      paddingVertical: 0,
    },
    iconBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 2 },
    defaultTag: { fontSize: FontSizes.xs, fontWeight: '600', color: c.textMuted, paddingHorizontal: Spacing.sm },
    addRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
    addInput: { flex: 1, fontSize: FontSizes.md, color: c.text, paddingVertical: 0 },
    emptyGroups: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, fontSize: FontSizes.sm, color: c.textMuted },

    accountsTitle: { fontSize: FontSizes.sm, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm },
    card: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: c.card, borderRadius: Radius.lg, padding: Spacing.lg,
      marginBottom: Spacing.sm, elevation: 1,
    },
    inactiveCard: { opacity: 0.6 },
    info: { flex: 1 },
    name: { fontSize: FontSizes.lg, fontWeight: '600', color: c.text },
    groupChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
    groupChip: {
      fontSize: FontSizes.xs, fontWeight: '600', color: c.primary,
      backgroundColor: c.filterInactive, paddingHorizontal: 8, paddingVertical: 2,
      borderRadius: Radius.sm, overflow: 'hidden',
    },
    balance: { fontSize: FontSizes.md, color: c.textMuted, marginTop: 4 },
    badge: {
      fontSize: FontSizes.xs, fontWeight: '700', color: '#fff',
      backgroundColor: c.textMuted, paddingHorizontal: 6, paddingVertical: 2,
      borderRadius: Radius.sm, alignSelf: 'flex-start', marginTop: 4
    },
    chevron: { marginLeft: Spacing.sm },
    emptyText: { fontSize: FontSizes.md, color: c.textMuted, textAlign: 'center', paddingVertical: Spacing.xxl },
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

  const [accounts, setAccounts] = useState<AccountWithGroups[]>([]);
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [newGroup, setNewGroup] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  const loadData = useCallback(async () => {
    const [accs, grps] = await Promise.all([getAccountsWithGroups(db, false), getAccountGroups(db)]);
    setAccounts(accs);
    setGroups(grps);
  }, [db]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const handleAddGroup = async () => {
    const trimmed = newGroup.trim();
    if (!trimmed) return;
    if (await accountGroupExists(db, trimmed)) {
      Alert.alert('Duplicate Name', 'A group with this name already exists.');
      return;
    }
    await addAccountGroup(db, trimmed);
    setNewGroup('');
    loadData();
  };

  const startEdit = (g: AccountGroup) => {
    setEditingId(g.id);
    setEditingName(g.name);
  };

  const handleRename = async () => {
    if (editingId === null) return;
    const trimmed = editingName.trim();
    if (!trimmed) { setEditingId(null); return; }
    if (await accountGroupExists(db, trimmed, editingId)) {
      Alert.alert('Duplicate Name', 'A group with this name already exists.');
      return;
    }
    await updateAccountGroup(db, editingId, trimmed);
    setEditingId(null);
    setEditingName('');
    loadData();
  };

  const handleDeleteGroup = (g: AccountGroup) => {
    Alert.alert(
      'Delete Group',
      `Delete "${g.name}"? It will be removed from all accounts.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const res = await deleteAccountGroup(db, g.id);
            if (!res.ok) {
              Alert.alert(
                'Cannot Delete',
                res.reason === 'cash'
                  ? 'Cash is the default group and cannot be deleted.'
                  : 'This group is used by existing transactions. Reassign those transactions first.'
              );
            } else {
              loadData();
            }
          },
        },
      ]
    );
  };

  const GroupsManager = (
    <View>
      <Text style={S.sectionTitle}>Groups</Text>
      <Text style={S.sectionHint}>Tags like Cash or Bank that you can attach to accounts and file transactions under.</Text>
      <View style={S.groupsCard}>
        {groups.length === 0 && <Text style={S.emptyGroups}>No groups yet — add one below.</Text>}
        {groups.map(g => (
          <View key={g.id} style={S.groupRow}>
            {editingId === g.id ? (
              <>
                <TextInput
                  style={S.groupInput}
                  value={editingName}
                  onChangeText={setEditingName}
                  autoFocus
                  onSubmitEditing={handleRename}
                  returnKeyType="done"
                  placeholderTextColor={colors.textMuted}
                />
                <TouchableOpacity style={S.iconBtn} onPress={handleRename}>
                  <MaterialIcons name="check" size={22} color={colors.success} />
                </TouchableOpacity>
                <TouchableOpacity style={S.iconBtn} onPress={() => { setEditingId(null); setEditingName(''); }}>
                  <MaterialIcons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </>
            ) : g.name.toLowerCase() === 'cash' ? (
              <>
                <Text style={S.groupName}>{g.name}</Text>
                <Text style={S.defaultTag}>Default</Text>
              </>
            ) : (
              <>
                <Text style={S.groupName}>{g.name}</Text>
                <TouchableOpacity style={S.iconBtn} onPress={() => startEdit(g)}>
                  <MaterialIcons name="edit" size={20} color={colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity style={S.iconBtn} onPress={() => handleDeleteGroup(g)}>
                  <MaterialIcons name="delete-outline" size={20} color={colors.danger} />
                </TouchableOpacity>
              </>
            )}
          </View>
        ))}
        <View style={[S.addRow, groups.length > 0 && { borderTopWidth: 1, borderTopColor: colors.separator }]}>
          <TextInput
            style={S.addInput}
            value={newGroup}
            onChangeText={setNewGroup}
            placeholder="Add a group, e.g. Cash"
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={handleAddGroup}
            returnKeyType="done"
          />
          <TouchableOpacity style={S.iconBtn} onPress={handleAddGroup}>
            <MaterialIcons name="add" size={24} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={S.accountsTitle}>Accounts</Text>
    </View>
  );

  return (
    <View style={S.container}>
      <FlatList
        data={accounts}
        contentContainerStyle={S.listContent}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={GroupsManager}
        ListEmptyComponent={<Text style={S.emptyText}>No accounts found</Text>}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[S.card, !item.is_active && S.inactiveCard]}
            onPress={() => router.push({ pathname: '/edit-account', params: { id: item.id, name: item.name, isActive: item.is_active } })}
          >
            <View style={S.info}>
              <Text style={S.name}>{item.name}</Text>
              {item.groups.length > 0 && (
                <View style={S.groupChipRow}>
                  {item.groups.map(g => <Text key={g.id} style={S.groupChip}>{g.name}</Text>)}
                </View>
              )}
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
