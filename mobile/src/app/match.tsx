import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { useApp } from '@/lib/store';
import { space, useTheme } from '@/lib/theme';
import { Badge, Button, Chip, Screen, Section, T } from '@/components/ui';

interface Match {
  total: number; max: number; percent: number; verdict: 'excellent' | 'very_good' | 'good' | 'low';
  kootas: { key: string; name: string; max: number; score: number; simple: string }[];
  areas: Record<'overall' | 'emotional' | 'communication' | 'love' | 'marriage' | 'financial' | 'longTerm', number>;
  nadiDosha: boolean; bhakootDosha: boolean; manglik: { groom: boolean; bride: boolean }; note: string;
}

export default function MatchScreen() {
  const { t, i18n } = useTranslation();
  const { c } = useTheme();
  const router = useRouter();
  const profiles = useApp((s) => s.user?.profiles ?? []);
  const [a, setA] = useState(profiles.find((p) => p.isPrimary)?.id ?? null);
  const [b, setB] = useState<string | null>(profiles.find((p) => !p.isPrimary)?.id ?? null);
  const [res, setRes] = useState<Match | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!a || !b) return;
    setBusy(true);
    try { setRes(await api<Match>('/match', { body: { groomProfileId: a, brideProfileId: b, lang: i18n.language } })); }
    finally { setBusy(false); }
  };

  const picker = (label: string, value: string | null, set: (id: string) => void, exclude: string | null) => (
    <View style={{ gap: space.s }}>
      <T v="small" color={c.inkSoft} style={{ fontWeight: '700' }}>{label}</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s }}>
        {profiles.filter((p) => p.id !== exclude).map((p) => <Chip key={p.id} label={p.name} selected={p.id === value} onPress={() => { set(p.id); setRes(null); }} />)}
        <Chip label={`+ ${t('match.add_new')}`} onPress={() => router.push({ pathname: '/profiles/new', params: { returnTo: '/match' } })} />
      </ScrollView>
    </View>
  );

  const areaKeys: [keyof Match['areas'], string][] = [['emotional', 'emotional'], ['communication', 'communication'], ['love', 'love'], ['marriage', 'marriage'], ['financial', 'financial'], ['longTerm', 'long_term']];

  return (
    <Screen edges={[]} style={{ gap: space.l, paddingTop: space.m }}>
      <T v="h1">{t('match.title')}</T>
      {picker(t('match.person1'), a, setA, b)}
      {picker(t('match.person2'), b, setB, a)}
      <Button title={t('match.calculate')} onPress={run} loading={busy} disabled={!a || !b} />

      {res ? (
        <>
          <View style={{ backgroundColor: c.sky, borderRadius: 24, padding: space.xl, alignItems: 'center', gap: space.s }}>
            <T style={{ fontSize: 56, lineHeight: 64, fontWeight: '800', fontVariant: ['tabular-nums'] }} color={c.marigold}>{res.total}</T>
            <T color={c.skyInk}>{t('match.score', { score: res.total })}</T>
            <T v="h2" color={c.skyInk}>{t(`match.verdict_${res.verdict}`)}</T>
          </View>
          <Section title={t('match.overall')} style={{ marginTop: 0 }}>
            {areaKeys.map(([k, label]) => (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: 6 }}>
                <T v="small" style={{ width: 110 }}>{t(`match.${label}`)}</T>
                <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: c.surfaceAlt }}>
                  <View style={{ width: `${res.areas[k]}%`, height: 6, borderRadius: 3, backgroundColor: res.areas[k] >= 60 ? c.marigold : c.kesariSoft }} />
                </View>
                <T v="small" color={c.inkSoft} style={{ width: 40, textAlign: 'right' }}>{res.areas[k]}%</T>
              </View>
            ))}
          </Section>
          {(res.nadiDosha || res.bhakootDosha || res.manglik.groom || res.manglik.bride) ? (
            <View style={{ gap: space.s }}>
              {res.nadiDosha ? <Badge text={t('match.nadi_dosha')} tone="marigold" /> : null}
              {res.bhakootDosha ? <Badge text={t('match.bhakoot_dosha')} tone="marigold" /> : null}
              <T v="small" color={c.inkSoft}>{t('match.manglik_note', { a: res.manglik.groom ? t('common.yes') : t('common.no'), b: res.manglik.bride ? t('common.yes') : t('common.no') })}</T>
            </View>
          ) : null}
          <Section title={t('match.kootas')} style={{ marginTop: 0 }}>
            {res.kootas.map((k) => (
              <View key={k.key} style={{ paddingVertical: space.m, borderBottomWidth: 1, borderBottomColor: c.line }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <T style={{ fontWeight: '600' }}>{k.name}</T>
                  <T style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>{k.score} / {k.max}</T>
                </View>
                <T v="small" color={c.inkSoft}>{k.simple}</T>
              </View>
            ))}
          </Section>
          <T v="small" color={c.inkSoft}>{res.note}</T>
          <Button title={t('match.talk_pandit')} kind="secondary" onPress={() => router.push({ pathname: '/(tabs)/consult', params: { tab: 'pandit' } })} />
        </>
      ) : null}
    </Screen>
  );
}
