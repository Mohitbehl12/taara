import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { useApp } from '@/lib/store';
import { useFetch } from '@/lib/useFetch';
import { space } from '@/lib/theme';
import type { Pandit } from '@/lib/types';
import { Button, Loading, Screen, T } from '@/components/ui';
import { PanditFields, panditValid, toRates, type PanditValues } from '@/components/PanditForm';

export default function PanditSettings() {
  const { t } = useTranslation();
  const router = useRouter();
  const meta = useApp((s) => s.meta);
  const me = useFetch<Pandit & { replyLanguage: string }>('/pandit/me');
  const [v, setV] = useState<PanditValues | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const d = me.data;
    if (d && !v) setV({
      displayName: d.displayName, bio: d.bio, experienceYears: String(d.experienceYears), languages: d.languages, replyLanguage: d.replyLanguage,
      specializations: d.specializations, chat: String(d.chatRatePaise / 100), voice: String(d.voiceRatePaise / 100), video: String(d.videoRatePaise / 100),
      participatesInFree: d.participatesInFree,
    });
  }, [me.data, v]);
  if (!v) return <Loading />;
  const min = (meta?.pricing.panditMinRatePaise ?? 500) / 100, max = (meta?.pricing.panditMaxRatePaise ?? 20000) / 100;

  const save = async () => {
    setBusy(true);
    try {
      await api('/pandit/me', { method: 'PATCH', body: {
        bio: v.bio, specializations: v.specializations, languages: v.languages, replyLanguage: v.replyLanguage,
        participatesInFree: v.participatesInFree, ...toRates(v),
      } });
      router.back();
    } catch (e: any) { Alert.alert(e.message ?? t('common.error_generic')); } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={[]} style={{ paddingTop: space.m, gap: space.m }}>
        <T v="h1">{t('pandit.settings')}</T>
        <PanditFields v={v} set={setV} showName={false} />
        <Button title={t('common.save')} onPress={save} loading={busy} disabled={!panditValid(v, min, max)} style={{ marginTop: space.l }} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
