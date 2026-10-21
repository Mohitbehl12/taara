import { Alert } from 'react-native';
import type { useRouter } from 'expo-router';
type Router = ReturnType<typeof useRouter>;
import type { TFunction } from 'i18next';
import { api, ApiError } from './api';
import { useApp } from './store';
import type { Session } from './types';

/** Starts an AI or Pandit session and opens it. Handles "already open" and "add money" cases. */
export async function startConsult(router: Router, t: TFunction, opts: {
  kind: 'ai' | 'pandit'; mode: 'chat' | 'voice'; panditId?: string; shareChart?: boolean; firstMessage?: string;
}) {
  const user = useApp.getState().user;
  const profileId = opts.shareChart === false ? undefined : user?.profiles.find((p) => p.isPrimary)?.id;
  try {
    const s = await api<Session>('/sessions', { body: { kind: opts.kind, mode: opts.mode, panditId: opts.panditId, profileId } });
    const path = opts.kind === 'ai' && opts.mode === 'voice' ? '/voice/[id]' : '/chat/[id]';
    router.push({ pathname: path, params: { id: s.id, first: opts.firstMessage ?? '' } });
  } catch (e) {
    const err = e as ApiError;
    if (err.code === 'insufficient_balance') {
      router.push('/topup');
    } else if (err.code === 'session_already_open' && err.message) {
      router.push({ pathname: '/chat/[id]', params: { id: err.message } });
    } else if (err.code === 'pandit_busy') {
      Alert.alert(t('consult.declined'));
    } else if (err.code === 'calls_coming_soon') {
      Alert.alert(t('consult.calls_soon'));
    } else {
      Alert.alert(err.code === 'network' ? t('common.network_error') : t('common.error_generic'));
    }
  }
}
