import { getAllDataForBackup, isValidBackup, restoreFromBackupData } from '@/services/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { differenceInDays, format } from 'date-fns';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Alert } from 'react-native';

const LAST_BACKUP_KEY = '@ledger_last_backup';
const LAST_LOCAL_BACKUP_KEY = '@ledger_last_local_backup';
const BACKUP_PREFIX = 'ledger-backup-';
const MAX_ROLLING_BACKUPS = 5;

// ─── Persistence helpers ──────────────────────────────────────────────────────

export async function saveLastBackupDate(): Promise<void> {
  await AsyncStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
}

export async function getLastBackupDate(): Promise<Date | null> {
  const raw = await AsyncStorage.getItem(LAST_BACKUP_KEY);
  return raw ? new Date(raw) : null;
}

export async function isBackupOverdue(): Promise<boolean> {
  const last = await getLastBackupDate();
  if (!last) return true;
  return differenceInDays(new Date(), last) >= 7;
}

// ─── Rolling auto backup ─────────────────────────────────────────────────────

function getRollingFilename(date: Date): string {
  return `${BACKUP_PREFIX}${format(date, 'yyyy-MM-dd')}.json`;
}

export function getLocalBackupFiles(): { uri: string; filename: string; date: string }[] {
  try {
    const dir = new Directory(Paths.document);
    const entries = dir.list();
    const backups: { uri: string; filename: string; date: string }[] = [];

    for (const entry of entries) {
      if (entry instanceof File && entry.name.startsWith(BACKUP_PREFIX) && entry.name.endsWith('.json')) {
        const dateStr = entry.name.replace(BACKUP_PREFIX, '').replace('.json', '');
        backups.push({ uri: entry.uri, filename: entry.name, date: dateStr });
      }
    }

    backups.sort((a, b) => b.date.localeCompare(a.date));
    return backups;
  } catch {
    return [];
  }
}

function pruneOldBackups(): void {
  const backups = getLocalBackupFiles();
  if (backups.length <= MAX_ROLLING_BACKUPS) return;

  for (let i = MAX_ROLLING_BACKUPS; i < backups.length; i++) {
    try {
      const file = new File(backups[i].uri);
      file.delete();
    } catch {
      // ignore
    }
  }
}

export async function saveLocalBackup(db: SQLiteDatabase): Promise<void> {
  try {
    const today = format(new Date(), 'yyyy-MM-dd');
    const lastRaw = await AsyncStorage.getItem(LAST_LOCAL_BACKUP_KEY);
    const lastDate = lastRaw ? lastRaw.slice(0, 10) : null;

    if (lastDate === today) return;

    const data = await getAllDataForBackup(db);
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      ...data,
    };
    const json = JSON.stringify(payload, null, 2);
    const file = new File(Paths.document, getRollingFilename(new Date()));
    file.write(json);

    await AsyncStorage.setItem(LAST_LOCAL_BACKUP_KEY, new Date().toISOString());
    pruneOldBackups();
  } catch (e) {
    console.warn('Auto local backup failed:', e);
  }
}

// ─── Share backup ─────────────────────────────────────────────────────────────

export async function createAndShareBackup(db: SQLiteDatabase): Promise<void> {
  try {
    const data = await getAllDataForBackup(db);
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      ...data,
    };
    const json = JSON.stringify(payload, null, 2);
    const dateStamp = format(new Date(), 'yyyy-MM-dd_HHmm');
    const fileName = `ledger-backup-${dateStamp}.json`;
    const file = new File(Paths.cache, fileName);
    file.write(json);

    const ok = await Sharing.isAvailableAsync();
    if (!ok) {
      Alert.alert('Sharing Not Available', 'Backup file saved locally.');
      return;
    }

    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Save Backup',
      UTI: 'public.json',
    });

    await saveLastBackupDate();
  } catch (error) {
    console.error('Backup error:', error);
    Alert.alert('Backup Failed', 'An error occurred while creating the backup.');
  }
}

// ─── Restore ──────────────────────────────────────────────────────────────────

export async function pickAndRestoreBackup(
  db: SQLiteDatabase,
): Promise<{ accounts: number; categories: number; transactions: number } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  const file = new File(asset.uri);
  const contents = await file.text();
  const parsed = JSON.parse(contents);

  if (!isValidBackup(parsed)) {
    Alert.alert('Invalid Backup', 'The selected file is not a valid Ledger Lite backup.');
    return null;
  }

  return restoreFromBackupData(db, parsed);
}
