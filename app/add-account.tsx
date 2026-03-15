import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { addAccount } from '@/services/database';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

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
    saveBtn: {
      margin: Spacing.lg, backgroundColor: c.primary,
      borderRadius: Radius.lg, paddingVertical: Spacing.lg,
      alignItems: 'center',
    },
    saveBtnText: { fontSize: FontSizes.lg, fontWeight: '700', color: '#FFFFFF' },
  });
}

export default function AddAccountScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useSettings();
  const S = makeStyles(colors);

  const [name, setName] = useState('');

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Missing Name', 'Please enter an account name.');
      return;
    }
    await addAccount(db, name.trim());
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
          autoFocus
        />
      </View>
      <TouchableOpacity style={S.saveBtn} onPress={handleSave}>
        <Text style={S.saveBtnText}>Add Account</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}
