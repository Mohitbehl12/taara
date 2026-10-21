import React, { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  AudioModule, createAudioPlayer, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState, type AudioPlayer,
} from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import * as Haptics from 'expo-haptics';
import { API_URL, api, getToken } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { useApp } from '@/lib/store';
import { space, useTheme } from '@/lib/theme';
import type { Session } from '@/lib/types';
import { LANGUAGES } from '@/i18n/languages';
import { Badge, Button, T } from '@/components/ui';
import { BillingBar } from '@/components/BillingBar';
import { CareCard } from '@/components/Safety';

const MAX_MS = 28_000; // speech-to-text accepts up to 30 s per turn

interface Turn { you: string; ai: string | null }

export default function VoiceScreen() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const meta = useApp((s) => s.meta);
  const language = useApp((s) => s.language);
  const [s, setS] = useState<Session | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [phase, setPhase] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [care, setCare] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const rec = useAudioRecorderState(recorder);
  const player = useRef<AudioPlayer | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ttsAvailable = meta?.languages.find((l) => l.code === language)?.tts ?? true;

  useEffect(() => {
    api<Session>(`/sessions/${id}`).then(setS).catch(() => {});
    (async () => {
      const p = await AudioModule.requestRecordingPermissionsAsync();
      if (!p.granted) Alert.alert(t('session.mic_denied'), '', [{ text: 'Settings', onPress: () => Linking.openSettings() }, { text: t('common.cancel') }]);
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    })();
    return () => { player.current?.remove(); };
  }, [id, t]);

  useSocketEvent<Session>('session:update', (u) => { if (u.id === id) setS((p) => ({ ...(p as Session), ...u })); }, [id]);
  useSocketEvent<Session>('session:ended', (u) => { if (u.id === id) setS((p) => ({ ...(p as Session), ...u })); }, [id]);

  const start = async () => {
    if (phase !== 'idle' || s?.status !== 'active') return;
    player.current?.pause();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    await recorder.prepareToRecordAsync();
    recorder.record();
    setPhase('listening');
    stopTimer.current = setTimeout(() => { stop(); }, MAX_MS);
  };

  const stop = async () => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (!recorder.getStatus().isRecording) return;
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri) { setPhase('idle'); return; }
    setPhase('thinking');
    try {
      const r = await expoFetch(`${API_URL}/sessions/${id}/voice`, {
        method: 'POST', headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'audio/mp4' }, body: new File(uri),
      });
      const j = await r.json();
      if (!r.ok) throw Object.assign(new Error(j.error), { code: j.error });
      if (!j.transcript) { setPhase('idle'); return; }
      setTurns((p) => [...p, { you: j.transcript, ai: j.reply }]);
      if (j.care) setCare(true);
      if (j.session) setS(j.session);
      if (j.audioBase64) {
        const f = new File(Paths.cache, `reply-${Date.now()}.wav`);
        f.write(j.audioBase64, { encoding: 'base64' });
        player.current?.remove();
        player.current = createAudioPlayer({ uri: f.uri });
        player.current.addListener('playbackStatusUpdate', (st) => { if (st.didJustFinish) setPhase('idle'); });
        setPhase('speaking');
        player.current.play();
      } else setPhase('idle');
    } catch (e: any) {
      setPhase('idle');
      if (e.code === 'insufficient_balance') router.push('/topup');
      else Alert.alert(e.code === 'voice_not_configured' ? t('common.error_generic') : t('common.network_error'));
    }
  };

  const end = async () => { player.current?.pause(); await api(`/sessions/${id}/end`, { body: {} }).catch(() => {}); router.back(); };
  const ended = s?.status === 'ended';
  const label = { idle: t('session.hold_to_talk'), listening: t('session.release_to_send'), thinking: t('session.thinking'), speaking: '🔊' }[phase];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.sky }} edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.l, paddingVertical: space.s, gap: space.m }}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}><T v="h1" color={c.skyInk}>‹</T></Pressable>
        <T style={{ flex: 1, fontWeight: '700' }} color={c.skyInk}>{t('session.you_are_talking_to_ai')}</T>
        <Badge text={t('common.ai_label')} tone="marigold" />
      </View>
      {s ? <BillingBar s={s} viewer="user" /> : null}
      {!ttsAvailable ? (
        <View style={{ padding: space.m, backgroundColor: c.surfaceAlt }}>
          <T v="small">{t('session.voice_text_only', { lang: LANGUAGES.find((l) => l.code === language)?.native })}</T>
        </View>
      ) : null}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.l, gap: space.l }}>
        {care ? <CareCard /> : null}
        {turns.map((tr, i) => (
          <View key={i} style={{ gap: space.s }}>
            <T v="small" color="rgba(255,244,220,0.7)">“{tr.you}”</T>
            {tr.ai ? <T color={c.skyInk}>{tr.ai}</T> : null}
          </View>
        ))}
        {turns.length === 0 ? <T color="rgba(255,244,220,0.7)" style={{ textAlign: 'center', marginTop: space.xxl }}>{t('topic_questions.career')}</T> : null}
      </ScrollView>

      <View style={{ alignItems: 'center', gap: space.m, paddingBottom: space.l }}>
        <T color={c.skyInk} style={{ fontWeight: '600' }}>{phase === 'listening' ? `${t('session.listening')} ${Math.floor((rec.durationMillis ?? 0) / 1000)}s` : label}</T>
        <Pressable
          onPressIn={start} onPressOut={stop} disabled={ended || phase === 'thinking'}
          accessibilityRole="button" accessibilityLabel={t('session.hold_to_talk')}
          style={{ width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center',
            backgroundColor: phase === 'listening' ? c.marigold : 'rgba(242,160,7,0.18)', borderWidth: 3, borderColor: c.marigold, opacity: ended ? 0.4 : 1 }}>
          <T style={{ fontSize: 44, lineHeight: 52 }}>🎙</T>
        </Pressable>
        <Button title={ended ? t('common.done') : t('session.end')} kind="secondary" small onPress={ended ? () => router.back() : end} />
      </View>
    </SafeAreaView>
  );
}
