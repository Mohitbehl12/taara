import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { mmss, rupees } from '@/lib/api';
import { space, useTheme } from '@/lib/theme';
import type { Session } from '@/lib/types';
import { T } from './ui';

/** Always-visible meter: who pays what, right now. Server values refresh every few seconds; the clock ticks locally. */
export function BillingBar({ s, viewer }: { s: Session; viewer: 'user' | 'pandit' }) {
  const { t } = useTranslation();
  const { c } = useTheme();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const h = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(h); }, []);

  const live = s.status === 'active';
  const elapsed = s.startedAt
    ? (s.status === 'ended' || s.status === 'paused' || s.status === 'awaiting_consent'
      ? s.freeSecondsUsed + s.paidSeconds
      : Math.max(s.freeSecondsUsed + s.paidSeconds, (now - Date.parse(s.startedAt)) / 1000))
    : 0;
  const inFree = s.freeEligible && (s.freeSecondsRemaining ?? 0) > 0;
  const freeLeft = inFree ? Math.max(0, (s.freeSecondsRemaining ?? 0) - (live ? Math.max(0, elapsed - s.freeSecondsUsed - s.paidSeconds) : 0)) : 0;
  const rate = s.billingMode === 'per_message' ? t('common.per_msg', { price: rupees(s.ratePaise) }) : t('common.per_min', { price: rupees(s.ratePaise) });

  const cells: [string, string, string?][] = [
    [t('session.time'), mmss(elapsed)],
    inFree ? [t('session.free_left'), mmss(freeLeft), c.leaf] : [t('session.rate'), rate],
    [viewer === 'pandit' ? t('pandit.earned', { amount: '' }).trim() : t('session.cost'),
      viewer === 'pandit' ? rupees(s.panditEarnedPaise ?? 0, 2) : rupees(s.chargedPaise, 2)],
  ];
  if (viewer === 'user' && s.balancePaise !== undefined) cells.push([t('session.balance'), rupees(s.balancePaise, 2)]);

  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.line, paddingVertical: space.s, paddingHorizontal: space.l }}
      accessible accessibilityLabel={cells.map(([k, v]) => `${k} ${v}`).join(', ')}>
      {cells.map(([k, v, color]) => (
        <View key={k} style={{ flex: 1 }}>
          <T v="tiny" color={c.inkSoft}>{k}</T>
          <T v="small" style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }} color={color ?? c.ink}>{v}</T>
        </View>
      ))}
    </View>
  );
}
