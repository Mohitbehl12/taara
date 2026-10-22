// Daily Panchang (like AstroSage's): tithi, nakshatra, yoga, karana, vara, sun/moon times and Rahu Kaal,
// for any day and any place. No login needed.
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { usePrimaryKundli } from '@/lib/store';
import { useFetch } from '@/lib/useFetch';
import { space, useTheme } from '@/lib/theme';
import { Button, ErrorState, Panel, Screen, Skeleton, T } from '@/components/ui';
import { PlaceSearch, type Place } from '@/components/PlaceSearch';

interface Res {
  date: string; vara: string; tithi: { index: number; name: string; paksha: string }; nakshatra: { index: number; name: string };
  yoga: { index: number; name: string }; karana: string; sunrise: string | null; sunset: string | null; moonrise: string | null;
  rahuKaal: { start: string; end: string } | null;
}

const IST = 330;
const ymd = (ms: number) => new Date(ms + IST * 60_000).toISOString().slice(0, 10);

export default function Panchang() {
  const { t, i18n } = useTranslation();
  const { c } = useTheme();
  const router = useRouter();
  const primary = usePrimaryKundli();
  const [place, setPlace] = useState<Place>(primary ? { label: primary.placeName, lat: primary.lat, lon: primary.lon } : { label: 'New Delhi', lat: 28.6139, lon: 77.209 });
  const [changing, setChanging] = useState(false);
  const [offset, setOffset] = useState(0);
  const date = ymd(Date.now() + offset * 86_400_000);
  const r = useFetch<Res>(`/panchang?date=${date}&lat=${place.lat}&lon=${place.lon}&tz=${IST}`);
  const d = r.data;
  const clock = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString(i18n.language, { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '—');
  const pretty = new Date(`${date}T00:00:00`).toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const tr = (key: string, fallback: string) => { const v = t(key); return v === key ? fallback : v; };

  const rows: [string, string][] = d ? [
    [t('home.tithi'), `${tr(`panchang.${d.tithi.paksha}`, d.tithi.paksha)} ${tr(`tithis.${d.tithi.name}`, d.tithi.name)}`],
    [t('home.nakshatra'), t(`nakshatras.${d.nakshatra.index}`)],
    [t('panchang.yoga'), d.yoga.name],
    [t('panchang.karana'), d.karana],
    [t('panchang.vara'), d.vara],
    [t('home.sunrise'), clock(d.sunrise)],
    [t('home.sunset'), clock(d.sunset)],
    [t('panchang.moonrise'), clock(d.moonrise)],
    [t('home.rahu_kaal'), d.rahuKaal ? `${clock(d.rahuKaal.start)} – ${clock(d.rahuKaal.end)}` : '—'],
  ] : [];

  return (
    <Screen edges={[]} style={{ paddingTop: space.m, gap: space.l }}>
      <T v="h1">{t('panchang.title')}</T>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => setOffset(offset - 1)} hitSlop={8} accessibilityRole="button"><T color={c.primary} style={{ fontWeight: '700' }}>{t('panchang.prev')}</T></Pressable>
        <Pressable onPress={() => setOffset(0)} accessibilityRole="button"><T style={{ fontWeight: '700' }}>{offset === 0 ? t('panchang.today') : ''}</T></Pressable>
        <Pressable onPress={() => setOffset(offset + 1)} hitSlop={8} accessibilityRole="button"><T color={c.primary} style={{ fontWeight: '700' }}>{t('panchang.next')}</T></Pressable>
      </View>

      <View style={{ backgroundColor: c.sky, borderRadius: 24, padding: space.l, gap: space.xs }}>
        <T color={c.marigold} style={{ fontWeight: '700' }}>{pretty}</T>
        <T v="small" color={c.skyInk}>{t('panchang.place', { place: place.label })}</T>
        {d ? <T color={c.skyInk} style={{ fontSize: 18, lineHeight: 26, fontWeight: '700', marginTop: space.s }}>
          {tr(`panchang.${d.tithi.paksha}`, d.tithi.paksha)} {tr(`tithis.${d.tithi.name}`, d.tithi.name)} · {t(`nakshatras.${d.nakshatra.index}`)}
        </T> : null}
      </View>

      {r.error && !d ? <ErrorState message={t('common.network_error')} onRetry={r.reload} /> : null}
      <Panel style={{ paddingVertical: space.s }}>
        {d ? rows.map(([k, v], i) => (
          <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.m, paddingVertical: space.m, borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
            <T color={c.inkSoft}>{k}</T>
            <T style={{ fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{v}</T>
          </View>
        )) : <View style={{ gap: space.m, paddingVertical: space.m }}>{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={18} />)}</View>}
      </Panel>

      {changing
        ? <PlaceSearch value={null} onSelect={(p) => { setPlace(p); setChanging(false); }} />
        : <Button title={t('panchang.change_place')} kind="secondary" onPress={() => setChanging(true)} />}
      <Button title={t('chog.title')} kind="ghost" onPress={() => router.push('/tools/choghadiya')} />
      <T v="tiny" color={c.inkSoft}>{t('common.disclaimer')}</T>
    </Screen>
  );
}
