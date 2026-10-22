import React, { useEffect } from 'react';
import { Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { useApp } from '@/lib/store';
import { useFetch } from '@/lib/useFetch';
import { space, useTheme } from '@/lib/theme';
import { Screen, Section, T } from '@/components/ui';
import { LoginGate, useSignedIn } from '@/components/Gates';

const KINDS = [['daily_horoscope', 'notif_daily'], ['consultation', 'notif_consultation'], ['payment', 'notif_payment'], ['campaigns', 'notif_campaigns']] as const;
interface Notif { id: string; title: string; body: string; createdAt: string; readAt: string | null }

function NotificationsScreen() {
  const { t, i18n } = useTranslation();
  const { c } = useTheme();
  const { user, updateUser } = useApp();
  const list = useFetch<Notif[]>('/notifications');
  useEffect(() => { api('/notifications/read', { body: {} }).catch(() => {}); }, []);
  const prefs = user?.notificationPrefs ?? {};

  return (
    <Screen edges={[]}>
      <T v="h1" style={{ paddingTop: space.m }}>{t('profile.notifications')}</T>
      <Section>
        {KINDS.map(([k, label]) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.m, borderBottomWidth: 1, borderBottomColor: c.line }}>
            <T style={{ flex: 1 }}>{t(`profile.${label}`)}</T>
            {/* Marketing is opt-in (off until the user turns it on); service notifications are on by default. */}
            <Switch value={k === 'campaigns' ? prefs[k] === true : prefs[k] !== false} onValueChange={(v) => updateUser({ notificationPrefs: { ...prefs, [k]: v } })} trackColor={{ true: c.primary, false: c.line }} thumbColor={c.surface} ios_backgroundColor={c.line} accessibilityLabel={t(`profile.${label}`)} />
          </View>
        ))}
      </Section>
      <Section>
        {list.data?.map((n) => (
          <View key={n.id} style={{ paddingVertical: space.m, borderBottomWidth: 1, borderBottomColor: c.line, gap: 2 }}>
            <T style={{ fontWeight: n.readAt ? '400' : '700' }}>{n.title}</T>
            <T v="small" color={c.inkSoft}>{n.body}</T>
            <T v="tiny" color={c.inkSoft}>{new Date(n.createdAt).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })}</T>
          </View>
        ))}
      </Section>
    </Screen>
  );
}

/** Needs an account; guests see a short explanation and a login button. */
export default function Notifications() {
  return useSignedIn() ? <NotificationsScreen /> : <LoginGate next="/notifications" icon="🔔" />;
}
