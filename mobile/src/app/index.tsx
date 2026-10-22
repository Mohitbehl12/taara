import { Redirect } from 'expo-router';
import { useApp } from '@/lib/store';

export default function Index() {
  const { token, user, mode, languageChosen } = useApp();
  // First launch: pick a language once. Then straight to Home — no login, no setup wizard.
  if (!languageChosen && !token) return <Redirect href="/welcome" />;
  if (token && mode === 'pandit' && user?.pandit?.status === 'approved') return <Redirect href="/pandit-home" />;
  return <Redirect href="/(tabs)" />;
}
