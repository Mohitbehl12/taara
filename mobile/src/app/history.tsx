import React from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { rupees } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { space, useTheme } from '@/lib/theme';
import type { Session } from '@/lib/types';
import { Loading, Row, Screen, T } from '@/components/ui';

export default function History() {
  const { t, i18n } = useTranslation();
  const { c } = useTheme();
  const router = useRouter();
  const h = useFetch<(Session & { panditName: string | null })[]>('/sessions');
  if (!h.data) return <Loading />;
  return (
    <Screen edges={[]}>
      <T v="h1" style={{ paddingVertical: space.m }}>{t('profile.history')}</T>
      {h.data.length === 0 ? <T color={c.inkSoft}>{t('profile.no_history')}</T> : h.data.map((s, i) => {
        const min = Math.ceil((s.freeSecondsUsed + s.paidSeconds) / 60);
        return (
          <Row key={s.id} last={i === h.data!.length - 1}
            title={s.kind === 'ai' ? `Taara AI · ${t(s.mode === 'voice' ? 'consult.ai_voice' : 'consult.ai_chat')}` : s.panditName ?? 'Pandit Ji'}
            subtitle={`${new Date(s.requestedAt).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })} · ${s.chargedPaise > 0 ? t('session.summary', { minutes: min, cost: rupees(s.chargedPaise, 2) }) : t('session.summary_free', { minutes: min })}`}
            onPress={() => router.push({ pathname: s.mode === 'voice' && s.kind === 'ai' ? '/voice/[id]' : '/chat/[id]', params: { id: s.id } })} />
        );
      })}
    </Screen>
  );
}
