import { theme } from 'antd';
import type { ThemeConfig } from 'antd';

const BASE = {
  borderRadius: 8,
  borderRadiusLG: 12,
  fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSize: 14,
} as const;

// ─── Light theme ──────────────────────────────────────────────────────────────
export const lightTheme: ThemeConfig = {
  token: {
    ...BASE,
    colorPrimary: '#4F46E5',    // indigo-600
    colorSuccess: '#15803D',    // green-700  (debit)
    colorError: '#B91C1C',      // red-700    (credit)
    colorWarning: '#B45309',    // amber-700
    colorInfo: '#1D4ED8',       // blue-700

    colorBgLayout: '#F4F6FB',
    colorBgContainer: '#FFFFFF',
    colorBgElevated: '#FFFFFF',

    colorText: '#1E293B',           // slate-800
    colorTextSecondary: '#64748B',  // slate-500
    colorTextTertiary: '#94A3B8',   // slate-400

    colorBorder: 'rgba(15, 23, 42, 0.10)',
    colorBorderSecondary: 'rgba(15, 23, 42, 0.06)',
  },
  components: {
    Layout: {
      siderBg: '#FFFFFF',
      headerBg: '#FFFFFF',
    },
    Menu: {
      itemBorderRadius: 6,
      itemColor: '#64748B',
      itemHoverColor: '#0F172A',
      itemSelectedColor: '#4F46E5',
      itemSelectedBg: '#EEF2FF',
      itemHoverBg: 'rgba(15, 23, 42, 0.04)',
    },
    Card: {
      borderRadiusLG: 12,
    },
    Table: {
      borderRadiusLG: 8,
    },
    Button: {
      fontWeight: 500,
    },
  },
};

// ─── Dark theme ───────────────────────────────────────────────────────────────
// Soft dark — #191C24 bg, not pitch black. Text #DDE3F0, not pure white.
export const darkTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    ...BASE,
    colorPrimary: '#818CF8',    // indigo-400 (softer on dark)
    colorSuccess: '#4ADE80',    // green-400  (debit dark)
    colorError: '#F87171',      // red-400    (credit dark)
    colorWarning: '#FCD34D',    // amber-300
    colorInfo: '#60A5FA',       // blue-400

    colorBgBase: '#191C24',
    colorBgLayout: '#191C24',
    colorBgContainer: '#1F2433',
    colorBgElevated: '#252B3B',

    colorText: '#DDE3F0',           // soft white
    colorTextSecondary: '#8893AE',  // muted blue-gray
    colorTextTertiary: '#5E6D8A',

    colorBorder: 'rgba(255, 255, 255, 0.09)',
    colorBorderSecondary: 'rgba(255, 255, 255, 0.05)',
  },
  components: {
    Layout: {
      siderBg: '#1F2433',
      headerBg: '#1F2433',
    },
    Menu: {
      itemBorderRadius: 6,
      itemColor: '#8893AE',
      itemHoverColor: '#DDE3F0',
      itemSelectedColor: '#A5B4FC',
      itemSelectedBg: 'rgba(129, 140, 248, 0.12)',
      itemHoverBg: 'rgba(255, 255, 255, 0.05)',
      // dark-mode specific overrides
      darkItemBg: '#1F2433',
      darkItemColor: '#8893AE',
      darkItemHoverColor: '#DDE3F0',
      darkItemSelectedBg: 'rgba(129, 140, 248, 0.12)',
      darkItemSelectedColor: '#A5B4FC',
      darkSubMenuItemBg: '#191C24',
    },
    Card: {
      borderRadiusLG: 12,
    },
    Table: {
      borderRadiusLG: 8,
    },
    Button: {
      fontWeight: 500,
    },
  },
};
