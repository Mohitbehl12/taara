import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { fetch as expoFetch } from 'expo/fetch';
import { API_URL, ApiError, getToken } from './api';

export interface PalmFinding { key: string; visible: boolean; observation: string; meaning: string }
export interface PalmReading {
  id: string; hand: 'left' | 'right'; lang: string; status: string; createdAt: string;
  quick: { handShape: { type: string; observation: string; meaning: string }; lines: PalmFinding[]; summary: string };
  detailed: null | {
    mounts: PalmFinding[]; fingers: { observation: string; meaning: string }; markings: PalmFinding[];
    sections: { key: string; title: string; paragraphs: string[] }[];
  };
}

/** Camera or library → resized JPEG (keeps lines sharp while staying well under the 5 MB limit). Returns null if cancelled. */
export async function capturePalm(source: 'camera' | 'library'): Promise<string | null> {
  if (source === 'camera') {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) throw new ApiError(0, 'camera_denied');
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false };
  const r = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled || !r.assets[0]) return null;
  const a = r.assets[0];
  const longest = Math.max(a.width, a.height);
  const resized = await manipulateAsync(a.uri, longest > 1800 ? [{ resize: a.width >= a.height ? { width: 1800 } : { height: 1800 } }] : [],
    { compress: 0.82, format: SaveFormat.JPEG });
  return resized.uri;
}

export async function uploadPalm(uri: string, hand: 'left' | 'right', lang: string): Promise<PalmReading> {
  const blob = await (await fetch(uri)).blob();
  const r = await expoFetch(`${API_URL}/palm/readings?hand=${hand}&lang=${lang}`, {
    method: 'POST', headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'image/jpeg' }, body: blob,
  });
  const j = await r.json();
  if (!r.ok) throw new ApiError(r.status, j.error, j.message);
  return j;
}

export const LINE_ICON: Record<string, string> = { life: '🌿', head: '🧠', heart: '❤️', fate: '🧭', sun: '☀️' };
