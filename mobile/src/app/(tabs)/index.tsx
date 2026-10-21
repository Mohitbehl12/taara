import React from 'react';
import { Pressable, RefreshControl, ScrollView, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useApp } from '@/lib/store';
import { useFetch } from '@/lib/useFetch';
import { rupees } from '@/lib/api';
import { space, useTheme } from '@/lib/theme';
import type { Horoscope } from '@/lib/types';
import { Button, ErrorState, Screen, Section, Skeleton, T } from '@/components/ui';
import { KundliChart } from '@/components/KundliChart';
import { EnergyBars } from '@/components/EnergyBars';

interface Home {
  profile: { id: string; name: string; timeKnown: boolean } | null;
  basics: { rashi: number; sunSign: number; lagna: number | null; nakshatra: number; pada: number };
  energy: Horoscope['energy'];
  horoscope: Horoscope;
  panchang: { tithi: { name: string; paksha: string }; nakshatra: { index: number; name: string }; sunrise: string | null; sunset: string | null; rahuKaal: { start: string; end: string } | null; vara: string };
}
interface Kundli { chart: { referenceSign: number; planets: { planet: string; sign: number; house: number; retrograde: boolean }[] } }

const clock = (iso: string | null | undefined, lang: string) => (iso ? new Date(iso).toLocaleTimeString(lang, { hour: 'numeric', minute: '2-digit' }) : '—');

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const { c } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const user = useApp((s) => s.user);
  const meta = useApp((s) => s.meta);
  const lang = i18n.language;
  const home = useFetch<Home>(`/home?lang=${lang}`);
  const primary = user?.profiles.find((p) => p.isPrimary) ?? user?.profiles[0];
  const kundli = useFetch<Kundli>(primary ? `/profiles/${primary.id}/kundli?lang=${lang}` : null);
  const h = home.data;
  const freeMin = Math.floor((user?.freeSecondsRemaining ?? 0) / 60);
  const chartSize = Math.min(width - space.l * 4, 300);

  return (
    <Screen refreshControl={<RefreshControl refreshing={home.loading && !!h} onRefresh={() => { home.reload(); kundli.reload(); useApp.getState().refreshUser(); }} />}>
      <View style={{ paddingTop: space.l, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T v="h1" style={{ flex: 1 }} numberOfLines={1}>{t('home.greeting_morning', { name: (user?.name ?? '').split(' ')[0] })}</T>
        <Pressable onPress={() => router.push('/wallet')} accessibilityRole="button" accessibilityLabel={t('wallet.title')}
          style={{ paddingHorizontal: space.m, minHeight: 36, borderRadius: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, justifyContent: 'center' }}>
          <T v="small" style={{ fontWeight: '600' }}>{rupees(user?.balancePaise ?? 0)}</T>
        </Pressable>
      </View>

      {/* The hero: the user's own chart, drawn on the night sky. */}
      <Pressable onPress={() => router.push('/kundli')} accessibilityRole="button" accessibilityLabel={t('home.view_kundli')}
        style={{ marginTop: space.l, backgroundColor: c.sky, borderRadius: 28, padding: space.l, gap: space.l }}>
        <T v="small" color={c.marigold} style={{ fontWeight: '600' }}>{t('home.your_sky')}</T>
        <View style={{ alignItems: 'center' }}>
          {kundli.data
            ? <KundliChart size={chartSize} planets={kundli.data.chart.planets} referenceSign={kundli.data.chart.referenceSign}
              line={c.marigold} ink={c.skyInk} muted="rgba(255,244,220,0.45)" accent={c.marigold} />
            : <Skeleton h={chartSize} w={chartSize} r={12} style={{ opacity: 0.2 }} />}
        </View>
        {h?.basics ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {[
              [t('home.rashi'), t(`signs.${h.basics.rashi}`)],
              [t('home.nakshatra'), `${t(`nakshatras.${h.basics.nakshatra}`)} ${h.basics.pada}`],
              [t('home.lagna'), h.basics.lagna !== null ? t(`signs.${h.basics.lagna}`) : t('home.lagna_unknown')],
            ].map(([k, v]) => (
              <View key={k} style={{ flex: 1 }}>
                <T v="tiny" color="rgba(255,244,220,0.7)">{k}</T>
                <T v="small" color={c.skyInk} style={{ fontWeight: '600' }} numberOfLines={2}>{v}</T>
              </View>
            ))}
          </View>
        ) : null}
      </Pressable>

      {/* Four primary actions, prices up front. Pandit Ji is the strongest (kesari) tile. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.l }}>
        {[
          { key: 'palm', icon: '✋', title: t('home.read_palm'), sub: t('home.read_palm_sub'), onPress: () => router.push('/(tabs)/palm'), tone: 'plain' },
          { key: 'kundli', icon: '🔮', title: t('home.my_kundli'), sub: t('home.my_kundli_sub'), onPress: () => router.push('/kundli'), tone: 'plain' },
          { key: 'ai', icon: '🤖', title: t('home.ask_ai'), sub: meta ? t('common.per_min', { price: rupees(meta.pricing.aiRatePerMinPaise) }) : t('home.ask_ai_sub'), onPress: () => router.push('/(tabs)/consult'), tone: 'gold' },
          { key: 'pandit', icon: '🧘', title: t('home.talk_pandit'), sub: freeMin > 0 ? t('home.free_badge', { minutes: freeMin }) : t('home.talk_pandit_sub'), onPress: () => router.push({ pathname: '/(tabs)/consult', params: { tab: 'pandit' } }), tone: 'kesari' },
        ].map((a) => {
          const bg = a.tone === 'kesari' ? c.primary : a.tone === 'gold' ? c.marigold : c.surface;
          const fg = a.tone === 'kesari' ? c.onPrimary : a.tone === 'gold' ? c.marigoldInk : c.ink;
          return (
            <Pressable key={a.key} onPress={a.onPress} accessibilityRole="button" accessibilityLabel={`${a.title}, ${a.sub}`}
              style={({ pressed }) => ({ width: '48.8%', minHeight: 116, backgroundColor: bg, borderRadius: 20, padding: space.l, gap: 2, justifyContent: 'space-between',
                borderWidth: a.tone === 'plain' ? 1 : 0, borderColor: c.line, opacity: pressed ? 0.85 : 1 })}>
              <T style={{ fontSize: 26, lineHeight: 32 }}>{a.icon}</T>
              <View>
                <T style={{ fontWeight: '700' }} color={fg} numberOfLines={2}>{a.title}</T>
                <T v="small" color={fg} style={{ opacity: 0.85 }} numberOfLines={1}>{a.sub}</T>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Quick tools row */}
      <Section title={t('tools.title')}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.l }} contentContainerStyle={{ paddingHorizontal: space.l, gap: space.s }}>
          {([
            ['🪐', 'sade_sati', '/tools/sade-sati'], ['🌌', 'gochar', '/tools/gochar'], ['⏳', 'muhurat', '/tools/choghadiya'],
            ['🔢', 'numerology', '/tools/numerology'], ['💞', 'match', '/match'],
          ] as const).map(([icon, key, href]) => (
            <Pressable key={key} onPress={() => router.push(href)} accessibilityRole="button"
              style={({ pressed }) => ({ width: 96, paddingVertical: space.m, borderRadius: 16, alignItems: 'center', gap: 6, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, opacity: pressed ? 0.8 : 1 })}>
              <T style={{ fontSize: 24, lineHeight: 30 }}>{icon}</T>
              <T v="tiny" style={{ fontWeight: '600', textAlign: 'center' }} numberOfLines={2}>{key === 'match' ? t('kundli.matching') : t(`tools.${key}`)}</T>
            </Pressable>
          ))}
        </ScrollView>
      </Section>

      {home.error && !h ? <ErrorState message={t('common.network_error')} onRetry={home.reload} /> : null}

      <Section title={t('home.energy')}>
        {h ? <EnergyBars energy={h.energy} /> : <View style={{ gap: space.s }}>{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={14} />)}</View>}
      </Section>

      <Section title={t('home.today')} action={<Pressable onPress={() => router.push('/(tabs)/horoscope')}><T v="small" color={c.primary} style={{ fontWeight: '600' }}>{t('horoscope.daily')}</T></Pressable>}>
        {h ? (
          <View style={{ gap: space.m }}>
            {(['love', 'career', 'finance', 'family'] as const).map((k) => (
              <View key={k} style={{ flexDirection: 'row', gap: space.m }}>
                <T v="small" style={{ width: 70, fontWeight: '700' }} color={c.inkSoft}>{t(`horoscope.${k}`)}</T>
                <T style={{ flex: 1 }}>{h.horoscope[k]}</T>
              </View>
            ))}
            <View style={{ borderLeftWidth: 3, borderLeftColor: c.marigold, paddingLeft: space.m, marginTop: space.s }}>
              <T v="small" color={c.inkSoft}>{t('home.advice')}</T>
              <T style={{ fontWeight: '600' }}>{h.horoscope.advice}</T>
            </View>
          </View>
        ) : <View style={{ gap: space.s }}>{[0, 1, 2].map((i) => <Skeleton key={i} h={40} />)}</View>}
      </Section>

      {h?.panchang ? (
        <Section title={t('home.panchang')} action={<Pressable onPress={() => router.push('/tools/choghadiya')} hitSlop={8}><T v="small" color={c.primary} style={{ fontWeight: '600' }}>{t('chog.title')}</T></Pressable>}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.m }}>
            {[
              [t('home.tithi'), `${t(`panchang.${h.panchang.tithi.paksha}`)} ${t(`tithis.${h.panchang.tithi.name}`)}`],
              [t('home.nakshatra'), t(`nakshatras.${h.panchang.nakshatra.index}`)],
              [t('home.sunrise'), clock(h.panchang.sunrise, lang)],
              [t('home.sunset'), clock(h.panchang.sunset, lang)],
              [t('home.rahu_kaal'), h.panchang.rahuKaal ? `${clock(h.panchang.rahuKaal.start, lang)} – ${clock(h.panchang.rahuKaal.end, lang)}` : '—'],
            ].map(([k, v]) => (
              <View key={k} style={{ width: '50%' }}>
                <T v="tiny" color={c.inkSoft}>{k}</T>
                <T v="small" style={{ fontWeight: '600' }}>{v}</T>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {!primary ? <Button title={t('home.add_birth_cta')} onPress={() => router.push('/profiles/new')} style={{ marginTop: space.xl }} /> : null}
      <T v="tiny" color={c.inkSoft} style={{ marginTop: space.xl }}>{t('common.disclaimer')}</T>
    </Screen>
  );
}
