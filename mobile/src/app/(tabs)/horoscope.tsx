import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { usePrimaryKundli } from '@/lib/store';
import { useKundliData } from '@/lib/kundlis';
import { useFetch } from '@/lib/useFetch';
import { space, useTheme } from '@/lib/theme';
import type { Horoscope } from '@/lib/types';
import { ErrorState, Screen, Section, Segmented, Skeleton, T } from '@/components/ui';
import { EnergyBars } from '@/components/EnergyBars';

// U+FE0E forces text (not emoji) presentation so the glyph takes the theme colour.
const GLYPHS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'].map((g) => `${g}\uFE0E`);
type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';
type Day = 'yesterday' | 'today' | 'tomorrow';

export default function HoroscopeScreen() {
  const { t, i18n } = useTranslation();
  const { c } = useTheme();
  const params = useLocalSearchParams<{ sign?: string }>();
  const primary = usePrimaryKundli();
  const home = useKundliData<{ basics?: { rashi: number } }>(primary, 'home', i18n.language);
  const myRashi = home.data?.basics?.rashi;
  const [sign, setSign] = useState<number | null>(params.sign !== undefined ? Number(params.sign) : null);
  useEffect(() => { if (params.sign !== undefined) setSign(Number(params.sign)); }, [params.sign]);
  const [period, setPeriod] = useState<Period>('daily');
  const [day, setDay] = useState<Day>('today');
  useEffect(() => { if (sign === null && myRashi !== undefined) setSign(myRashi); }, [myRashi, sign]);
  const s = sign ?? myRashi ?? 0;
  const h = useFetch<Horoscope>(`/horoscope/${s}?period=${period}&day=${day}&lang=${i18n.language}`);
  const d = h.data;

  return (
    <Screen>
      <T v="h1" style={{ paddingTop: space.l }}>{t('horoscope.title')}</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.m, marginHorizontal: -space.l }} contentContainerStyle={{ paddingHorizontal: space.l, gap: space.s }}>
        {GLYPHS.map((g, i) => {
          const sel = i === s;
          return (
            <Pressable key={i} onPress={() => setSign(i)} accessibilityRole="button" accessibilityState={{ selected: sel }} accessibilityLabel={t(`signs.${i}`)}
              style={{ width: 76, paddingVertical: space.s, borderRadius: 16, alignItems: 'center', gap: 2,
                backgroundColor: sel ? c.sky : c.surface, borderWidth: sel ? 0 : 1, borderColor: c.line }}>
              <T style={{ fontSize: 26, lineHeight: 32 }} color={sel ? c.marigold : c.ink}>{g}</T>
              <T v="tiny" color={sel ? c.skyInk : c.inkSoft} numberOfLines={1}>{t(`signs.${i}`).split(' (')[0]}</T>
              {i === myRashi ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.marigold }} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ gap: space.s, marginTop: space.l }}>
        <Segmented value={period} onChange={setPeriod} options={(['daily', 'weekly', 'monthly', 'yearly'] as Period[]).map((p) => ({ value: p, label: t(`horoscope.${p}`) }))} />
        {period === 'daily' ? (
          <Segmented value={day} onChange={setDay} options={(['yesterday', 'today', 'tomorrow'] as Day[]).map((p) => ({ value: p, label: t(`horoscope.${p}`) }))} />
        ) : null}
      </View>

      {h.error && !d ? <ErrorState message={t('common.network_error')} onRetry={h.reload} /> : null}
      {!d ? <View style={{ gap: space.m, marginTop: space.xl }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={60} />)}</View> : (
        <>
          <Section>
            <T v="h2">{t(`signs.${s}`)}</T>
            <T style={{ marginTop: space.s }}>{d.general}</T>
          </Section>
          <Section><EnergyBars energy={d.energy} /></Section>
          <Section>
            {(['love', 'career', 'finance', 'health', 'family', 'growth'] as const).map((k) => (
              <View key={k} style={{ paddingVertical: space.m, borderBottomWidth: 1, borderBottomColor: c.line }}>
                <T v="small" color={c.inkSoft} style={{ fontWeight: '700' }}>{t(`horoscope.${k}`)}</T>
                <T>{d[k]}</T>
              </View>
            ))}
          </Section>
          <View style={{ flexDirection: 'row', marginTop: space.xl, gap: space.s }}>
            {[[t('horoscope.lucky_number'), String(d.luckyNumber)], [t('horoscope.lucky_color'), d.luckyColor], [t('horoscope.compatible'), t(`signs.${d.compatibleSign}`).split(' (')[0]]].map(([k, v]) => (
              <View key={k} style={{ flex: 1, backgroundColor: c.surface, borderRadius: 14, padding: space.m, borderWidth: 1, borderColor: c.line }}>
                <T v="tiny" color={c.inkSoft}>{k}</T>
                <T style={{ fontWeight: '700' }}>{v}</T>
              </View>
            ))}
          </View>
          <View style={{ borderLeftWidth: 3, borderLeftColor: c.marigold, paddingLeft: space.m, marginTop: space.xl }}>
            <T v="small" color={c.inkSoft}>{t('horoscope.advice')}</T>
            <T style={{ fontWeight: '600' }}>{d.advice}</T>
          </View>
        </>
      )}
      <T v="tiny" color={c.inkSoft} style={{ marginTop: space.xl }}>{t('common.disclaimer')}</T>
    </Screen>
  );
}
