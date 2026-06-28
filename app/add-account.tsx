import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { AccountGroup, accountGroupExists, addAccount, addAccountGroup, getAccountGroups, getDefaultGroupId } from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    section: { margin: Spacing.lg },
    label: { fontSize: FontSizes.sm, fontWeight: '600', color: c.textMuted, marginBottom: Spacing.sm },
    input: {
      backgroundColor: c.card, borderRadius: Radius.lg,
      paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
      fontSize: FontSizes.lg, color: c.text, fontWeight: '600',
    },
    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    chip: {
      paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
      borderRadius: Radius.md, backgroundColor: c.filterInactive,
    },
    chipActive: { backgroundColor: c.primary },
    chipText: { fontSize: FontSizes.sm, fontWeight: '600', color: c.textSecondary },
    chipTextActive: { color: '#FFFFFF' },
    newRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
    newInput: {
      flex: 1, backgroundColor: c.card, borderRadius: Radius.lg,
      paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
      fontSize: FontSizes.md, color: c.text,
    },
    newBtn: {
      width: 44, height: 44, borderRadius: Radius.lg,
      backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center',
    },
    saveBtn: {
      margin: Spacing.lg, backgroundColor: c.primary,
      borderRadius: Radius.lg, paddingVertical: Spacing.lg,
      alignItems: 'center',
    },
    saveBtnText: { fontSize: FontSizes.lg, fontWeight: '700', color: '#FFFFFF' },
    hint: { fontSize: FontSizes.sm, color: c.textMuted, marginTop: Spacing.sm },
  });
}

export default function AddAccountScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useSettings();
  const S = makeStyles(colors);

  const [name, setName] = useState('');
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [newGroup, setNewGroup] = useState('');

  useFocusEffect(
    useCallback(() => {
      getAccountGroups(db).then(grps => {
        setGroups(grps);
        // Default new accounts to the Cash group (groups are mandatory).
        setSelectedGroupIds(prev => {
          if (prev.length > 0) return prev;
          const cash = grps.find(g => g.name.toLowerCase() === 'cash');
          return cash ? [cash.id] : [];
        });
      });
    }, [db])
  );

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
    // Groups are mandatory — fall back to the default Cash group if none picked.
    const ids = selectedGroupIds.length > 0 ? selectedGroupIds : [await getDefaultGroupId(db)];
    await addAccount(db, name.trim(), ids);
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
            autoFocus
          />
        </View>

        <View style={S.section}>
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
          <Text style={S.hint}>At least one group is required (defaults to Cash). Each transaction is filed under one of them.</Text>
        </View>

        <TouchableOpacity style={S.saveBtn} onPress={handleSave}>
          <Text style={S.saveBtnText}>Add Account</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
