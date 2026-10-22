import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useKundliData } from '@/lib/kundlis';
import { KundliChips, MakeKundliInline, useKundliChoice } from '@/components/Gates';
import { space, useTheme } from '@/lib/theme';
import { Badge, ErrorState, Loading, Screen, Section, T } from '@/components/ui';

interface Period { phase: string; kind: string; sign: number; start: string; end: string }
interface Res { moonSign: number; periods: Period[]; current: Period | null; next: Period | null; sadeSatiSpans: { start: string; end: string }[] }

export default function SadeSati() {
  const { t, i18n } = useTranslation();
  const { c } = useTheme();
  const { list, k, setId } = useKundliChoice();
  const r = useKundliData<Res>(k, 'sade-sati', i18n.language);
  const date = (iso: string) => new Date(iso).toLocaleDateString(i18n.language, { month: 'short', year: 'numeric' });
  if (!k) return <Screen edges={[]} style={{ paddingTop: space.m, gap: space.l }}><T v="h1">{t('sadesati.title')}</T><MakeKundliInline /></Screen>;
  if (r.error) return <ErrorState message={t('common.network_error')} onRetry={r.reload} />;
  if (!r.data) return <Loading />;
  const { current, next, periods } = r.data;
  const now = Date.now();
  const headline = current
    ? t(current.kind === 'sade_sati' ? 'sadesati.now_yes' : 'sadesati.now_dhaiya', { phase: t(`sadesati.phase_${current.phase}`), date: date(current.end) })
    : t('sadesati.now_no');

  return (
    <Screen edges={[]} style={{ paddingTop: space.m }}>
      <T v="h1">{t('sadesati.title')}</T>
      <View style={{ marginTop: space.s }}><KundliChips list={list} value={k} onChange={setId} /></View>
      <View style={{ backgroundColor: c.sky, borderRadius: 24, padding: space.xl, gap: space.s, marginTop: space.l }}>
        <T v="small" color={c.marigold} style={{ fontWeight: '600' }}>{t(`signs.${r.data.moonSign}`)}</T>
        <T color={c.skyInk} style={{ fontSize: 18, lineHeight: 28, fontWeight: '600' }}>{headline}</T>
        {current ? <T v="small" color="rgba(255,244,220,0.8)">{t(`sadesati.mean_${current.phase}`)}</T> : null}
        {!current && next ? <T v="small" color="rgba(255,244,220,0.8)">{t('sadesati.next', { date: date(next.start) })}</T> : null}
      </View>
      <T color={c.inkSoft} style={{ marginTop: space.l }}>{t('sadesati.what')}</T>
      <Section title={t('sadesati.timeline')}>
        {periods.map((p, i) => {
          const isNow = Date.parse(p.start) <= now && now < Date.parse(p.end);
          const past = Date.parse(p.end) < now;
          return (
            <View key={i} style={{ flexDirection: 'row', gap: space.m, paddingVertical: space.m, borderBottomWidth: 1, borderBottomColor: c.line, opacity: past ? 0.6 : 1 }}>
              <View style={{ width: 4, borderRadius: 2, backgroundColor: p.kind === 'sade_sati' ? c.primary : c.marigold }} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <T style={{ fontWeight: '600', flex: 1 }}>{t(`sadesati.phase_${p.phase}`)}</T>
                  {isNow ? <Badge text={t('sadesati.current')} tone="marigold" /> : null}
                </View>
                <T v="small" color={c.inkSoft}>{date(p.start)} – {date(p.end)} · {t(`signs.${p.sign}`)}</T>
              </View>
            </View>
          );
        })}
      </Section>
      <T v="tiny" color={c.inkSoft} style={{ marginTop: space.xl }}>{t('common.disclaimer')}</T>
    </Screen>
  );
}
