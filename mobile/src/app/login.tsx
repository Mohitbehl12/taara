import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { finishLogin } from '@/lib/auth';
import { useTranslation } from 'react-i18next';
import * as AppleAuthentication from 'expo-apple-authentication';
import { api } from '@/lib/api';
import { useApp } from '@/lib/store';
import { space, useTheme } from '@/lib/theme';
import { Button, Field, Screen, T } from '@/components/ui';
import { errorMessage } from '@/lib/errors';

export default function Login() {
  const { t } = useTranslation();
  const { c, dark } = useTheme();
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const signIn = useApp((s) => s.signIn);
  const meta = useApp((s) => s.meta);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const digits = phone.replace(/\D/g, '');
  const valid = /^[6-9]\d{9}$/.test(digits);

  const send = async () => {
    if (!valid) { setError(t('auth.invalid_phone')); return; }
    setBusy(true); setError(null);
    try {
      await api('/auth/otp/send', { body: { phone: digits } });
      router.push({ pathname: '/otp', params: { phone: digits, ...(next ? { next } : {}) } });
    } catch (e: any) {
      setError(errorMessage(t, e));
    } finally { setBusy(false); }
  };

  const apple = async () => {
    try {
      const cred = await AppleAuthentication.signInAsync({ requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME] });
      const name = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ') || undefined;
      const r = await api<{ token: string }>('/auth/social', { body: { provider: 'apple', idToken: cred.identityToken, name } });
      await signIn(r.token);
      finishLogin(router, next);
    } catch (e: any) {
      if (e?.code !== 'ERR_REQUEST_CANCELED') setError(t('common.error_generic'));
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen style={{ paddingTop: space.xxl, gap: space.l }}>
        <T v="h1">{t('auth.phone_title')}</T>
        <T color={c.inkSoft}>{t('auth.phone_hint')}</T>
        <View style={{ flexDirection: 'row', gap: space.s, alignItems: 'flex-start' }}>
          <View style={{ minHeight: 52, paddingHorizontal: space.m, borderRadius: 12, backgroundColor: c.surfaceAlt, justifyContent: 'center' }}>
            <T>+91</T>
          </View>
          <View style={{ flex: 1 }}>
            <Field value={phone} onChangeText={(v) => { setPhone(v); setError(null); }} keyboardType="phone-pad" maxLength={12}
              placeholder={t('auth.phone_placeholder')} autoFocus textContentType="telephoneNumber" autoComplete="tel" error={error} />
          </View>
        </View>
        <Button title={t('auth.send_code')} onPress={send} loading={busy} disabled={!valid} />
        {meta?.pricing.freePanditMinutes ? (
          <View style={{ backgroundColor: c.surface, borderLeftWidth: 3, borderLeftColor: c.leaf, padding: space.m, borderRadius: 8 }}>
            <T v="small">{t('auth.free_gift', { minutes: meta.pricing.freePanditMinutes })}</T>
          </View>
        ) : null}
        {Platform.OS === 'ios' ? (
          <>
            <T v="small" color={c.inkSoft} style={{ textAlign: 'center' }}>{t('auth.or')}</T>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={dark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={14} style={{ height: 52 }} onPress={apple} />
          </>
        ) : null}
        <T v="tiny" color={c.inkSoft} style={{ textAlign: 'center' }}>{t('auth.terms')}</T>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.m }}>
          <T v="tiny" color={c.primary} accessibilityRole="link" onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}>{t('profile.terms')}</T>
          <T v="tiny" color={c.primary} accessibilityRole="link" onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}>{t('profile.privacy_policy')}</T>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
