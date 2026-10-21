import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { T } from './ui';
import { space, useTheme } from '@/lib/theme';

/** Shows the plain-language meaning first, with the technical text one tap away. */
export function ExplainSimply({ title, simple, detailed, defaultDetailed = false }: { title: string; simple: string; detailed: string; defaultDetailed?: boolean }) {
  const { t } = useTranslation();
  const { c } = useTheme();
  const [open, setOpen] = useState(defaultDetailed);
  return (
    <View style={{ paddingVertical: space.m, gap: space.xs }}>
      <T style={{ fontWeight: '600' }}>{title}</T>
      <T color={c.ink}>{simple}</T>
      {open ? <T v="small" color={c.inkSoft} style={{ marginTop: space.xs }}>{detailed}</T> : null}
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" hitSlop={8}>
        <T v="small" color={c.primary} style={{ fontWeight: '600', marginTop: space.xs }}>{open ? t('kundli.simple') : t('kundli.read_detailed')}</T>
      </Pressable>
    </View>
  );
}
