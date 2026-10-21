import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { API_URL, getToken } from './api';

/** Pick a photo and upload it. Private files (ID documents) are only visible to admins. */
export async function pickAndUpload(visibility: 'public' | 'private'): Promise<string | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: visibility === 'public', aspect: [1, 1] });
  if (r.canceled || !r.assets[0]) return null;
  const a = r.assets[0];
  const type = a.mimeType ?? 'image/jpeg';
  const res = await expoFetch(`${API_URL}/uploads?visibility=${visibility}`, {
    method: 'POST', headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': type === 'image/heic' ? 'image/jpeg' : type }, body: new File(a.uri),
  });
  if (!res.ok) throw new Error('upload_failed');
  return (await res.json()).url as string;
}
