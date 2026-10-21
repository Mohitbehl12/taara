import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Keychain/Keystore on phones; localStorage on web (used for previews and the optional web build).
export const storage = {
  get: async (k: string): Promise<string | null> => {
    try { return Platform.OS === 'web' ? globalThis.localStorage?.getItem(k) ?? null : await SecureStore.getItemAsync(k); } catch { return null; }
  },
  set: async (k: string, v: string) => {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(k, v); else await SecureStore.setItemAsync(k, v);
  },
  del: async (k: string) => {
    if (Platform.OS === 'web') globalThis.localStorage?.removeItem(k); else await SecureStore.deleteItemAsync(k);
  },
};
