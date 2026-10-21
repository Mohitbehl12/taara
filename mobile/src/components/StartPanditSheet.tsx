import React, { useState } from 'react';
import { Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { rupees } from '@/lib/api';
import { startConsult } from '@/lib/consult';
import { useApp } from '@/lib/store';
import { space, useTheme } from '@/lib/theme';
import type { Pandit } from '@/lib/types';
import { Button, Sheet, T } from './ui';

/** Shows the exact price (and free minutes) before any paid session starts. */
export function StartPanditSheet({ pandit, onClose }: { pandit: Pandit | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { c } = useTheme();
  const router = useRouter();
  const user = useApp((s) => s.user);
  const [share, setShare] = useState(true);
  const [busy, setBusy] = useState(false);
  if (!pandit) return null;
  const freeMin = Math.floor((user?.freeSecondsRemaining ?? 0) / 60);
  const free = freeMin > 0 && pandit.participatesInFree;
  const price = rupees(pandit.chatRatePaise);

  return (
    <Sheet visible={!!pandit} onClose={onClose}>
      <T v="h2">{t('consult.price_confirm_title', { name: pandit.displayName })}</T>
      <T>{free ? t('consult.price_free', { minutes: freeMin, price }) : t('consult.price_paid', { price, balance: rupees(user?.balancePaise ?? 0) })}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.m }}>
        <T v="small" style={{ flex: 1 }} color={c.inkSoft}>{t('consult.share_chart')}</T>
        <Switch value={share} onValueChange={setShare} trackColor={{ true: c.primary, false: c.line }} thumbColor={c.surface} ios_backgroundColor={c.line} accessibilityLabel={t('consult.share_chart')} />
      </View>
      {!free && (user?.balancePaise ?? 0) < pandit.chatRatePaise ? (
        <Button title={t('session.add_money')} kind="marigold" onPress={() => { onClose(); router.push('/topup'); }} />
      ) : (
        <Button title={t('consult.start')} loading={busy} onPress={async () => {
          setBusy(true);
          await startConsult(router, t, { kind: 'pandit', mode: 'chat', panditId: pandit.id, shareChart: share });
          setBusy(false); onClose();
        }} />
      )}
    </Sheet>
  );
}
