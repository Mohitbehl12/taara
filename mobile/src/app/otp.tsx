import React, { useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { useApp } from '@/lib/store';
import { deviceId } from '@/lib/device';
import { space, useTheme } from '@/lib/theme';
import { Button, Field, Screen, T } from '@/components/ui';
import { errorMessage } from '@/lib/errors';

export default function Otp() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const { phone = '' } = useLocalSearchParams<{ phone?: string }>();
  const signIn = useApp((s) => s.signIn);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(30);

  useEffect(() => { const h = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000); return () => clearInterval(h); }, []);

  const verify = async (value = code) => {
    if (value.length < 6) return;
    setBusy(true); setError(null);
    try {
      const r = await api<{ token: string }>('/auth/otp/verify', { body: { phone, code: value, deviceId: await deviceId() } });
      await signIn(r.token);
    } catch (e: any) {
      setError(e.code === 'otp_expired' ? t('auth.otp_expired') : e.code === 'otp_invalid' ? t('auth.otp_invalid') : errorMessage(t, e));
    } finally { setBusy(false); }
  };

  const resend = async () => { setWait(30); setError(null); try { await api('/auth/otp/send', { body: { phone } }); } catch (e: any) { setError(errorMessage(t, e)); } };

  return (
    <Screen style={{ paddingTop: space.xxl, gap: space.l }}>
      <T v="h1">{t('auth.otp_title')}</T>
      <T color={c.inkSoft}>{t('auth.otp_hint', { phone: `+91 ${phone}` })}</T>
      <Field value={code} onChangeText={(v) => { const d = v.replace(/\D/g, '').slice(0, 6); setCode(d); if (d.length === 6) verify(d); }}
        keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" autoFocus maxLength={6}
        style={{ fontSize: 28, letterSpacing: 12, textAlign: 'center' }} error={error} accessibilityLabel={t('auth.otp_title')} />
      <Button title={t('auth.verify')} onPress={() => verify()} loading={busy} disabled={code.length < 6} />
      <Pressable onPress={resend} disabled={wait > 0} accessibilityRole="button">
        <T color={wait > 0 ? c.inkSoft : c.primary} style={{ textAlign: 'center', fontWeight: '600' }}>
          {wait > 0 ? t('auth.resend_in', { s: wait }) : t('auth.resend')}
        </T>
      </Pressable>
    </Screen>
  );
}
