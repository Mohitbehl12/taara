import React, { useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useApp } from '@/lib/store';
import { useFetch } from '@/lib/useFetch';
import { space, useTheme } from '@/lib/theme';
import type { Placement } from '@/lib/types';
import { Badge, Chip, ErrorState, Loading, Row, Screen, Section, Segmented, T } from '@/components/ui';
import { KundliChart } from '@/components/KundliChart';
import { ExplainSimply } from '@/components/ExplainSimply';
import { explainPlacement } from '@/lib/explain';

interface Dasha { lord: string; start: string; end: string; sub?: Dasha[] }
interface KundliRes {
  chart: { referenceSign: number; timeKnown: boolean; lagna: { sign: number; degreeInSign: number } | null; planets: Placement[] };
  placements: Placement[];
  dasha: { periods: Dasha[]; current: { mahadasha: Dasha | null; antardasha: Dasha | null }; simple: string | null };
  doshas: { manglik: { present: boolean; cancelled: boolean }; kaalSarp: { present: boolean } };
  note: string | null;
}

export default function KundliScreen() {
  const { t, i18n } = useTranslation();
  const { c } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const user = useApp((s) => s.user);
  const profiles = user?.profiles ?? [];
  const [pid, setPid] = useState(profiles.find((p) => p.isPrimary)?.id ?? profiles[0]?.id);
  const [view, setView] = useState<'simple' | 'detailed'>('simple');
  const [style, setStyle] = useState<'north' | 'south'>('north');
  const k = useFetch<KundliRes>(pid ? `/profiles/${pid}/kundli?lang=${i18n.language}` : null);
  const d = k.data;
  const date = (iso: string) => new Date(iso).toLocaleDateString(i18n.language, { month: 'short', year: 'numeric' });
  const size = Math.min(width - space.l * 2, 360);

  return (
    <Screen edges={[]}>
      <View style={{ paddingTop: space.l, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T v="h1">{t('kundli.title')}</T>
        <Pressable onPress={() => router.push('/profiles/new')} accessibilityRole="button" hitSlop={8}>
          <T color={c.primary} style={{ fontWeight: '600' }}>+ {t('kundli.add_profile')}</T>
        </Pressable>
      </View>
      {profiles.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.m }} contentContainerStyle={{ gap: space.s }}>
          {profiles.map((p) => <Chip key={p.id} label={p.name} selected={p.id === pid} onPress={() => setPid(p.id)} />)}
        </ScrollView>
      ) : null}

      <View style={{ marginTop: space.l }}>
        <Segmented value={view} onChange={setView} options={[{ value: 'simple', label: t('kundli.simple') }, { value: 'detailed', label: t('kundli.detailed') }]} />
      </View>

      {k.error && !d ? <ErrorState message={t('common.network_error')} onRetry={k.reload} /> : null}
      {!d ? <Loading /> : (
        <>
          {d.note ? <View style={{ marginTop: space.m, padding: space.m, backgroundColor: c.surfaceAlt, borderRadius: 12 }}><T v="small">{t('kundli.time_unknown_banner')}</T></View> : null}
          <View style={{ alignItems: 'center', marginTop: space.l, gap: space.m }}>
            <KundliChart size={size} style={style} planets={d.chart.planets} referenceSign={d.chart.referenceSign}
              line={c.primary} ink={c.ink} muted={c.inkSoft} accent={c.marigold} background={c.surface} />
            <View style={{ width: 240 }}>
              <Segmented value={style} onChange={setStyle} options={[{ value: 'north', label: t('kundli.north') }, { value: 'south', label: t('kundli.south') }]} />
            </View>
          </View>

          <Section title={t('kundli.planets')}>
            {view === 'simple'
              ? d.placements.map((p) => (
                <View key={p.planet} style={{ borderBottomWidth: 1, borderBottomColor: c.line }}>
                  <ExplainSimply title={`${t(`planets.${p.planet}`)} · ${t(`signs.${p.sign}`)} · ${t('kundli.house')} ${p.house}`} {...explainPlacement(t, p)} />
                </View>
              ))
              : (
                <View>
                  <View style={{ flexDirection: 'row', paddingVertical: space.s, borderBottomWidth: 1, borderBottomColor: c.line }}>
                    {[t('kundli.planet'), t('kundli.sign'), t('kundli.house'), t('kundli.degree'), t('kundli.status')].map((h, i) => (
                      <T key={h} v="tiny" color={c.inkSoft} style={{ flex: [1.2, 1.4, 0.6, 0.9, 1.1][i], fontWeight: '700' }}>{h}</T>
                    ))}
                  </View>
                  {d.chart.lagna ? (
                    <View style={{ flexDirection: 'row', paddingVertical: space.s, borderBottomWidth: 1, borderBottomColor: c.line }}>
                      <T v="small" style={{ flex: 1.2, fontWeight: '600' }}>{t('planets.Asc')}</T>
                      <T v="small" style={{ flex: 1.4 }}>{t(`signs.${d.chart.lagna.sign}`).split(' (')[0]}</T>
                      <T v="small" style={{ flex: 0.6 }}>1</T>
                      <T v="small" style={{ flex: 0.9, fontVariant: ['tabular-nums'] }}>{d.chart.lagna.degreeInSign.toFixed(1)}°</T>
                      <T v="small" style={{ flex: 1.1 }}>—</T>
                    </View>
                  ) : null}
                  {d.placements.map((p) => (
                    <View key={p.planet} style={{ flexDirection: 'row', paddingVertical: space.s, borderBottomWidth: 1, borderBottomColor: c.line }}>
                      <T v="small" style={{ flex: 1.2, fontWeight: '600' }}>{t(`planets.${p.planet}`)}{p.retrograde && !['Rahu', 'Ketu'].includes(p.planet) ? ' ℞' : ''}</T>
                      <T v="small" style={{ flex: 1.4 }}>{t(`signs.${p.sign}`).split(' (')[0]}</T>
                      <T v="small" style={{ flex: 0.6 }}>{p.house}</T>
                      <T v="small" style={{ flex: 0.9, fontVariant: ['tabular-nums'] }}>{p.degreeInSign.toFixed(1)}°</T>
                      <T v="small" style={{ flex: 1.1 }}>{t(`kundli.${p.dignity}`)}{p.combust ? `, ${t('kundli.combust')}` : ''}</T>
                    </View>
                  ))}
                  <T v="tiny" color={c.inkSoft} style={{ marginTop: space.s }}>
                    {d.placements.map((p) => `${t(`planets.${p.planet}`)}: ${t(`nakshatras.${p.nakshatra}`)} ${p.pada}`).join(' · ')}
                  </T>
                </View>
              )}
          </Section>

          <Section title={t('kundli.dasha')}>
            {d.dasha.current.mahadasha ? (
              <T style={{ marginBottom: space.m }}>{t('explain.dasha', {
                md: t(`planets.${d.dasha.current.mahadasha.lord}`), ad: t(`planets.${d.dasha.current.antardasha?.lord ?? d.dasha.current.mahadasha.lord}`),
                theme: t(`explain.planet.${d.dasha.current.mahadasha.lord}`),
              })}</T>
            ) : null}
            {d.dasha.periods.map((p, i) => {
              const now = d.dasha.current.mahadasha?.lord === p.lord && d.dasha.current.mahadasha?.start === p.start;
              return (
                <Row key={`${p.lord}${p.start}`} last={i === d.dasha.periods.length - 1}
                  title={`${t(`planets.${p.lord}`)}`}
                  subtitle={`${date(p.start)} – ${date(p.end)}${now && d.dasha.current.antardasha ? ` · ${t(`planets.${d.dasha.current.antardasha.lord}`)} ${t('kundli.until', { date: date(d.dasha.current.antardasha.end) })}` : ''}`}
                  right={now ? <Badge text={t('kundli.dasha_now')} tone="marigold" /> : <View />} />
              );
            })}
          </Section>

          <Section title={t('kundli.doshas')}>
            {([
              ['manglik', d.doshas.manglik.present, t(d.doshas.manglik.present ? 'explain.manglik_yes' : d.doshas.manglik.cancelled ? 'explain.manglik_cancelled' : 'explain.manglik_no')],
              ['kaal_sarp', d.doshas.kaalSarp.present, t(d.doshas.kaalSarp.present ? 'explain.kaalsarp_yes' : 'explain.kaalsarp_no')],
            ] as const).map(([key, present, text]) => (
              <View key={key} style={{ paddingVertical: space.m, borderBottomWidth: 1, borderBottomColor: c.line, gap: space.xs }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <T style={{ fontWeight: '600' }}>{t(`kundli.${key}`)}</T>
                  <Badge text={present ? t('common.yes') : t('common.no')} tone={present ? 'marigold' : 'muted'} />
                </View>
                <T v="small" color={c.inkSoft}>{text}</T>
              </View>
            ))}
          </Section>

          <Section>
            <Row title={t('kundli.matching')} onPress={() => router.push('/match')} />
            <Row title={t('kundli.reports')} onPress={() => router.push('/reports')} last />
          </Section>
        </>
      )}
    </Screen>
  );
}
