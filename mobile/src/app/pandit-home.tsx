import React, { useState } from 'react';
import { Alert, RefreshControl, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { api, rupees } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { useApp } from '@/lib/store';
import { useFetch } from '@/lib/useFetch';
import { space, useTheme } from '@/lib/theme';
import type { Pandit, Session } from '@/lib/types';
import { Badge, Button, Row, Screen, Section, T } from '@/components/ui';

interface Earnings { balancePaise: number; todayPaise: number; weekPaise: number; monthPaise: number; totalSessions: number; totalMinutes: number; minPayoutPaise: number }
type PSession = Session & { userName: string };

export default function PanditHome() {
  const { t, i18n } = useTranslation();
  const { c } = useTheme();
  const router = useRouter();
  const setMode = useApp((s) => s.setMode);
  const me = useFetch<Pandit & { status: string; earningsPaise: number }>('/pandit/me');
  const earn = useFetch<Earnings>('/pandit/earnings');
  const sessions = useFetch<PSession[]>('/pandit/sessions');
  const [online, setOnline] = useState<boolean | null>(null);
  const isOnline = online ?? me.data?.online ?? false;

  const refresh = () => { me.reload(); earn.reload(); sessions.reload(); };
  useSocketEvent<Session>('session:requested', () => sessions.reload(), []);
  useSocketEvent<Session>('session:ended', () => { sessions.reload(); earn.reload(); }, []);

  const toggle = async (v: boolean) => {
    setOnline(v);
    try { await api('/pandit/online', { body: { online: v } }); } catch { setOnline(!v); Alert.alert(t('common.error_generic')); }
  };
  const respond = async (id: string, accept: boolean) => {
    try {
      await api(`/pandit/sessions/${id}/respond`, { body: { accept } });
      if (accept) router.push({ pathname: '/chat/[id]', params: { id } });
    } catch { Alert.alert(t('common.error_generic')); }
    sessions.reload();
  };
  const payout = async () => {
    try { await api('/pandit/payouts', { body: {} }); refresh(); }
    catch { Alert.alert(t('pandit.min_payout', { amount: rupees(earn.data?.minPayoutPaise ?? 50000) })); }
  };

  const pending = sessions.data?.filter((s) => s.status === 'requested') ?? [];
  const live = sessions.data?.filter((s) => s.status === 'active' || s.status === 'awaiting_consent') ?? [];
  const past = sessions.data?.filter((s) => s.status === 'ended').slice(0, 15) ?? [];

  return (
    <Screen refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}>
      <View style={{ paddingTop: space.l, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T v="h1">{t('pandit.dashboard')}</T>
        <Button title={t('profile.user_mode')} small kind="ghost" onPress={async () => { await setMode('user'); router.replace('/(tabs)'); }} />
      </View>

      <View style={{ marginTop: space.l, backgroundColor: isOnline ? c.leaf : c.surfaceAlt, borderRadius: 20, padding: space.l, flexDirection: 'row', alignItems: 'center', gap: space.m }}>
        <View style={{ flex: 1 }}>
          <T v="h2" color={isOnline ? c.onLeaf : c.ink}>{isOnline ? t('common.online') : t('common.offline')}</T>
          <T v="small" color={isOnline ? c.onLeaf : c.inkSoft}>{isOnline ? t('pandit.you_are_online') : t('pandit.you_are_offline')}</T>
        </View>
        <Switch value={isOnline} onValueChange={toggle} trackColor={{ true: c.marigold, false: c.line }} thumbColor={c.surface} ios_backgroundColor={c.line} accessibilityLabel={isOnline ? t('pandit.go_offline') : t('pandit.go_online')} />
      </View>

      {pending.length ? (
        <Section title={t('pandit.requests')}>
          {pending.map((s) => (
            <View key={s.id} style={{ backgroundColor: c.surface, borderRadius: 16, padding: space.l, gap: space.s, borderWidth: 2, borderColor: c.marigold, marginBottom: space.s }}>
              <T style={{ fontWeight: '700' }}>{s.userName}</T>
              <T v="small" color={c.inkSoft}>{s.freeEligible ? t('common.free') : t('common.per_min', { price: rupees(s.ratePaise) })}</T>
              <View style={{ flexDirection: 'row', gap: space.s }}>
                <Button title={t('pandit.decline')} kind="secondary" style={{ flex: 1 }} onPress={() => respond(s.id, false)} />
                <Button title={t('pandit.accept')} style={{ flex: 1 }} onPress={() => respond(s.id, true)} />
              </View>
            </View>
          ))}
        </Section>
      ) : null}

      {live.map((s) => <Row key={s.id} title={`● ${s.userName}`} subtitle={t('session.time')} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: s.id } })} />)}

      {earn.data ? (
        <Section>
          <View style={{ flexDirection: 'row', gap: space.s }}>
            {[[t('pandit.today'), earn.data.todayPaise], [t('pandit.this_week'), earn.data.weekPaise], [t('pandit.this_month'), earn.data.monthPaise]].map(([k, v]) => (
              <View key={k as string} style={{ flex: 1, backgroundColor: c.surface, borderRadius: 14, padding: space.m, borderWidth: 1, borderColor: c.line }}>
                <T v="tiny" color={c.inkSoft}>{k}</T>
                <T style={{ fontWeight: '700' }}>{rupees(v as number)}</T>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.l }}>
            <View style={{ flex: 1 }}>
              <T v="small" color={c.inkSoft}>{t('pandit.withdrawable')}</T>
              <T v="h2">{rupees(earn.data.balancePaise, 2)}</T>
            </View>
            <Button title={t('pandit.withdraw')} small kind="secondary" disabled={earn.data.balancePaise < earn.data.minPayoutPaise} onPress={payout} />
          </View>
          <T v="tiny" color={c.inkSoft}>{t('pandit.min_payout', { amount: rupees(earn.data.minPayoutPaise) })}</T>
        </Section>
      ) : null}

      <Section title={t('pandit.recent')}>
        {past.map((s, i) => (
          <Row key={s.id} last={i === past.length - 1} title={s.userName}
            subtitle={`${new Date(s.requestedAt).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })} · ${Math.ceil((s.freeSecondsUsed + s.paidSeconds) / 60)} min`}
            right={<Badge text={rupees(s.panditEarnedPaise ?? 0, 2)} tone="muted" />}
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: s.id } })} />
        ))}
      </Section>

      <Section>
        <Row title={t('pandit.settings')} onPress={() => router.push('/pandit-settings')} last />
      </Section>
    </Screen>
  );
}
