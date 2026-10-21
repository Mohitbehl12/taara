// First-run consent (DPDP Act s.5–6): clear notice, explicit unticked boxes, 18+ confirmation, separate optional marketing.
import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { TERMS_VERSION } from '@/lib/legal';
import { disconnectSocket } from '@/lib/socket';
import { useApp } from '@/lib/store';
import type { User } from '@/lib/types';
import { space, useTheme } from '@/lib/theme';
import { Button, Panel, Screen, T } from '@/components/ui';
import { Checkbox } from '@/components/Safety';

export default function Consent() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const router = useRouter();
  const { signOut } = useApp();
  const [adult, setAdult] = useState(false);
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);

  const open = (doc: string) => router.push({ pathname: '/legal/[doc]', params: { doc } });
  const agree = async () => {
    setBusy(true);
    try {
      const u = await api<User>('/me/consent', { body: { termsVersion: TERMS_VERSION, ageConfirmed: true, marketing } });
      useApp.setState({ user: u });
    } catch { Alert.alert(t('common.error_generic')); } finally { setBusy(false); }
  };
  const under18 = () => Alert.alert(t('consent.under18_title'), t('consent.under18_body'), [
    { text: t('common.back'), style: 'cancel' },
    { text: t('profile.logout'), onPress: async () => { disconnectSocket(); await signOut(); } },
  ]);

  return (
    <Screen style={{ gap: space.l, paddingTop: space.xl }}>
      <T v="h1">{t('consent.title')}</T>
      <T color={c.inkSoft}>{t('consent.intro')}</T>

      <Panel style={{ gap: space.s }}>
        <T v="h2">{t('consent.what_title')}</T>
        {(['data_birth', 'data_chat', 'data_palm', 'data_share', 'data_ai'] as const).map((k) => (
          <T key={k} v="small">• {t(`consent.${k}`)}</T>
        ))}
        <T v="small" color={c.primary} onPress={() => open('privacy')} accessibilityRole="link">{t('consent.read_privacy')} ›</T>
      </Panel>

      <View>
        <Checkbox checked={adult} onChange={setAdult} label={t('consent.adult')}>
          <T>{t('consent.adult')}</T>
        </Checkbox>
        <Checkbox checked={terms} onChange={setTerms} label={t('consent.terms')}>
          <T>{t('consent.terms')}</T>
          <View style={{ flexDirection: 'row', gap: space.m, marginTop: 2 }}>
            <T v="small" color={c.primary} onPress={() => open('terms')} accessibilityRole="link">{t('profile.terms')}</T>
            <T v="small" color={c.primary} onPress={() => open('privacy')} accessibilityRole="link">{t('profile.privacy_policy')}</T>
            <T v="small" color={c.primary} onPress={() => open('disclaimer')} accessibilityRole="link">{t('profile.disclaimer')}</T>
          </View>
        </Checkbox>
        <Checkbox checked={marketing} onChange={setMarketing} label={t('consent.marketing')}>
          <T>{t('consent.marketing')}</T>
          <T v="small" color={c.inkSoft}>{t('consent.optional')}</T>
        </Checkbox>
      </View>

      <Button title={t('consent.agree')} onPress={agree} loading={busy} disabled={!adult || !terms} />
      <Button title={t('consent.im_under_18')} kind="ghost" onPress={under18} />
      <T v="tiny" color={c.inkSoft}>{t('consent.withdraw')}</T>
    </Screen>
  );
}
