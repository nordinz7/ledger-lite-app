import { AppColors, DarkColors, LightColors } from '@/constants/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';

interface SettingsContextValue {
  isDark: boolean;
  toggleTheme: () => void;
  colors: AppColors;
  currencySymbol: string;
  setCurrencySymbol: (v: string) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const THEME_KEY = '@ledger_theme';
const CURRENCY_SYMBOL_KEY = '@ledger_currency_symbol';

const DEFAULT_CURRENCY_SYMBOL = '$';

export function SettingsProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [isDark, setIsDark] = useState(false);
  const [currencySymbol, setCurrencySymbolState] = useState(DEFAULT_CURRENCY_SYMBOL);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const [storedTheme, storedCurrency] = await Promise.all([
        AsyncStorage.getItem(THEME_KEY),
        AsyncStorage.getItem(CURRENCY_SYMBOL_KEY),
      ]);
      if (storedTheme !== null) {
        setIsDark(storedTheme === 'dark');
      } else {
        setIsDark(systemScheme === 'dark');
      }
      if (storedCurrency !== null) setCurrencySymbolState(storedCurrency);
      setReady(true);
    })();
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark(prev => {
      const next = !prev;
      AsyncStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
      return next;
    });
  }, []);

  const setCurrencySymbol = useCallback((v: string) => {
    setCurrencySymbolState(v);
    AsyncStorage.setItem(CURRENCY_SYMBOL_KEY, v);
  }, []);

  const colors = isDark ? DarkColors : LightColors;

  if (!ready) return null;

  return (
    <SettingsContext.Provider value={{ isDark, toggleTheme, colors, currencySymbol, setCurrencySymbol }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
