import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { useApp } from '@/lib/store';
import { space, useTheme } from '@/lib/theme';
import { Button, Field, Panel, Screen, T } from '@/components/ui';
import { PickerField } from '@/components/BirthForm';

interface Res {
  mulank: number; bhagyank: number; nameNumber: number | null; nameCompound: number | null; nameSupported: boolean;
  rulingPlanet: string; destinyPlanet: string; friendlyNumbers: number[]; nameHarmony: 'good' | 'neutral' | null; personalYear: number;
}
const PLANET = ['', 'Sun', 'Moon', 'Jupiter', 'Rahu', 'Mercury', 'Venus', 'Ketu', 'Saturn', 'Mars'];
const pad = (n: number) => String(n).padStart(2, '0');

export default function Numerology() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const user = useApp((s) => s.user);
  const primary = user?.profiles.find((p) => p.isPrimary);
  const [name, setName] = useState(/^[A-Za-z\s.]+$/.test(primary?.name ?? '') ? primary!.name : '');
  const [date, setDate] = useState<Date | null>(primary ? new Date(`${primary.date}T12:00:00`) : null);
  const [res, setRes] = useState<Res | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!date) return;
    setBusy(true);
    try {
      const d = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      setRes(await api<Res>(`/tools/numerology?date=${d}${name.trim() ? `&name=${encodeURIComponent(name.trim())}` : ''}`));
    } finally { setBusy(false); }
  };

  const Big = ({ label, n, planet }: { label: string; n: number; planet: string }) => (
    <Panel style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <T v="tiny" color={c.inkSoft} style={{ textAlign: 'center' }}>{label}</T>
      <T style={{ fontSize: 44, lineHeight: 52, fontWeight: '800' }} color={c.primary}>{n}</T>
      <T v="tiny" color={c.inkSoft}>{t('numerology.planet', { planet: t(`planets.${planet}`) })}</T>
    </Panel>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={[]} style={{ paddingTop: space.m, gap: space.m }}>
        <T v="h1">{t('numerology.title')}</T>
        <Field label={t('numerology.name_label')} value={name} onChangeText={setName} autoCapitalize="words" />
        <T v="small" color={c.inkSoft}>{t('numerology.date_label')}</T>
        <PickerField mode="date" value={date} onChange={setDate} placeholder="DD / MM / YYYY" />
        <Button title={t('numerology.calculate')} onPress={run} loading={busy} disabled={!date} />

        {res ? (
          <View style={{ gap: space.m, marginTop: space.m }}>
            <View style={{ flexDirection: 'row', gap: space.s }}>
              <Big label={t('numerology.mulank')} n={res.mulank} planet={res.rulingPlanet} />
              <Big label={t('numerology.bhagyank')} n={res.bhagyank} planet={res.destinyPlanet} />
              {res.nameNumber ? <Big label={t('numerology.name_number')} n={res.nameNumber} planet={PLANET[res.nameNumber]} /> : null}
            </View>
            <View style={{ gap: space.xs }}>
              <T style={{ fontWeight: '700' }}>{t('numerology.mulank')} {res.mulank}</T>
              <T>{t(`numerology.n${res.mulank}`)}</T>
            </View>
            <View style={{ gap: space.xs }}>
              <T style={{ fontWeight: '700' }}>{t('numerology.bhagyank')} {res.bhagyank}</T>
              <T>{t(`numerology.n${res.bhagyank}`)}</T>
            </View>
            {res.nameNumber ? (
              <View style={{ gap: space.xs }}>
                <T style={{ fontWeight: '700' }}>{t('numerology.name_number')} {res.nameNumber} ({res.nameCompound})</T>
                <T>{t(res.nameHarmony === 'good' ? 'numerology.harmony_good' : 'numerology.harmony_neutral')}</T>
                <T v="tiny" color={c.inkSoft}>{t('numerology.name_latin')}</T>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: space.s }}>
              <Panel style={{ flex: 1 }}>
                <T v="tiny" color={c.inkSoft}>{t('numerology.friendly')}</T>
                <T style={{ fontWeight: '700' }}>{res.friendlyNumbers.join(', ')}</T>
              </Panel>
              <Panel style={{ flex: 1 }}>
                <T v="tiny" color={c.inkSoft}>{t('numerology.personal_year')}</T>
                <T style={{ fontWeight: '700' }}>{res.personalYear}</T>
              </Panel>
            </View>
          </View>
        ) : null}
        <T v="tiny" color={c.inkSoft}>{t('common.disclaimer')}</T>
      </Screen>
    </KeyboardAvoidingView>
  );
}
