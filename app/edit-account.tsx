// app/edit-account.tsx
import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { AccountGroup, accountGroupExists, addAccountGroup, getAccountGroups, getDefaultGroupId, toggleAccountActive, updateAccount } from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    section: { margin: Spacing.lg },
    label: { fontSize: FontSizes.sm, fontWeight: '600', color: c.textMuted, marginBottom: Spacing.sm },
    input: {
      backgroundColor: c.card, borderRadius: Radius.lg,
      paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
      fontSize: FontSizes.lg, color: c.text, fontWeight: '600',
      marginBottom: Spacing.lg,
    },
    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    chip: {
      paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
      borderRadius: Radius.md, backgroundColor: c.filterInactive,
    },
    chipActive: { backgroundColor: c.primary },
    chipText: { fontSize: FontSizes.sm, fontWeight: '600', color: c.textSecondary },
    chipTextActive: { color: '#FFFFFF' },
    newRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md, marginBottom: Spacing.lg },
    newInput: {
      flex: 1, backgroundColor: c.card, borderRadius: Radius.lg,
      paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
      fontSize: FontSizes.md, color: c.text,
    },
    newBtn: {
      width: 44, height: 44, borderRadius: Radius.lg,
      backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center',
    },
    rowCard: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.card, borderRadius: Radius.lg,
      paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
    },
    rowLabel: { fontSize: FontSizes.lg, color: c.text, fontWeight: '500' },
    saveBtn: {
      margin: Spacing.lg, backgroundColor: c.primary,
      borderRadius: Radius.lg, paddingVertical: Spacing.lg,
      alignItems: 'center',
    },
    saveBtnText: { fontSize: FontSizes.lg, fontWeight: '700', color: '#FFFFFF' },
  });
}

export default function EditAccountScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useSettings();
  const S = makeStyles(colors);

  const params = useLocalSearchParams<{ id: string, name: string, isActive: string }>();

  const [name, setName] = useState(params.name || '');
  const [isActive, setIsActive] = useState(params.isActive === '1');
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [newGroup, setNewGroup] = useState('');

  useEffect(() => {
    (async () => {
      setGroups(await getAccountGroups(db));
      const links = await db.getAllAsync<{ group_id: number }>(
        'SELECT group_id FROM account_group_links WHERE account_id = ?', Number(params.id)
      );
      setSelectedGroupIds(links.map(l => l.group_id));
    })();
  }, [db, params.id]);

  const toggleGroup = (id: number) => {
    setSelectedGroupIds(prev => (prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]));
  };

  const handleAddGroup = async () => {
    const trimmed = newGroup.trim();
    if (!trimmed) return;
    if (await accountGroupExists(db, trimmed)) {
      Alert.alert('Duplicate Name', 'A group with this name already exists.');
      return;
    }
    const id = await addAccountGroup(db, trimmed);
    setNewGroup('');
    setGroups(await getAccountGroups(db));
    setSelectedGroupIds(prev => [...prev, id]);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Missing Name', 'Please enter an account name.');
      return;
    }
    const accountId = Number(params.id);
    // Groups are mandatory — fall back to the default Cash group if none picked.
    const ids = selectedGroupIds.length > 0 ? selectedGroupIds : [await getDefaultGroupId(db)];
    await updateAccount(db, accountId, name.trim(), ids);
    await toggleAccountActive(db, accountId, isActive);
    router.back();
  };

  return (
    <KeyboardAvoidingView style={S.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={S.section}>
          <Text style={S.label}>Account Name</Text>
          <TextInput
            style={S.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Child A, Mum"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={S.label}>Groups</Text>
          <View style={S.chipGrid}>
            {groups.map(g => {
              const active = selectedGroupIds.includes(g.id);
              return (
                <TouchableOpacity key={g.id} style={[S.chip, active && S.chipActive]} onPress={() => toggleGroup(g.id)}>
                  <Text style={[S.chipText, active && S.chipTextActive]}>{g.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={S.newRow}>
            <TextInput
              style={S.newInput}
              value={newGroup}
              onChangeText={setNewGroup}
              placeholder="New group, e.g. Cash"
              placeholderTextColor={colors.textMuted}
              onSubmitEditing={handleAddGroup}
              returnKeyType="done"
            />
            <TouchableOpacity style={S.newBtn} onPress={handleAddGroup}>
              <MaterialIcons name="add" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <Text style={S.label}>Status</Text>
          <View style={S.rowCard}>
            <Text style={S.rowLabel}>Active Account</Text>
            <Switch
              value={isActive}
              onValueChange={setIsActive}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
          <Text style={{ fontSize: FontSizes.sm, color: colors.textMuted, marginTop: Spacing.sm }}>
            Inactive accounts will be hidden when adding new transactions.
          </Text>
        </View>

        <TouchableOpacity style={S.saveBtn} onPress={handleSave}>
          <Text style={S.saveBtnText}>Save Changes</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
