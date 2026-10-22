import React, { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { usePrimaryKundli } from '@/lib/store';
import { useFetch } from '@/lib/useFetch';
import { space, useTheme } from '@/lib/theme';
import { ErrorState, Loading, Screen, Segmented, T } from '@/components/ui';

interface Slot { part: 'day' | 'night'; name: string; quality: 'good' | 'neutral' | 'bad'; start: string; end: string }
interface Res { weekday: number; slots: Slot[]; abhijit: { start: string; end: string; avoidToday: boolean } }

export default function Choghadiya() {
  const { t, i18n } = useTranslation();
  const { c } = useTheme();
  const p = usePrimaryKundli();
  const lat = p?.lat ?? 28.6139, lon = p?.lon ?? 77.209, tz = p?.tzOffsetMinutes ?? 330;
  const today = new Date(Date.now() + tz * 60_000).toISOString().slice(0, 10);
  const r = useFetch<Res>(`/tools/choghadiya?date=${today}&lat=${lat}&lon=${lon}&tz=${tz}`);
  const [part, setPart] = useState<'day' | 'night'>(new Date().getHours() >= 18 || new Date().getHours() < 5 ? 'night' : 'day');
  const clock = (iso: string) => new Date(iso).toLocaleTimeString(i18n.language, { hour: 'numeric', minute: '2-digit' });
  if (r.error) return <ErrorState message={t('common.network_error')} onRetry={r.reload} />;
  if (!r.data) return <Loading />;
  const now = Date.now();
  const tone = { good: c.marigold, neutral: c.line, bad: c.inkSoft };

  return (
    <Screen edges={[]} style={{ paddingTop: space.m }}>
      <T v="h1">{t('chog.title')}</T>
      <T color={c.inkSoft} style={{ marginTop: space.s }}>{t('chog.subtitle')}{p ? ` (${p.placeName})` : ''}</T>

      <View style={{ backgroundColor: c.sky, borderRadius: 20, padding: space.l, marginTop: space.l, gap: 4, opacity: r.data.abhijit.avoidToday ? 0.75 : 1 }}>
        <T v="small" color={c.marigold} style={{ fontWeight: '600' }}>{t('chog.abhijit')}</T>
        <T v="h2" color={c.skyInk}>{clock(r.data.abhijit.start)} – {clock(r.data.abhijit.end)}</T>
        <T v="small" color="rgba(255,244,220,0.8)">{r.data.abhijit.avoidToday ? t('chog.abhijit_wed') : t('chog.abhijit_hint')}</T>
      </View>

      <View style={{ marginTop: space.l }}>
        <Segmented value={part} onChange={setPart} options={[{ value: 'day', label: t('chog.day') }, { value: 'night', label: t('chog.night') }]} />
      </View>
      <View style={{ marginTop: space.m }}>
        {r.data.slots.filter((s) => s.part === part).map((s) => {
          const live = Date.parse(s.start) <= now && now < Date.parse(s.end);
          return (
            <View key={s.start} style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m, borderBottomWidth: 1, borderBottomColor: c.line,
              backgroundColor: live ? c.surface : 'transparent', paddingHorizontal: live ? space.s : 0, borderRadius: live ? 10 : 0 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tone[s.quality] }} />
              <T style={{ flex: 1, fontWeight: live ? '700' : '500' }}>{t(`chog.${s.name}`)}{live ? `  · ${t('chog.now')}` : ''}</T>
              <T v="small" color={c.inkSoft} style={{ fontVariant: ['tabular-nums'] }}>{clock(s.start)} – {clock(s.end)}</T>
              <T v="small" style={{ width: 56, textAlign: 'right', fontWeight: '600' }} color={s.quality === 'good' ? c.primary : c.inkSoft}>{t(`chog.${s.quality}`)}</T>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}
