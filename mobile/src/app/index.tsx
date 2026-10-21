import { Redirect } from 'expo-router';
import { useApp } from '@/lib/store';

export default function Index() {
  const { token, user, mode } = useApp();
  if (!token) return <Redirect href="/welcome" />;
  if (user && !user.consentCurrent) return <Redirect href="/consent" />;
  if (!user?.profiles?.length) return <Redirect href="/onboarding" />;
  if (mode === 'pandit' && user.pandit?.status === 'approved') return <Redirect href="/pandit-home" />;
  return <Redirect href="/(tabs)" />;
}
