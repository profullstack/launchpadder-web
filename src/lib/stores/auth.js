/**
 * Client-side Authentication Store
 * Manages authentication state using localStorage and Svelte stores
 */

import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

// Storage keys
const STORAGE_KEYS = {
  USER: 'auth_user',
  SESSION: 'auth_session',
  PROFILE: 'auth_profile'
};

// Create writable stores
export const user = writable(null);
export const session = writable(null);
export const userProfile = writable(null);

// Derived store for authentication status
export const isAuthenticated = derived(
  [user, session],
  ([$user, $session]) => {
    return !!(
      $user && 
      $session && 
      $session.access_token && 
      $session.expires_at && 
      new Date($session.expires_at * 1000) > new Date()
    );
  }
);

// Derived store for user display info
export const userDisplayInfo = derived(
  [user, userProfile],
  ([$user, $userProfile]) => {
    if (!$user) return null;
    
    const displayName = $userProfile?.full_name || $userProfile?.username || $user.email;
    const initials = getInitials(displayName);
    
    return {
      id: $user.id,
      email: $user.email,
      displayName,
      initials,
      avatarUrl: $userProfile?.avatar_url,
      username: $userProfile?.username,
      profile: $userProfile
    };
  }
);

/**
 * Generate initials from a name or email
 */
function getInitials(name) {
  if (!name) return '?';
  
  // If it's an email, use the part before @
  if (name.includes('@')) {
    name = name.split('@')[0];
  }
  
  // Split by spaces and take first letter of each word
  const parts = name.split(/[\s_-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  
  // Single word, take first two letters
  return name.substring(0, 2).toUpperCase();
}

/**
 * Load authentication data from localStorage
 */
function loadFromStorage() {
  if (!browser) return;
  
  try {
    const storedUser = localStorage.getItem(STORAGE_KEYS.USER);
    const storedSession = localStorage.getItem(STORAGE_KEYS.SESSION);
    const storedProfile = localStorage.getItem(STORAGE_KEYS.PROFILE);
    
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      user.set(userData);
    }
    
    if (storedSession) {
      const sessionData = JSON.parse(storedSession);
      
      // Check if session is still valid
      if (sessionData.expires_at && new Date(sessionData.expires_at * 1000) > new Date()) {
        session.set(sessionData);
      } else {
        // Session expired, clear it
        clearAuthData();
      }
    }
    
    if (storedProfile) {
      const profileData = JSON.parse(storedProfile);
      userProfile.set(profileData);
    }
  } catch (error) {
    console.error('Error loading auth data from localStorage:', error);
    clearAuthData();
  }
}

/**
 * Save authentication data to localStorage
 */
function saveToStorage(userData, sessionData, profileData) {
  if (!browser) return;
  
  try {
    if (userData) {
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userData));
    }
    
    if (sessionData) {
      localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(sessionData));
    }
    
    if (profileData) {
      localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profileData));
    }
  } catch (error) {
    console.error('Error saving auth data to localStorage:', error);
  }
}

/**
 * Clear all authentication data
 */
function clearAuthData() {
  if (!browser) return;
  
  try {
    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.SESSION);
    localStorage.removeItem(STORAGE_KEYS.PROFILE);
  } catch (error) {
    console.error('Error clearing auth data from localStorage:', error);
  }
  
  user.set(null);
  session.set(null);
  userProfile.set(null);
}

/**
 * Set authentication data (called after successful login)
 */
export function setAuthData(userData, sessionData, profileData = null) {
  user.set(userData);
  session.set(sessionData);
  userProfile.set(profileData);
  
  saveToStorage(userData, sessionData, profileData);
}

/**
 * Update user profile data
 */
export function updateUserProfile(profileData) {
  userProfile.set(profileData);
  saveToStorage(null, null, profileData);
}

/**
 * Clear authentication (logout)
 */
export function clearAuth() {
  clearAuthData();
}

/**
 * Get current access token
 */
export function getAccessToken() {
  if (!browser) return null;
  
  try {
    const storedSession = localStorage.getItem(STORAGE_KEYS.SESSION);
    if (!storedSession) return null;
    
    const sessionData = JSON.parse(storedSession);
    
    // Check if token is still valid
    if (sessionData.expires_at && new Date(sessionData.expires_at * 1000) > new Date()) {
      return sessionData.access_token;
    }
    
    // Token expired
    clearAuthData();
    return null;
  } catch (error) {
    console.error('Error getting access token:', error);
    return null;
  }
}

/**
 * Check if user is authenticated
 */
export function checkAuth() {
  return getAccessToken() !== null;
}

/**
 * Initialize the auth store (call this in app.html or layout)
 */
export function initAuth() {
  if (browser) {
    loadFromStorage();
  }
}

// Auto-initialize when the module loads in the browser
if (browser) {
  loadFromStorage();
}