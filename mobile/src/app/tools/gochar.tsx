import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useApp } from '@/lib/store';
import { useFetch } from '@/lib/useFetch';
import { space, useTheme } from '@/lib/theme';
import { Badge, ErrorState, Loading, Screen, T } from '@/components/ui';

interface Res { moonSign: number; transits: { planet: string; sign: number; house: number; favourable: boolean }[] }

export default function Gochar() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const pid = useApp((s) => s.user?.profiles.find((p) => p.isPrimary)?.id);
  const r = useFetch<Res>(pid ? `/tools/gochar?profileId=${pid}` : null);
  if (r.error) return <ErrorState message={t('common.network_error')} onRetry={r.reload} />;
  if (!r.data) return <Loading />;
  return (
    <Screen edges={[]} style={{ paddingTop: space.m }}>
      <T v="h1">{t('gochar.title')}</T>
      <T color={c.inkSoft} style={{ marginTop: space.s }}>{t('gochar.subtitle', { sign: t(`signs.${r.data.moonSign}`) })}</T>
      <View style={{ marginTop: space.l }}>
        {r.data.transits.map((tr) => (
          <View key={tr.planet} style={{ paddingVertical: space.m, borderBottomWidth: 1, borderBottomColor: c.line, gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <T style={{ fontWeight: '700' }}>{t(`planets.${tr.planet}`)}</T>
              <Badge text={tr.favourable ? t('gochar.favourable') : t('gochar.challenging')} tone={tr.favourable ? 'marigold' : 'muted'} />
            </View>
            <T v="small" color={c.inkSoft}>{t('gochar.in_house', { sign: t(`signs.${tr.sign}`), house: tr.house })}</T>
            <T>{t('explain.means', { planet: t(`explain.planet.${tr.planet}`), house: t(`explain.house.${tr.house}`) })}</T>
          </View>
        ))}
      </View>
      <T v="tiny" color={c.inkSoft} style={{ marginTop: space.xl }}>{t('common.disclaimer')}</T>
    </Screen>
  );
}
