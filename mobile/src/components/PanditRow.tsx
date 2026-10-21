import React from 'react';
import { Image, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { rupees } from '@/lib/api';
import { space, useTheme } from '@/lib/theme';
import type { Pandit } from '@/lib/types';
import { langName } from '@/i18n/languages';
import { Badge, Button, T } from './ui';

export function Avatar({ name, url, size = 56 }: { name: string; url?: string | null; size?: number }) {
  const { c } = useTheme();
  if (url) return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} accessibilityIgnoresInvertColors />;
  const initials = name.replace(/^(Pt\.|Acharya|Jyotishi)\s+/i, '').split(' ').map((w) => w[0]).slice(0, 2).join('');
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.sky, alignItems: 'center', justifyContent: 'center' }}>
      <T style={{ fontWeight: '700' }} color={c.marigold}>{initials}</T>
    </View>
  );
}

export function PanditRow({ p, freeMinutes, onOpen, onChat }: { p: Pandit; freeMinutes: number; onOpen: () => void; onChat: () => void }) {
  const { t } = useTranslation();
  const { c } = useTheme();
  const available = p.online && !p.busy;
  return (
    <Pressable onPress={onOpen} accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: 'row', gap: space.m, paddingVertical: space.l, borderBottomWidth: 1, borderBottomColor: c.line, opacity: pressed ? 0.7 : 1 })}>
      <View>
        <Avatar name={p.displayName} url={p.photoUrl} />
        <View style={{ position: 'absolute', right: 0, bottom: 0, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: c.bg,
          backgroundColor: available ? c.leaf : p.online ? c.marigold : c.line }} accessibilityLabel={available ? t('common.online') : p.online ? t('common.busy') : t('common.offline')} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T style={{ fontWeight: '700' }} numberOfLines={1}>{p.displayName}{p.verified ? ' ✓' : ''}</T>
        <T v="small" color={c.inkSoft} numberOfLines={1}>{p.languages.map(langName).join(' · ')}</T>
        <T v="small" color={c.inkSoft} numberOfLines={1}>{p.specializations.map((s) => t(`spec.${s}`)).join(', ')} · {t('common.years', { count: p.experienceYears })}</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, marginTop: 4 }}>
          {p.rating ? <T v="small" style={{ fontWeight: '600' }}>★ {p.rating.toFixed(1)}</T> : null}
          <T v="small" style={{ fontWeight: '700' }}>{t('common.per_min', { price: rupees(p.chatRatePaise) })}</T>
          {freeMinutes > 0 && p.participatesInFree ? <Badge text={t('common.free')} /> : null}
        </View>
      </View>
      <View style={{ justifyContent: 'center' }}>
        <Button title={t('consult.chat')} small kind={available ? 'primary' : 'secondary'} disabled={!available} onPress={onChat} />
      </View>
    </Pressable>
  );
}
