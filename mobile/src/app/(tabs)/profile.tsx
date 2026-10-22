import React from 'react';
import { Alert, Platform, Switch, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { api, rupees } from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';
import { useApp } from '@/lib/store';
import { space, useTheme } from '@/lib/theme';
import { langName } from '@/i18n/languages';
import { Badge, Button, Panel, Row, Screen, Section, Segmented, T } from '@/components/ui';
import { useKundliList } from '@/lib/store';

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { c } = useTheme();
  const router = useRouter();
  const { user, updateUser, signOut, setMode } = useApp();
  if (!user) return <GuestMore />;
  const primary = user.profiles.find((p) => p.isPrimary);
  const pandit = user.pandit;

  /** DPDP right to access: saves everything we hold as a JSON file the user can keep or share. */
  const exportData = async () => {
    try {
      const data = await api('/me/export');
      const json = JSON.stringify(data, null, 2);
      const name = `taara-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        a.download = name; a.click();
        return;
      }
      const f = new File(Paths.cache, name);
      f.create({ overwrite: true });
      f.write(json);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(f.uri, { mimeType: 'application/json' });
    } catch { Alert.alert(t('common.error_generic')); }
  };

  const logoutAll = () => Alert.alert(t('privacy.logout_all'), t('privacy.logout_all_confirm'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('common.continue'), onPress: async () => {
      try { await api('/me/logout-all', { body: {} }); } catch { /* signing out locally anyway */ }
      disconnectSocket(); await signOut();
    } },
  ]);

  const del = () => Alert.alert(t('profile.delete_account'), t('profile.delete_confirm'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('common.delete'), style: 'destructive', onPress: async () => {
      try { await api('/me', { method: 'DELETE' }); disconnectSocket(); await signOut(); } catch { Alert.alert(t('common.error_generic')); }
    } },
  ]);

  return (
    <Screen>
      <View style={{ paddingTop: space.l, gap: 2 }}>
        <T v="h1">{t('more.title')}</T>
        <T style={{ fontWeight: '700' }}>{user.name}</T>
        <T color={c.inkSoft}>{user.phone ?? user.email}</T>
      </View>

      <Section title={t('profile.birth_details')}>
        {primary ? <T>{new Date(`${primary.date}T00:00:00`).toLocaleDateString(i18n.language, { dateStyle: 'long' })}{primary.time ? ` · ${primary.time}` : ''} · {primary.placeName}</T> : null}
        <Row title={t('profile.my_charts')} subtitle={user.profiles.map((p) => p.name).join(', ')} onPress={() => router.push('/(tabs)/kundli')} />
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
          <Switch value={user.aiProfileConsent} onValueChange={(v) => updateUser({ aiProfileConsent: v })} trackColor={{ true: c.primary, false: c.line }} thumbColor={c.surface} ios_backgroundColor={c.line} accessibilityLabel={t('profile.ai_consent')} />
        </View>
        <Row title={t('privacy.download')} subtitle={t('privacy.download_hint')} onPress={exportData} />
        <Row title={t('privacy.logout_all')} onPress={logoutAll} />
        <Row title={t('profile.delete_account')} onPress={del} right={<View />} last />
      </Section>

      <Section title="Pandit Ji">
        {pandit?.status === 'approved'
          ? <Row title={t('profile.pandit_mode')} onPress={async () => { await setMode('pandit'); router.replace('/pandit-home'); }} last />
          : pandit?.status === 'pending'
            ? <Row title={t('profile.application_pending')} right={<Badge text={t('pandit.status_pending')} tone="marigold" />} last />
            : <Row title={t('profile.become_pandit')} subtitle={pandit?.status === 'rejected' ? t('pandit.status_rejected') : null} onPress={() => router.push('/pandit-apply')} last />}
      </Section>

      <Section>
        <Row title={t('safety.title')} onPress={() => router.push('/safety')} />
        <Row title={t('profile.help')} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'help' } })} />
        <Row title={t('profile.terms')} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })} />
        <Row title={t('profile.privacy_policy')} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })} />
        <Row title={t('profile.refund_policy')} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'refund' } })} />
        <Row title={t('profile.disclaimer')} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'disclaimer' } })} last />
      </Section>

      <Section>
        <Row title={t('profile.logout')} onPress={async () => { disconnectSocket(); await signOut(); }} last />
      </Section>
    </Screen>
  );
}

/** "More" for guests: a login card, then everything that works without an account. */
function GuestMore() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const router = useRouter();
  const language = useApp((s) => s.language);
  const kundlis = useKundliList();
  const doc = (d: string) => () => router.push({ pathname: '/legal/[doc]', params: { doc: d } });
  return (
    <Screen>
      <T v="h1" style={{ paddingTop: space.l }}>{t('more.title')}</T>
      <Panel style={{ marginTop: space.l, gap: space.s }}>
        <T v="h2">{t('more.guest_title')}</T>
        <T v="small" color={c.inkSoft}>{t('more.guest_sub')}</T>
        <Button title={t('more.login')} onPress={() => router.push('/login')} style={{ marginTop: space.s }} />
      </Panel>
      <Section title={t('more.settings')}>
        <Row title={t('profile.language')} subtitle={langName(language)} onPress={() => router.push('/language')} />
        <Row title={t('home.my_kundlis')} subtitle={kundlis.map((k) => k.name).join(', ') || undefined} onPress={() => router.push('/(tabs)/kundli')} last />
      </Section>
      <Section>
        <Row title={t('profile.become_pandit')} onPress={() => router.push({ pathname: '/login', params: { next: '/pandit-apply' } })} />
        <Row title={t('profile.help')} onPress={doc('help')} />
        <Row title={t('profile.terms')} onPress={doc('terms')} />
        <Row title={t('profile.privacy_policy')} onPress={doc('privacy')} />
        <Row title={t('profile.refund_policy')} onPress={doc('refund')} />
        <Row title={t('profile.disclaimer')} onPress={doc('disclaimer')} last />
      </Section>
      <T v="tiny" color={c.inkSoft} style={{ marginTop: space.xl }}>{t('common.disclaimer')}</T>
    </Screen>
  );
}
