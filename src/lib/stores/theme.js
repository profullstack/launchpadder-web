/**
 * Theme store for managing light/dark mode
 * Provides reactive theme state with persistence
 */
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// Theme types
export const THEMES = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system'
};

// Create theme store with initial value
function createThemeStore() {
  const { subscribe, set, update } = writable(THEMES.SYSTEM);

  return {
    subscribe,
    
    // Set theme and persist to localStorage
    setTheme: (theme) => {
      if (!Object.values(THEMES).includes(theme)) {
        console.warn(`Invalid theme: ${theme}`);
        return;
      }
      
      set(theme);
      
      if (browser) {
        localStorage.setItem('theme-preference', theme);
        applyTheme(theme);
      }
    },
    
    // Initialize theme from localStorage or system preference
    init: () => {
      if (!browser) return;
      
      const stored = localStorage.getItem('theme-preference');
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      
      let initialTheme = THEMES.SYSTEM;
      
      if (stored && Object.values(THEMES).includes(stored)) {
        initialTheme = stored;
      }
      
      set(initialTheme);
      applyTheme(initialTheme);
      
      // Listen for system theme changes
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', (e) => {
        update(currentTheme => {
          if (currentTheme === THEMES.SYSTEM) {
            applyTheme(THEMES.SYSTEM);
          }
          return currentTheme;
        });
      });
    },
    
    // Toggle between light and dark (skip system)
    toggle: () => {
      update(currentTheme => {
        const newTheme = currentTheme === THEMES.LIGHT ? THEMES.DARK : THEMES.LIGHT;
        
        if (browser) {
          localStorage.setItem('theme-preference', newTheme);
          applyTheme(newTheme);
        }
        
        return newTheme;
      });
    },
    
    // Get the actual applied theme (resolves system preference)
    getAppliedTheme: (theme) => {
      if (theme === THEMES.SYSTEM && browser) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? THEMES.DARK : THEMES.LIGHT;
      }
      return theme;
    }
  };
}

// Apply theme to document
function applyTheme(theme) {
  if (!browser) return;
  
  const root = document.documentElement;
  const actualTheme = theme === THEMES.SYSTEM 
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? THEMES.DARK : THEMES.LIGHT)
    : theme;
  
  // Remove existing theme classes
  root.classList.remove('theme-light', 'theme-dark');
  
  // Add new theme class
  root.classList.add(`theme-${actualTheme}`);
  
  // Update meta theme-color for mobile browsers
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', actualTheme === THEMES.DARK ? '#1f2937' : '#2563eb');
  }
  
  // Dispatch custom event for other components
  window.dispatchEvent(new CustomEvent('theme-changed', { 
    detail: { theme: actualTheme } 
  }));
}

// Export the store instance
export const themeStore = createThemeStore();

// Utility functions
export function getSystemTheme() {
  if (!browser) return THEMES.LIGHT;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? THEMES.DARK : THEMES.LIGHT;
}

export function isThemeDark(theme) {
  if (theme === THEMES.SYSTEM) {
    return getSystemTheme() === THEMES.DARK;
  }
  return theme === THEMES.DARK;
}

export function getThemeIcon(theme) {
  switch (theme) {
    case THEMES.LIGHT:
      return 'sun';
    case THEMES.DARK:
      return 'moon';
    case THEMES.SYSTEM:
      return 'monitor';
    default:
      return 'monitor';
  }
}

export function getThemeLabel(theme) {
  switch (theme) {
    case THEMES.LIGHT:
      return 'Light';
    case THEMES.DARK:
      return 'Dark';
    case THEMES.SYSTEM:
      return 'System';
    default:
      return 'System';
  }
}