import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useKundliData } from '@/lib/kundlis';
import { KundliChips, MakeKundliInline, useKundliChoice } from '@/components/Gates';
import { space, useTheme } from '@/lib/theme';
import { Badge, ErrorState, Loading, Screen, T } from '@/components/ui';

interface Res { moonSign: number; transits: { planet: string; sign: number; house: number; favourable: boolean }[] }

export default function Gochar() {
  const { t, i18n } = useTranslation();
  const { c } = useTheme();
  const { list, k, setId } = useKundliChoice();
  const r = useKundliData<Res>(k, 'gochar', i18n.language);
  if (!k) return <Screen edges={[]} style={{ paddingTop: space.m, gap: space.l }}><T v="h1">{t('gochar.title')}</T><MakeKundliInline /></Screen>;
  if (r.error) return <ErrorState message={t('common.network_error')} onRetry={r.reload} />;
  if (!r.data) return <Loading />;
  return (
    <Screen edges={[]} style={{ paddingTop: space.m }}>
      <T v="h1">{t('gochar.title')}</T>
      <View style={{ marginTop: space.s }}><KundliChips list={list} value={k} onChange={setId} /></View>
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
