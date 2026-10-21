import * as Application from 'expo-application';
import { storage } from './storage';
import { Platform } from 'react-native';

/** A stable per-install id, used only to limit the free-minutes offer to one per device. */
export async function deviceId(): Promise<string> {
  try {
    if (Platform.OS === 'android') return `a:${Application.getAndroidId()}`;
    if (Platform.OS === 'web') throw new Error('web');
    const v = await Application.getIosIdForVendorAsync();
    if (v) return `i:${v}`;
  } catch { /* fall through */ }
  let id = await storage.get('taara.device');
  if (!id) { id = `r:${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`; await storage.set('taara.device', id); }
  return id;
}
