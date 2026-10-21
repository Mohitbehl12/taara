import React from 'react';
import { Alert, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { api, rupees } from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';
import { useApp } from '@/lib/store';
import { space, useTheme } from '@/lib/theme';
import { langName } from '@/i18n/languages';
import { Badge, Row, Screen, Section, Segmented, T } from '@/components/ui';

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { c } = useTheme();
  const router = useRouter();
  const { user, updateUser, signOut, setMode } = useApp();
  if (!user) return null;
  const primary = user.profiles.find((p) => p.isPrimary);
  const pandit = user.pandit;

  const del = () => Alert.alert(t('profile.delete_account'), t('profile.delete_confirm'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('common.delete'), style: 'destructive', onPress: async () => {
      try { await api('/me', { method: 'DELETE' }); disconnectSocket(); await signOut(); } catch { Alert.alert(t('common.error_generic')); }
    } },
  ]);

  return (
    <Screen>
      <View style={{ paddingTop: space.l, gap: 2 }}>
        <T v="h1">{user.name}</T>
        <T color={c.inkSoft}>{user.phone ?? user.email}</T>
      </View>

      <Section title={t('profile.birth_details')}>
        {primary ? <T>{new Date(`${primary.date}T00:00:00`).toLocaleDateString(i18n.language, { dateStyle: 'long' })}{primary.time ? ` · ${primary.time}` : ''} · {primary.placeName}</T> : null}
        <Row title={t('profile.my_charts')} subtitle={user.profiles.map((p) => p.name).join(', ')} onPress={() => router.push('/kundli')} />
        <Row title={t('profile.wallet')} right={<T style={{ fontWeight: '700' }}>{rupees(user.balancePaise)}</T>} onPress={() => router.push('/wallet')} />
        <Row title={t('profile.history')} onPress={() => router.push('/history')} />
        <Row title={t('profile.reports')} onPress={() => router.push('/reports')} last />
      </Section>

      <Section title={t('profile.language')}>
        <Row title={langName(user.language)} onPress={() => router.push('/language')} />
        <View style={{ paddingVertical: space.m, gap: space.s }}>
          <T v="small" color={c.inkSoft}>{t('profile.theme')}</T>
          <Segmented value={user.theme} onChange={(theme) => updateUser({ theme })}
            options={[{ value: 'light', label: t('profile.theme_light') }, { value: 'dark', label: t('profile.theme_dark') }, { value: 'system', label: t('profile.theme_system') }]} />
        </View>
        <Row title={t('profile.notifications')} onPress={() => router.push('/notifications')} last />
      </Section>

      <Section title={t('profile.privacy')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m }}>
          <View style={{ flex: 1 }}>
            <T>{t('profile.ai_consent')}</T>
            <T v="small" color={c.inkSoft}>{t('profile.ai_consent_hint')}</T>
          </View>
          <Switch value={user.aiProfileConsent} onValueChange={(v) => updateUser({ aiProfileConsent: v })} trackColor={{ true: c.primary }} accessibilityLabel={t('profile.ai_consent')} />
        </View>
      </Section>

      <Section title="Pandit Ji">
        {pandit?.status === 'approved'
          ? <Row title={t('profile.pandit_mode')} onPress={async () => { await setMode('pandit'); router.replace('/pandit-home'); }} last />
          : pandit?.status === 'pending'
            ? <Row title={t('profile.application_pending')} right={<Badge text={t('pandit.status_pending')} tone="marigold" />} last />
            : <Row title={t('profile.become_pandit')} subtitle={pandit?.status === 'rejected' ? t('pandit.status_rejected') : null} onPress={() => router.push('/pandit-apply')} last />}
      </Section>

      <Section>
        <Row title={t('profile.help')} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'help' } })} />
        <Row title={t('profile.terms')} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })} />
        <Row title={t('profile.privacy_policy')} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })} />
        <Row title={t('profile.refund_policy')} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'refund' } })} />
        <Row title={t('profile.disclaimer')} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'disclaimer' } })} last />
      </Section>

      <Section>
        <Row title={t('profile.logout')} onPress={async () => { disconnectSocket(); await signOut(); }} />
        <Row title={t('profile.delete_account')} onPress={del} right={<View />} last />
      </Section>
    </Screen>
  );
}
