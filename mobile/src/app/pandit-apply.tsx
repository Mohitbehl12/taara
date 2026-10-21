import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { useApp } from '@/lib/store';
import { pickAndUpload } from '@/lib/upload';
import { space, useTheme } from '@/lib/theme';
import { Button, Chip, Field, Screen, Section, T } from '@/components/ui';
import { PanditFields, panditValid, toRates, type PanditValues } from '@/components/PanditForm';

const ID_TYPES = ['aadhaar_masked', 'pan', 'passport', 'voter_id', 'driving_licence'] as const;
const ID_LABEL: Record<string, string> = { aadhaar_masked: 'Masked Aadhaar', pan: 'PAN', passport: 'Passport', voter_id: 'Voter ID', driving_licence: 'Driving licence' };

export default function PanditApply() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const router = useRouter();
  const { user, meta, language, refreshUser } = useApp();
  const [v, setV] = useState<PanditValues>({
    displayName: user?.name ? `Pt. ${user.name}` : '', bio: '', experienceYears: '', languages: [language], replyLanguage: language,
    specializations: ['vedic'], chat: '20', voice: '25', video: '30', participatesInFree: true,
  });
  const [ver, setVer] = useState({ fullName: user?.name ?? '', email: '', address: '', idDocType: 'pan' as (typeof ID_TYPES)[number], idDocUrl: '', photoUrl: '' });
  const [busy, setBusy] = useState(false);
  const min = (meta?.pricing.panditMinRatePaise ?? 500) / 100, max = (meta?.pricing.panditMaxRatePaise ?? 20000) / 100;
  const ok = panditValid(v, min, max) && ver.fullName.length > 1 && ver.address.length > 4 && !!ver.idDocUrl;

  const upload = async (key: 'idDocUrl' | 'photoUrl') => {
    try { const url = await pickAndUpload(key === 'idDocUrl' ? 'private' : 'public'); if (url) setVer((p) => ({ ...p, [key]: url })); }
    catch { Alert.alert(t('common.error_generic')); }
  };

  const submit = async () => {
    setBusy(true);
    try {
      await api('/pandit/apply', { body: {
        displayName: v.displayName.trim(), bio: v.bio.trim(), experienceYears: Number(v.experienceYears || 0), specializations: v.specializations,
        languages: v.languages, replyLanguage: v.replyLanguage, photoUrl: ver.photoUrl || undefined, ...toRates(v),
        verification: { fullName: ver.fullName, email: ver.email || undefined, address: ver.address, idDocType: ver.idDocType, idDocUrl: ver.idDocUrl },
      } });
      await refreshUser();
      Alert.alert(t('pandit.submitted'));
      router.back();
    } catch (e: any) { Alert.alert(e.message && e.code === 'rate_out_of_range' ? e.message : t('common.error_generic')); }
    finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={[]} style={{ paddingTop: space.m, gap: space.m }}>
        <T v="h1">{t('pandit.apply_title')}</T>
        <T color={c.inkSoft}>{t('pandit.apply_intro')}</T>
        <Button title={ver.photoUrl ? t('pandit.uploaded') : '📷'} kind="secondary" small onPress={() => upload('photoUrl')} style={{ alignSelf: 'flex-start' }} />
        <PanditFields v={v} set={setV} />
        <Section title={t('pandit.verification')}>
          <View style={{ gap: space.m }}>
            <Field label={t('pandit.full_name')} value={ver.fullName} onChangeText={(fullName) => setVer({ ...ver, fullName })} />
            <Field label={t('pandit.email')} value={ver.email} onChangeText={(email) => setVer({ ...ver, email })} keyboardType="email-address" autoCapitalize="none" />
            <Field label={t('pandit.address')} value={ver.address} onChangeText={(address) => setVer({ ...ver, address })} multiline />
            <T v="small" color={c.inkSoft}>{t('pandit.id_type')}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
              {ID_TYPES.map((k) => <Chip key={k} label={ID_LABEL[k]} selected={ver.idDocType === k} onPress={() => setVer({ ...ver, idDocType: k })} />)}
            </View>
            <Button title={ver.idDocUrl ? t('pandit.uploaded') : t('pandit.id_upload')} kind="secondary" onPress={() => upload('idDocUrl')} />
            <T v="tiny" color={c.inkSoft}>{t('pandit.payout_note')}</T>
          </View>
        </Section>
        <Button title={t('pandit.submit')} onPress={submit} loading={busy} disabled={!ok} style={{ marginTop: space.l }} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
