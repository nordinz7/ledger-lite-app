import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { createAndShareBackup, pickAndRestoreBackup } from '@/utils/backup';
import { MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    section: { margin: Spacing.lg, marginBottom: 0 },
    sectionTitle: { fontSize: FontSizes.sm, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm, paddingHorizontal: Spacing.sm },
    card: { backgroundColor: c.card, borderRadius: Radius.lg, overflow: 'hidden', elevation: 1 },
    row: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
      borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    rowLast: { borderBottomWidth: 0 },
    rowIcon: { marginRight: Spacing.lg },
    rowLabel: { flex: 1, fontSize: FontSizes.lg, color: c.text, fontWeight: '500' },
    currencyInput: {
      fontSize: FontSizes.lg,
      color: c.text,
      fontWeight: '600',
      paddingVertical: 0,
      minWidth: 40,
      textAlign: 'right',
    },
    appInfoCard: {
      margin: Spacing.lg, backgroundColor: c.card,
      borderRadius: Radius.lg, padding: Spacing.xl, alignItems: 'center',
    },
    appName: { fontSize: FontSizes.xxl, fontWeight: '800', color: c.text, marginTop: Spacing.md },
    appVersion: { fontSize: FontSizes.sm, color: c.textMuted, marginTop: Spacing.xs },
  });
}

export default function SettingsScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { colors, isDark, toggleTheme, currencySymbol, setCurrencySymbol } = useSettings();
  const S = makeStyles(colors);

  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);

  const handleSaveBackup = async () => {
    setBackupLoading(true);
    try {
      await createAndShareBackup(db);
    } catch {
      Alert.alert('Backup Failed', 'An error occurred while creating the backup.');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestore = async () => {
    Alert.alert(
      'Restore Backup',
      'This will replace ALL current data with the backup. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            setRestoreLoading(true);
            try {
              const result = await pickAndRestoreBackup(db);
              if (result) {
                Alert.alert('Restored', `Restored ${result.accounts} accounts, ${result.categories} categories, ${result.transactions} transactions.`);
              }
            } catch {
              Alert.alert('Restore Failed', 'An error occurred while restoring the backup.');
            } finally {
              setRestoreLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={S.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Appearance */}
      <View style={S.section}>
        <Text style={S.sectionTitle}>Appearance</Text>
        <View style={S.card}>
          <View style={[S.row, S.rowLast]}>
            <MaterialIcons name="brightness-6" size={24} color={colors.primary} style={S.rowIcon} />
            <Text style={S.rowLabel}>Dark Mode</Text>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>
      </View>

      <View style={S.section}>
        <Text style={S.sectionTitle}>Accounts</Text>
        <View style={S.card}>
          <TouchableOpacity style={[S.row, S.rowLast]} onPress={() => router.push({ pathname: '/accounts' })}>
            <MaterialIcons name="account-balance" size={24} color={colors.primary} style={S.rowIcon} />
            <Text style={S.rowLabel}>Manage</Text>
            <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Currency */}
      <View style={S.section}>
        <Text style={S.sectionTitle}>Currency</Text>
        <View style={S.card}>
          <View style={[S.row, S.rowLast]}>
            <MaterialIcons name="attach-money" size={24} color={colors.primary} style={S.rowIcon} />
            <Text style={S.rowLabel}>Symbol</Text>
            <TextInput
              style={S.currencyInput}
              value={currencySymbol}
              onChangeText={setCurrencySymbol}
              placeholder="$"
              placeholderTextColor={colors.textMuted}
              maxLength={5}
            />
          </View>
        </View>
      </View>

      {/* Backup */}
      <View style={S.section}>
        <Text style={S.sectionTitle}>Backup</Text>
        <View style={S.card}>
          <TouchableOpacity style={S.row} onPress={handleSaveBackup} disabled={backupLoading}>
            <MaterialIcons name="cloud-upload" size={24} color={colors.primary} style={S.rowIcon} />
            <Text style={S.rowLabel}>Export</Text>
            {backupLoading
              ? <ActivityIndicator color={colors.primary} size="small" />
              : <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
            }
          </TouchableOpacity>
          <TouchableOpacity style={[S.row, S.rowLast]} onPress={handleRestore} disabled={restoreLoading}>
            <MaterialIcons name="cloud-download" size={24} color={colors.primary} style={S.rowIcon} />
            <Text style={S.rowLabel}>Restore</Text>
            {restoreLoading
              ? <ActivityIndicator color={colors.primary} size="small" />
              : <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
            }
          </TouchableOpacity>
        </View>
      </View>

      {/* App info */}
      <View style={S.appInfoCard}>
        <MaterialIcons name="account-balance-wallet" size={48} color={colors.primary} />
        <Text style={S.appName}>Ledger Lite</Text>
        <Text style={S.appVersion}>v{Constants.expoConfig?.version ?? '1.0.0'}</Text>
      </View>
    </ScrollView>
  );
}
