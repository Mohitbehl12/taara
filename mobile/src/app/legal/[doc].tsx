import React from 'react';
import { Linking } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { space, useTheme } from '@/lib/theme';
import { Button, Screen, T } from '@/components/ui';
import { LEGAL } from '@/lib/legal';

export default function Legal() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const { doc = 'terms' } = useLocalSearchParams<{ doc?: string }>();
  const d = LEGAL[doc as keyof typeof LEGAL] ?? LEGAL.terms;
  return (
    <Screen edges={[]} style={{ paddingTop: space.m, gap: space.m }}>
      <T v="h1">{d.title}</T>
      {d.body.map((p, i) => (p.startsWith('## ') ? <T key={i} v="h2" style={{ marginTop: space.m }}>{p.slice(3)}</T> : <T key={i} color={c.ink}>{p}</T>))}
      {doc === 'help' ? <Button title="support@taara.app" kind="secondary" onPress={() => Linking.openURL('mailto:support@taara.app')} /> : null}
      <T v="tiny" color={c.inkSoft}>{t('common.disclaimer')}</T>
    </Screen>
  );
}
