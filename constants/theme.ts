export const LightColors = {
  background: '#F0F4F8',
  card: '#FFFFFF',
  primary: '#1565C0',
  primaryLight: '#E3F2FD',
  danger: '#C62828',
  dangerLight: '#FFEBEE',
  success: '#2E7D32',
  successLight: '#E8F5E9',
  warning: '#F57F17',
  warningLight: '#FFF8E1',
  text: '#1A1A1A',
  textSecondary: '#555555',
  textMuted: '#888888',
  border: '#D0D7DE',
  separator: '#E8ECF0',
  statusBar: 'dark' as 'dark' | 'light',
  headerBg: '#1565C0',
  headerText: '#FFFFFF',
  inputBg: '#FFFFFF',
  filterInactive: '#E8ECF0',
};

export const DarkColors = {
  background: '#0D1117',
  card: '#161B22',
  primary: '#4A90E2',
  primaryLight: '#1C2A3A',
  danger: '#F47171',
  dangerLight: '#2D1F1F',
  success: '#56C97B',
  successLight: '#1A2D1F',
  warning: '#FFD54F',
  warningLight: '#2D2A1F',
  text: '#E6EDF3',
  textSecondary: '#8B949E',
  textMuted: '#6E7681',
  border: '#30363D',
  separator: '#21262D',
  statusBar: 'light' as 'dark' | 'light',
  headerBg: '#161B22',
  headerText: '#E6EDF3',
  inputBg: '#0D1117',
  filterInactive: '#21262D',
};

export type AppColors = typeof LightColors;

export const FontSizes = {
  xs: 13, sm: 15, md: 17, lg: 19, xl: 22, xxl: 26, xxxl: 30,
};

export const Spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28,
};

export const Radius = {
  sm: 6, md: 10, lg: 14, xl: 20,
};
