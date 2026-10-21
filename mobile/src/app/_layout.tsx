import '@/i18n';
import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { useTranslation } from 'react-i18next';
import { useApp } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { registerPush } from '@/lib/push';
import { getSocket, useSocketEvent } from '@/lib/socket';
import type { Session } from '@/lib/types';
import { Loading } from '@/components/ui';

export default function RootLayout() {
  const { ready, token, user, boot } = useApp();
  const { c, dark } = useTheme();
  const [booted, setBooted] = useState(false);

  useEffect(() => { boot().finally(() => setBooted(true)); }, [boot]);
  useEffect(() => { if (token) { getSocket(); registerPush(); } }, [token]);

  if (!ready || !booted) return <View style={{ flex: 1, backgroundColor: c.bg }}><Loading /></View>;

  const signedIn = !!token;
  const onboarded = signedIn && (user?.profiles?.length ?? 0) > 0;

  return (
    <SafeAreaProvider>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {signedIn ? <GlobalListeners /> : null}
      <Stack screenOptions={{
        headerShown: false, contentStyle: { backgroundColor: c.bg },
        headerTransparent: false, headerStyle: { backgroundColor: c.bg }, headerTintColor: c.ink, headerShadowVisible: false,
      }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="welcome" />
          <Stack.Screen name="login" />
          <Stack.Screen name="otp" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="chat/[id]" />
          <Stack.Screen name="kundli" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="tools/sade-sati" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="tools/gochar" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="tools/choghadiya" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="tools/numerology" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="palm/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="voice/[id]" />
          <Stack.Screen name="pandit/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="wallet" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="topup" options={{ presentation: 'modal' }} />
          <Stack.Screen name="match" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="profiles/new" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="reports/index" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="reports/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="history" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="language" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="notifications" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="legal/[doc]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="pandit-apply" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="pandit-home" />
          <Stack.Screen name="pandit-settings" options={{ headerShown: true, title: '' }} />
        </Stack.Protected>
      </Stack>
    </SafeAreaProvider>
  );
}

/** App-wide: Pandit request alerts in Pandit mode, and tapping a push notification opens the right screen. */
function GlobalListeners() {
  const router = useRouter();
  const { t } = useTranslation();
  const mode = useApp((s) => s.mode);

  useSocketEvent<Session>('session:requested', (s) => {
    if (mode !== 'pandit') return;
    Alert.alert(t('pandit.new_request'), '', [{ text: t('common.continue'), onPress: () => router.push('/pandit-home') }]);
  }, [mode]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const d = r.notification.request.content.data as { kind?: string; sessionId?: string };
      if (d.kind === 'consultation') router.push('/pandit-home');
      else if (d.kind === 'daily_horoscope') router.push('/(tabs)/horoscope');
      else if (d.kind === 'payment') router.push('/wallet');
    });
    return () => sub.remove();
  }, [router]);
  return null;
}
