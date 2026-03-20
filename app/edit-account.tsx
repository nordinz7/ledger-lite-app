// app/edit-account.tsx
import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { updateAccount, toggleAccountActive } from '@/services/database';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';

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

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Missing Name', 'Please enter an account name.');
      return;
    }

    const accountId = Number(params.id);
    await updateAccount(db, accountId, name.trim());
    await toggleAccountActive(db, accountId, isActive);

    router.back();
  };

  return (
    <KeyboardAvoidingView style={S.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={S.section}>
        <Text style={S.label}>Account Name</Text>
        <TextInput
          style={S.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Bank Account"
          placeholderTextColor={colors.textMuted}
        />

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
    </KeyboardAvoidingView>
  );
}