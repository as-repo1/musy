import React from 'react';
import { LayoutGrid, Check } from 'lucide-react';

interface ThemePreset {
  id: string;
  name: string;
  bg: string;
  accent: string;
  isDark: boolean;
}

const THEME_PRESETS: ThemePreset[] = [
  { id: 'nord', name: 'Nord Arctic', bg: '#2e3440', accent: '#88c0d0', isDark: true },
  { id: 'tokyo-night', name: 'Tokyo Night', bg: '#1a1b26', accent: '#7aa2f7', isDark: true },
  { id: 'dracula', name: 'Dracula', bg: '#282a36', accent: '#bd93f9', isDark: true },
  { id: 'gruvbox-dark', name: 'Gruvbox Dark', bg: '#282828', accent: '#fabd2f', isDark: true },
  { id: 'gruvbox-light', name: 'Gruvbox Light', bg: '#fbf1c7', accent: '#af3a03', isDark: false },
  { id: 'material-dark', name: 'Material Dark', bg: '#141218', accent: '#d0bcff', isDark: true },
  { id: 'material-light', name: 'Material Light', bg: '#fdf7ff', accent: '#6750a4', isDark: false },
];

interface ThemeSelectorProps {
  currentTheme: string;
  onChangeTheme: (themeId: string) => void;
  onClose?: () => void;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  currentTheme,
  onChangeTheme,
  onClose,
}) => {
  return (
    <div className="theme-selector-container" style={styles.container}>
      <div style={styles.header}>
        <div style={styles.titleWrapper}>
          <LayoutGrid size={18} style={{ marginRight: '8px' }} />
          <h3 style={styles.title}>Select Theme</h3>
        </div>
        {onClose && (
          <button onClick={onClose} style={styles.closeBtn}>
            &times;
          </button>
        )}
      </div>

      <div style={styles.grid}>
        {THEME_PRESETS.map(theme => (
          <button
            key={theme.id}
            onClick={() => onChangeTheme(theme.id)}
            style={{
              ...styles.themeButton,
              backgroundColor: theme.bg,
              color: theme.isDark ? '#eceff4' : '#282828',
              borderColor: currentTheme === theme.id ? theme.accent : 'var(--border)',
            }}
          >
            <div style={styles.colorIndicator}>
              <span style={{ ...styles.swatch, backgroundColor: theme.accent }} />
            </div>
            <span style={styles.themeName}>{theme.name}</span>
            {currentTheme === theme.id && (
              <Check size={16} style={{ color: theme.accent, marginLeft: 'auto' }} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '20px',
    backgroundColor: 'var(--bg-panel)',
    borderRadius: '16px',
    border: '1px solid var(--border)',
    maxWidth: '320px',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid var(--border)',
    paddingBottom: '10px',
  },
  titleWrapper: {
    display: 'flex',
    alignItems: 'center',
    color: 'var(--text)',
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: '22px',
    cursor: 'pointer',
    padding: '0 4px',
  },
  grid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '280px',
    overflowY: 'auto',
  },
  themeButton: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 14px',
    borderRadius: '12px',
    border: '2px solid transparent',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'transform 0.15s ease, border-color 0.2s ease',
    width: '100%',
  },
  colorIndicator: {
    display: 'flex',
    marginRight: '12px',
  },
  swatch: {
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    display: 'block',
  },
  themeName: {
    fontSize: '14px',
    fontWeight: 500,
  },
};
