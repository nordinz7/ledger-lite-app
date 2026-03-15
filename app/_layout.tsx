import { SettingsProvider, useSettings } from '@/contexts/SettingsContext';
import { initDatabase } from '@/services/database';
import { saveLocalBackup } from '@/utils/backup';
import { Stack } from 'expo-router';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense, useEffect, useRef } from 'react';
import { ActivityIndicator, AppState, AppStateStatus, View } from 'react-native';

function InnerLayout() {
  const { colors } = useSettings();
  const db = useSQLiteContext();
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appState.current === 'active' && (next === 'inactive' || next === 'background')) {
        saveLocalBackup(db);
      }
      appState.current = next;
    });
    saveLocalBackup(db);
    return () => sub.remove();
  }, [db]);

  return (
    <>
      <StatusBar style={colors.statusBar} backgroundColor={colors.headerBg} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.headerBg },
          headerTintColor: colors.headerText,
          headerTitleStyle: { fontSize: 20, fontWeight: '700' },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="add-transaction"
          options={{ title: 'Add Transaction', presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="edit-transaction"
          options={{ title: 'Edit Transaction', presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="add-category"
          options={{ title: 'Add Category', presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="edit-category"
          options={{ title: 'Edit Category', presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="add-account"
          options={{ title: 'Add Account', presentation: 'modal', animation: 'slide_from_bottom' }}
        />
      </Stack>
    </>
  );
}

function LoadingFallback() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SettingsProvider>
      <Suspense fallback={<LoadingFallback />}>
        <SQLiteProvider databaseName="ledger-lite.db" onInit={initDatabase}>
          <InnerLayout />
        </SQLiteProvider>
      </Suspense>
    </SettingsProvider>
  );
}
