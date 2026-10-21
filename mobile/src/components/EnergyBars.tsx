import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { T } from './ui';
import { space, useTheme } from '@/lib/theme';

type Energy = { overall: number; love: number; career: number; money: number; health: number; family?: number };

/** Plain horizontal bars with the number — simpler to read than gauges or astrology jargon. */
export function EnergyBars({ energy }: { energy: Energy }) {
  const { t } = useTranslation();
  const { c } = useTheme();
  const rows: [string, number][] = [
    [t('home.overall'), energy.overall], [t('home.love'), energy.love], [t('home.career'), energy.career],
    [t('home.money'), energy.money], [t('home.health'), energy.health],
  ];
  return (
    <View style={{ gap: space.s }}>
      {rows.map(([label, v], i) => (
        <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}
          accessible accessibilityLabel={`${label} ${v} / 100`}>
          <T v="small" style={{ width: 84, fontWeight: i === 0 ? '700' : '400' }} numberOfLines={1}>{label}</T>
          <View style={{ flex: 1, height: i === 0 ? 10 : 6, borderRadius: 5, backgroundColor: c.surfaceAlt, overflow: 'hidden' }}>
            <View style={{ width: `${v}%`, height: '100%', borderRadius: 5, backgroundColor: v >= 70 ? c.marigold : v >= 50 ? c.kesariSoft : c.inkSoft }} />
          </View>
          <T v="small" color={c.inkSoft} style={{ width: 28, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{v}</T>
        </View>
      ))}
    </View>
  );
}
