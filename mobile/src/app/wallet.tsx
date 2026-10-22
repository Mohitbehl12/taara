import React from 'react';
import { RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { rupees } from '@/lib/api';
import { useApp } from '@/lib/store';
import { useFetch } from '@/lib/useFetch';
import { space, useTheme } from '@/lib/theme';
import { Button, Screen, Section, T } from '@/components/ui';
import { LoginGate, useSignedIn } from '@/components/Gates';

interface Tx { id: string; type: string; amountPaise: number; balanceAfter: number; createdAt: string; note: string | null }

function WalletScreen() {
  const { t, i18n } = useTranslation();
  const { c } = useTheme();
  const router = useRouter();
  const user = useApp((s) => s.user);
  const tx = useFetch<Tx[]>('/wallet/transactions');
  const freeMin = Math.floor((user?.freeSecondsRemaining ?? 0) / 60);

  return (
    <Screen edges={[]} refreshControl={<RefreshControl refreshing={tx.loading && !!tx.data} onRefresh={() => { tx.reload(); useApp.getState().refreshUser(); }} />}>
      <View style={{ backgroundColor: c.sky, borderRadius: 24, padding: space.xl, gap: space.s, marginTop: space.m }}>
        <T v="small" color="rgba(255,244,220,0.75)">{t('wallet.balance')}</T>
        <T style={{ fontSize: 40, lineHeight: 48, fontWeight: '700', fontVariant: ['tabular-nums'] }} color={c.skyInk}>{rupees(user?.balancePaise ?? 0, 2)}</T>
        {freeMin > 0 ? <T v="small" color={c.marigold}>{t('wallet.free_minutes', { minutes: freeMin })}</T> : null}
        <Button title={t('wallet.add')} kind="primary" onPress={() => router.push('/topup')} style={{ marginTop: space.s }} />
      </View>
      <Section title={t('wallet.history')}>
        {tx.data?.length ? tx.data.map((x) => (
          <View key={x.id} style={{ flexDirection: 'row', paddingVertical: space.m, borderBottomWidth: 1, borderBottomColor: c.line }}>
            <View style={{ flex: 1 }}>
              <T>{t(`wallet.t_${x.type}`, { defaultValue: x.type })}</T>
              <T v="tiny" color={c.inkSoft}>{new Date(x.createdAt).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })}</T>
            </View>
            <T style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }} color={x.amountPaise > 0 ? c.leaf : c.ink}>
              {x.amountPaise > 0 ? '+' : '−'}{rupees(Math.abs(x.amountPaise), 2)}
            </T>
          </View>
        )) : tx.data ? <T color={c.inkSoft}>{t('wallet.empty')}</T> : null}
      </Section>
      <T v="tiny" color={c.inkSoft} style={{ marginTop: space.xl }}>{t('wallet.refund_policy')}</T>
    </Screen>
  );
}

/** Needs an account; guests see a short explanation and a login button. */
export default function Wallet() {
  return useSignedIn() ? <WalletScreen /> : <LoginGate next="/wallet" icon="👛" />;
}
