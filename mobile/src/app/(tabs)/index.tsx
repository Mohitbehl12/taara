// Home, laid out like AstroSage: big service tiles first, then "talk to an astrologer", astrologers online,
// today's Rashifal for all 12 signs, Panchang, and your saved Kundlis. Everything here works without login.
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useApp, useKundliList, usePrimaryKundli } from '@/lib/store';
import { useFetch } from '@/lib/useFetch';
import { useKundliData } from '@/lib/kundlis';
import { rupees } from '@/lib/api';
import { space, useTheme } from '@/lib/theme';
import type { Horoscope, Pandit } from '@/lib/types';
import { langName } from '@/i18n/languages';
import { Button, Row, Screen, Section, Skeleton, T } from '@/components/ui';
import { Avatar } from '@/components/PanditRow';
import { StartPanditSheet } from '@/components/StartPanditSheet';
import { useRequireLogin } from '@/lib/auth';

interface Home {
  basics: { rashi: number; sunSign: number; lagna: number | null; nakshatra: number; pada: number };
  horoscope: Horoscope;
}
interface Panchang { tithi: { name: string; paksha: string }; nakshatra: { index: number }; sunrise: string | null; sunset: string | null; rahuKaal: { start: string; end: string } | null; vara: string }

const GLYPHS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'].map((g) => `${g}︎`);
const todayIST = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const { c } = useTheme();
  const router = useRouter();
  const ensure = useRequireLogin();
  const { user, meta, token, language } = useApp();
  const lang = i18n.language;
  const list = useKundliList();
  const primary = usePrimaryKundli();
  const home = useKundliData<Home>(primary, 'home', lang);
  const place = primary ? { lat: primary.lat, lon: primary.lon, name: primary.placeName } : { lat: 28.6139, lon: 77.209, name: 'New Delhi' };
  const pan = useFetch<Panchang>(`/panchang?date=${todayIST()}&lat=${place.lat}&lon=${place.lon}&tz=330`);
  const pandits = useFetch<Pandit[]>('/pandits?sort=recommended');
  const [chosen, setChosen] = useState<Pandit | null>(null);
  const freeMin = token ? Math.floor((user?.freeSecondsRemaining ?? 0) / 60) : meta?.pricing.freePanditMinutes ?? 60;
  const clock = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString(lang, { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '—');
  const tr = (key: string, fallback: string) => { const v = t(key); return v === key ? fallback : v; };

  const tiles: { icon: string; label: string; go: () => void }[] = [
    { icon: '📜', label: t('home.q_kundli'), go: () => router.push('/(tabs)/kundli') },
    { icon: '💞', label: t('home.q_match'), go: () => router.push('/match') },
    { icon: '☀️', label: t('home.q_horoscope'), go: () => router.push('/(tabs)/horoscope') },
    { icon: '✋', label: t('home.q_palm'), go: () => router.push('/(tabs)/palm') },
    { icon: '📅', label: t('home.q_panchang'), go: () => router.push('/tools/panchang') },
    { icon: '🤖', label: t('home.q_ai'), go: () => router.push({ pathname: '/(tabs)/consult', params: { tab: 'ai' } }) },
    { icon: '🪐', label: t('home.q_sade_sati'), go: () => router.push('/tools/sade-sati') },
    { icon: '🔢', label: t('home.q_numerology'), go: () => router.push('/tools/numerology') },
  ];

  const chat = (p: Pandit) => { if (ensure('/(tabs)/consult?tab=pandit')) setChosen(p); };
  const online = (pandits.data ?? []).slice(0, 8);

  return (
    <Screen refreshControl={<RefreshControl refreshing={false} onRefresh={() => { home.reload(); pan.reload(); pandits.reload(); if (token) useApp.getState().refreshUser().catch(() => {}); }} />}>
      {/* Header: name, language, wallet or login */}
      <View style={{ paddingTop: space.l, flexDirection: 'row', alignItems: 'center', gap: space.s }}>
        <View style={{ flex: 1 }}>
          <T style={{ fontSize: 24, lineHeight: 30, fontWeight: '800' }} color={c.primary}>Taara</T>
          <T v="small" color={c.inkSoft} numberOfLines={1}>{user?.name && token ? t('home.greeting_morning', { name: user.name.split(' ')[0] }) : t('home.hello_guest')}</T>
        </View>
        <Pressable onPress={() => router.push('/language')} accessibilityRole="button" accessibilityLabel={t('profile.language')}
          style={{ paddingHorizontal: space.m, minHeight: 36, borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, justifyContent: 'center' }}>
          <T v="small" style={{ fontWeight: '600' }}>🌐 {langName(language)}</T>
        </Pressable>
        {token ? (
          <Pressable onPress={() => router.push('/wallet')} accessibilityRole="button" accessibilityLabel={t('wallet.title')}
            style={{ paddingHorizontal: space.m, minHeight: 36, borderRadius: 18, backgroundColor: c.marigold, justifyContent: 'center' }}>
            <T v="small" color={c.marigoldInk} style={{ fontWeight: '700' }}>{rupees(user?.balancePaise ?? 0)}</T>
          </Pressable>
        ) : (
          <Pressable onPress={() => router.push('/login')} accessibilityRole="button"
            style={{ paddingHorizontal: space.m, minHeight: 36, borderRadius: 18, backgroundColor: c.primary, justifyContent: 'center' }}>
            <T v="small" color={c.onPrimary} style={{ fontWeight: '700' }}>{t('more.login')}</T>
          </Pressable>
        )}
      </View>

      {/* Service tiles: 4 × 2, round icons with labels underneath */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: space.l, rowGap: space.l }}>
        {tiles.map((a) => (
          <Pressable key={a.label} onPress={a.go} accessibilityRole="button" accessibilityLabel={a.label}
            style={({ pressed }) => ({ width: '25%', alignItems: 'center', gap: 6, opacity: pressed ? 0.7 : 1 })}>
            <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: c.surface, borderWidth: 1, borderColor: c.marigold, alignItems: 'center', justifyContent: 'center' }}>
              <T style={{ fontSize: 26, lineHeight: 32 }}>{a.icon}</T>
            </View>
            <T v="tiny" style={{ fontWeight: '600', textAlign: 'center' }} numberOfLines={2}>{a.label}</T>
          </Pressable>
        ))}
      </View>

      {/* Talk to an astrologer banner */}
      <Pressable onPress={() => router.push({ pathname: '/(tabs)/consult', params: { tab: 'pandit' } })} accessibilityRole="button"
        style={({ pressed }) => ({ marginTop: space.xl, backgroundColor: c.primary, borderRadius: 20, padding: space.l, flexDirection: 'row', alignItems: 'center', gap: space.m, opacity: pressed ? 0.9 : 1 })}>
        <T style={{ fontSize: 34, lineHeight: 40 }}>🧘</T>
        <View style={{ flex: 1, gap: 2 }}>
          <T color={c.onPrimary} style={{ fontWeight: '800', fontSize: 17 }}>{t('home.talk_banner')}</T>
          <T v="small" color={c.onPrimary} style={{ opacity: 0.9 }}>{freeMin > 0 ? t('home.talk_banner_sub_free', { minutes: freeMin }) : t('home.talk_banner_sub')}</T>
        </View>
        <View style={{ backgroundColor: c.onPrimary, borderRadius: 16, paddingHorizontal: space.m, paddingVertical: 6 }}>
          <T v="small" color={c.primary} style={{ fontWeight: '800' }}>{t('home.chat_now')}</T>
        </View>
      </Pressable>

      {/* Astrologers */}
      <Section title={t('home.astrologers')} action={<Pressable hitSlop={8} onPress={() => router.push({ pathname: '/(tabs)/consult', params: { tab: 'pandit' } })}><T v="small" color={c.primary} style={{ fontWeight: '700' }}>{t('home.see_all')} ›</T></Pressable>}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.l }} contentContainerStyle={{ paddingHorizontal: space.l, gap: space.s }}>
          {!pandits.data ? [0, 1, 2].map((i) => <Skeleton key={i} w={140} h={190} r={16} />) : online.map((p) => {
            const available = p.online && !p.busy;
            return (
              <Pressable key={p.id} onPress={() => router.push({ pathname: '/pandit/[id]', params: { id: p.id } })} accessibilityRole="button"
                style={{ width: 140, padding: space.m, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, alignItems: 'center', gap: 4 }}>
                <Avatar name={p.displayName} url={p.photoUrl} size={56} />
                <T v="small" style={{ fontWeight: '700', textAlign: 'center' }} numberOfLines={1}>{p.displayName}{p.verified ? ' ✓' : ''}</T>
                <T v="tiny" color={c.inkSoft} numberOfLines={1}>{p.languages.slice(0, 2).map(langName).join(', ')}</T>
                <T v="tiny" style={{ fontWeight: '700' }}>{p.rating ? `★ ${p.rating.toFixed(1)} · ` : ''}{t('common.per_min', { price: rupees(p.chatRatePaise) })}</T>
                <Button small title={available ? t('home.chat') : p.online ? t('common.busy') : t('common.offline')} kind={available ? 'primary' : 'secondary'} disabled={!available} onPress={() => chat(p)} style={{ alignSelf: 'stretch', marginTop: 4 }} />
              </Pressable>
            );
          })}
        </ScrollView>
      </Section>

      {/* Your Rashi (or make your Kundli) */}
      {primary ? (
        <Pressable onPress={() => router.push({ pathname: '/kundli/[id]', params: { id: primary.id } })} accessibilityRole="button"
          style={{ marginTop: space.xl, backgroundColor: c.sky, borderRadius: 24, padding: space.l, gap: space.s }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T v="small" color={c.marigold} style={{ fontWeight: '700' }}>{t('home.your_rashi')} · {primary.name}</T>
            <T v="small" color={c.skyInk}>{t('home.view_kundli')} ›</T>
          </View>
          {home.data ? (
            <>
              <T color={c.skyInk} style={{ fontSize: 20, lineHeight: 28, fontWeight: '800' }}>{GLYPHS[home.data.basics.rashi]} {t(`signs.${home.data.basics.rashi}`)}</T>
              <T v="small" color={c.skyInk} style={{ opacity: 0.9 }}>
                {t('home.nakshatra')}: {t(`nakshatras.${home.data.basics.nakshatra}`)} {home.data.basics.pada} · {t('home.lagna')}: {home.data.basics.lagna !== null ? t(`signs.${home.data.basics.lagna}`) : t('home.lagna_unknown')}
              </T>
              <T color={c.skyInk} numberOfLines={4} style={{ marginTop: space.xs }}>{home.data.horoscope.general}</T>
            </>
          ) : <Skeleton h={80} style={{ opacity: 0.25 }} />}
        </Pressable>
      ) : (
        <View style={{ marginTop: space.xl, backgroundColor: c.sky, borderRadius: 24, padding: space.l, gap: space.s }}>
          <T color={c.marigold} style={{ fontWeight: '800', fontSize: 18 }}>{t('home.make_kundli_title')}</T>
          <T color={c.skyInk} v="small">{t('home.make_kundli_sub')}</T>
          <Button title={t('home.make_kundli_cta')} onPress={() => router.push('/(tabs)/kundli')} style={{ marginTop: space.s }} />
        </View>
      )}

      {/* Today's Rashifal — all 12 signs */}
      <Section title={t('home.zodiac')} action={<T v="tiny" color={c.inkSoft}>{t('home.zodiac_sub')}</T>}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.s }}>
          {GLYPHS.map((g, i) => (
            <Pressable key={i} onPress={() => router.push({ pathname: '/(tabs)/horoscope', params: { sign: String(i) } })} accessibilityRole="button" accessibilityLabel={t(`signs.${i}`)}
              style={{ width: '25%', alignItems: 'center', paddingVertical: space.s, gap: 2 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: home.data?.basics.rashi === i ? c.sky : c.surface, borderWidth: 1, borderColor: c.line }}>
                <T style={{ fontSize: 24, lineHeight: 30 }} color={home.data?.basics.rashi === i ? c.marigold : c.primary}>{g}</T>
              </View>
              <T v="tiny" numberOfLines={1}>{t(`signs.${i}`).split(' (')[0]}</T>
            </Pressable>
          ))}
        </View>
      </Section>

      {/* Panchang */}
      <Section title={t('home.panchang')} action={<Pressable hitSlop={8} onPress={() => router.push('/tools/panchang')}><T v="small" color={c.primary} style={{ fontWeight: '700' }}>{t('home.see_all')} ›</T></Pressable>}>
        <Pressable onPress={() => router.push('/tools/panchang')} accessibilityRole="button" style={{ padding: space.m, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
          <T v="tiny" color={c.inkSoft} style={{ marginBottom: space.s }}>{t('home.for_place', { place: place.name })}</T>
          {pan.data ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.m }}>
              {([
                [t('home.tithi'), `${tr(`panchang.${pan.data.tithi.paksha}`, pan.data.tithi.paksha)} ${tr(`tithis.${pan.data.tithi.name}`, pan.data.tithi.name)}`],
                [t('home.nakshatra'), t(`nakshatras.${pan.data.nakshatra.index}`)],
                [t('home.sunrise'), clock(pan.data.sunrise)],
                [t('home.sunset'), clock(pan.data.sunset)],
                [t('home.rahu_kaal'), pan.data.rahuKaal ? `${clock(pan.data.rahuKaal.start)} – ${clock(pan.data.rahuKaal.end)}` : '—'],
                [t('panchang.vara'), pan.data.vara],
              ] as const).map(([k, v]) => (
                <View key={k} style={{ width: '50%' }}>
                  <T v="tiny" color={c.inkSoft}>{k}</T>
                  <T v="small" style={{ fontWeight: '600' }}>{v}</T>
                </View>
              ))}
            </View>
          ) : <Skeleton h={90} />}
        </Pressable>
      </Section>

      {/* More free services */}
      <Section title={t('home.free_tools')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
          {([
            ['🌌', t('home.q_gochar'), '/tools/gochar'], ['⏳', t('home.q_choghadiya'), '/tools/choghadiya'],
            ['🪐', t('home.q_sade_sati'), '/tools/sade-sati'], ['🔢', t('home.q_numerology'), '/tools/numerology'],
          ] as const).map(([icon, label, href]) => (
            <Pressable key={href} onPress={() => router.push(href)} accessibilityRole="button"
              style={({ pressed }) => ({ width: '48.5%', flexDirection: 'row', alignItems: 'center', gap: space.s, padding: space.m, borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, opacity: pressed ? 0.8 : 1 })}>
              <T style={{ fontSize: 22, lineHeight: 28 }}>{icon}</T>
              <T v="small" style={{ fontWeight: '600', flex: 1 }} numberOfLines={2}>{label}</T>
            </Pressable>
          ))}
        </View>
      </Section>

      {/* My Kundlis */}
      {list.length ? (
        <Section title={t('home.my_kundlis')} action={<Pressable hitSlop={8} onPress={() => router.push('/(tabs)/kundli')}><T v="small" color={c.primary} style={{ fontWeight: '700' }}>+ {t('kundli.new')}</T></Pressable>}>
          {list.slice(0, 4).map((k, i, a) => (
            <Row key={k.id} title={k.name} subtitle={`${new Date(`${k.date}T00:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' })}${k.time ? ` · ${k.time}` : ''} · ${k.placeName}`}
              onPress={() => router.push({ pathname: '/kundli/[id]', params: { id: k.id } })} last={i === a.length - 1} />
          ))}
        </Section>
      ) : null}

      <T v="tiny" color={c.inkSoft} style={{ marginTop: space.xl }}>{t('common.disclaimer')}</T>
      <StartPanditSheet pandit={chosen} onClose={() => setChosen(null)} />
    </Screen>
  );
}
