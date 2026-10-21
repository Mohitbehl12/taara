import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { api, rupees } from '@/lib/api';
import { useApp } from '@/lib/store';
import { useFetch } from '@/lib/useFetch';
import { space, useTheme } from '@/lib/theme';
import type { Pandit } from '@/lib/types';
import { langName } from '@/i18n/languages';
import { Badge, Button, Chip, ErrorState, Loading, Screen, Section, T } from '@/components/ui';
import { Avatar } from '@/components/PanditRow';
import { StartPanditSheet } from '@/components/StartPanditSheet';

export default function PanditProfile() {
  const { t, i18n } = useTranslation();
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useApp((s) => s.user);
  const p = useFetch<Pandit>(`/pandits/${id}`);
  const favs = useFetch<Pandit[]>('/favorites');
  const [chosen, setChosen] = useState<Pandit | null>(null);
  const d = p.data;
  if (p.error && !d) return <ErrorState message={t('common.network_error')} onRetry={p.reload} />;
  if (!d) return <Loading />;
  const fav = favs.data?.some((f) => f.id === d.id) ?? false;
  const available = d.online && !d.busy;
  const freeMin = Math.floor((user?.freeSecondsRemaining ?? 0) / 60);

  const toggleFav = async () => {
    await api(`/favorites/${d.id}`, { method: fav ? 'DELETE' : 'PUT' }).catch(() => {});
    favs.reload();
  };

  return (
    <Screen edges={[]}>
      <View style={{ alignItems: 'center', gap: space.s, paddingTop: space.m }}>
        <Avatar name={d.displayName} url={d.photoUrl} size={96} />
        <T v="h1" style={{ textAlign: 'center' }}>{d.displayName}</T>
        <View style={{ flexDirection: 'row', gap: space.s }}>
          {d.verified ? <Badge text={`✓ ${t('common.verified')}`} /> : null}
          <Badge text={available ? t('common.online') : d.online ? t('common.busy') : t('common.offline')} tone={available ? 'leaf' : 'muted'} />
        </View>
        <T color={c.inkSoft}>
          {d.rating ? `★ ${d.rating.toFixed(1)} (${d.ratingCount}) · ` : ''}{t('consult.consultations', { count: d.totalSessions })} · {t('common.years', { count: d.experienceYears })}
        </T>
      </View>

      <View style={{ flexDirection: 'row', marginTop: space.xl, borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.line }}>
        {([['chat', d.chatRatePaise], ['call', d.voiceRatePaise], ['video', d.videoRatePaise]] as const).map(([k, v], i) => (
          <View key={k} style={{ flex: 1, paddingVertical: space.m, alignItems: 'center', borderLeftWidth: i ? 1 : 0, borderColor: c.line }}>
            <T v="small" color={c.inkSoft}>{t(`consult.${k}`)}</T>
            <T style={{ fontWeight: '700' }}>{t('common.per_min', { price: rupees(v) })}</T>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: space.s, marginTop: space.l }}>
        <Button title={freeMin > 0 && d.participatesInFree ? `${t('consult.chat')} · ${t('common.free')}` : t('consult.chat')} style={{ flex: 2 }} disabled={!available} onPress={() => setChosen(d)} />
        <Button title={fav ? t('consult.favorited') : t('consult.favorite')} kind="secondary" style={{ flex: 1 }} onPress={toggleFav} />
      </View>
      <T v="tiny" color={c.inkSoft} style={{ marginTop: space.s }}>{t('consult.calls_soon')}</T>

      <Section title={t('consult.about')}><T>{d.bio}</T></Section>
      <Section title={t('consult.speaks')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>{d.languages.map((l) => <Chip key={l} label={langName(l)} />)}</View>
      </Section>
      <Section title={t('consult.specialties')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>{d.specializations.map((s) => <Chip key={s} label={t(`spec.${s}`)} />)}</View>
      </Section>
      <Section title={t('consult.reviews')}>
        {d.reviews?.length ? d.reviews.map((r, i) => (
          <View key={i} style={{ paddingVertical: space.m, borderBottomWidth: 1, borderBottomColor: c.line, gap: 2 }}>
            <T v="small" style={{ fontWeight: '600' }}>{'★'.repeat(r.rating)}<T v="small" color={c.line}>{'★'.repeat(5 - r.rating)}</T>  {r.name}</T>
            {r.text ? <T>{r.text}</T> : null}
            <T v="tiny" color={c.inkSoft}>{new Date(r.createdAt).toLocaleDateString(i18n.language)}</T>
          </View>
        )) : <T color={c.inkSoft}>{t('consult.no_reviews')}</T>}
      </Section>
      <StartPanditSheet pandit={chosen} onClose={() => setChosen(null)} />
    </Screen>
  );
}
