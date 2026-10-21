import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { api, rupees } from '@/lib/api';
import { emitAck, getSocket, useSocketEvent } from '@/lib/socket';
import { useApp } from '@/lib/store';
import { space, type, useTheme } from '@/lib/theme';
import type { Message, Pandit, Session } from '@/lib/types';
import { RTL_LANGS } from '@/i18n';
import { Badge, Button, Field, Loading, rtlText, Sheet, T } from '@/components/ui';
import { CareCard, ReportSheet } from '@/components/Safety';
import { BillingBar } from '@/components/BillingBar';
import { Avatar } from '@/components/PanditRow';

type FullSession = Session & { pandit: Pandit | null; userName?: string };

export default function ChatScreen() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const router = useRouter();
  const { id, first } = useLocalSearchParams<{ id: string; first?: string }>();
  const me = useApp((s) => s.user);
  const [s, setS] = useState<FullSession | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [banner, setBanner] = useState<{ text: string; action?: 'topup' } | null>(null);
  const [showOriginal, setShowOriginal] = useState<Set<string>>(new Set());
  const [review, setReview] = useState({ open: false, rating: 0, text: '', sent: false });
  const [clientOpen, setClientOpen] = useState(false);
  const [client, setClient] = useState<any>(null);
  const [care, setCare] = useState(false);
  const [menu, setMenu] = useState(false);
  const [report, setReport] = useState<{ messageId?: string } | null>(null);
  const firstSent = useRef(false);
  const listRef = useRef<FlatList<Message>>(null);

  const viewer: 'user' | 'pandit' = s && me && s.userId !== me.id ? 'pandit' : 'user';
  const otherName = s?.kind === 'ai' ? 'Taara AI' : viewer === 'pandit' ? s?.userName ?? '' : s?.pandit?.displayName ?? '';

  const load = useCallback(async () => {
    const [sess, m] = await Promise.all([api<FullSession>(`/sessions/${id}`), api<Message[]>(`/sessions/${id}/messages`)]);
    setS(sess); setMsgs(m.filter((x) => x.sender !== 'system'));
  }, [id]);

  useEffect(() => {
    load().catch(() => Alert.alert(t('common.network_error')));
    const sock = getSocket();
    const join = () => emitAck('session:join', id).catch(() => {});
    join();
    sock?.on('connect', join); // re-join after reconnect
    return () => { sock?.off('connect', join); };
  }, [id, load, t]);

  // Auto-send a topic question once the session is live.
  useEffect(() => {
    if (first && !firstSent.current && s?.status === 'active') { firstSent.current = true; send(first); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.status, first]);

  const merge = (m: Message) => setMsgs((prev) => {
    const i = prev.findIndex((x) => x.id === m.id || (m.clientId && x.clientId === m.clientId));
    if (i >= 0) { const n = [...prev]; n[i] = { ...prev[i], ...m }; return n; }
    return [...prev, m];
  });

  const isMine = (x: { id: string }) => x.id === id;
  useSocketEvent<Message>('message:new', (m) => {
    if (m.sessionId !== id) return;
    if (m.pendingId) setStreaming(null);
    if (m.sender !== 'user' || viewer === 'pandit') setTyping(false);
    merge(m);
  }, [id, viewer]);
  useSocketEvent<{ sessionId: string; text: string }>('ai:delta', (d) => { if (d.sessionId === id) { setTyping(false); setStreaming((p) => (p ?? '') + d.text); } }, [id]);
  useSocketEvent<{ id: string; sessionId: string; translations: Record<string, string> }>('message:translated', (d) => {
    if (d.sessionId === id) setMsgs((prev) => prev.map((m) => (m.id === d.id ? { ...m, translations: d.translations } : m)));
  }, [id]);
  useSocketEvent<{ sessionId: string; userId: string }>('typing', (d) => { if (d.sessionId === id && d.userId !== me?.id) { setTyping(true); setTimeout(() => setTyping(false), 4000); } }, [id]);
  useSocketEvent<Session>('session:update', (u) => { if (isMine(u)) setS((p) => (p ? { ...p, ...u } : p)); }, [id]);
  useSocketEvent<Session>('session:ended', (u) => {
    if (!isMine(u)) return;
    setS((p) => (p ? { ...p, ...u } : p));
    if (u.endReason === 'insufficient_balance') setBanner({ text: t('session.zero_balance'), action: 'topup' });
    if (u.kind === 'pandit' && viewer === 'user' && u.startedAt) setReview((r) => ({ ...r, open: true }));
    useApp.getState().refreshUser().catch(() => {});
  }, [id, viewer]);
  useSocketEvent<{ sessionId: string; minutesLeft: number }>('free:warning', (e) => { if (e.sessionId === id) setBanner({ text: t('session.free_warning', { minutes: e.minutesLeft }) }); }, [id]);
  useSocketEvent<{ sessionId: string; minutesLeft: number }>('balance:low', (e) => { if (e.sessionId === id) setBanner({ text: t('session.low_balance', { minutes: e.minutesLeft }), action: 'topup' }); }, [id]);
  useSocketEvent<{ sessionId: string }>('safety:care', (e) => { if (e.sessionId === id) setCare(true); }, [id]);
  useSocketEvent<{ sessionId: string }>('message:masked', (e) => { if (e.sessionId === id) setBanner({ text: t('safety.masked') }); }, [id]);
  useSocketEvent<{ sessionId: string }>('free:ended', (e) => { if (e.sessionId === id) { setBanner(null); setS((p) => (p ? { ...p, status: 'awaiting_consent' } : p)); } }, [id]);

  const send = async (body = text) => {
    const value = body.trim();
    if (!value || !s) return;
    const clientId = `c${Date.now()}`;
    setText('');
    merge({ id: clientId, clientId, sessionId: id, sender: viewer, text: value, lang: null, translations: {}, createdAt: new Date().toISOString() });
    const r = await emitAck<{ ok: boolean; error?: string }>('message:send', { sessionId: id, text: value, clientId }).catch(() => ({ ok: false, error: 'network' }));
    if (!r.ok) {
      setMsgs((prev) => prev.filter((m) => m.clientId !== clientId));
      setText(value);
      if (r.error === 'insufficient_balance') setBanner({ text: t('session.zero_balance'), action: 'topup' });
      else Alert.alert(r.error === 'network' ? t('common.network_error') : t('common.error_generic'));
    }
  };

  const end = () => Alert.alert(t('session.end_confirm'), '', [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('session.end'), style: 'destructive', onPress: async () => { try { const u = await api<Session>(`/sessions/${id}/end`, { body: {} }); setS((p) => (p ? { ...p, ...u } : p)); } catch { /* socket will update */ } } },
  ]);

  const consent = async (accept: boolean) => {
    try { const u = await api<Session>(`/sessions/${id}/consent`, { body: { accept } }); setS((p) => (p ? { ...p, ...u } : p)); }
    catch { Alert.alert(t('common.error_generic')); }
  };

  const openClient = async () => {
    setClientOpen(true);
    if (!client) setClient(await api(`/pandit/sessions/${id}/client`).catch(() => ({ profile: null })));
  };

  const data = useMemo(() => {
    const out = [...msgs];
    if (streaming) out.push({ id: 'streaming', sessionId: id, sender: 'ai', text: streaming, lang: null, translations: {}, createdAt: '' });
    return out;
  }, [msgs, streaming, id]);

  if (!s) return <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}><Loading /></SafeAreaView>;
  const closed = ['ended', 'rejected', 'missed'].includes(s.status);
  const canType = s.status === 'active' || s.status === 'paused';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      {/* Header: always clear whether this is AI or a human Pandit. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: space.s }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('common.back')} hitSlop={12}><T v="h1">‹</T></Pressable>
        {s.kind === 'pandit' && viewer === 'user' ? <Avatar name={otherName} url={s.pandit?.photoUrl} size={36} /> : null}
        <View style={{ flex: 1 }}>
          <T style={{ fontWeight: '700' }} numberOfLines={1}>{otherName}{s.kind === 'pandit' && viewer === 'user' ? ' ✓' : ''}</T>
          <T v="tiny" color={c.inkSoft}>{s.kind === 'ai' ? t('session.you_are_talking_to_ai') : viewer === 'user' ? t('common.verified') : ''}</T>
        </View>
        {s.kind === 'ai' ? <Badge text={t('common.ai_label')} tone="marigold" /> : null}
        {viewer === 'pandit' ? <Button title={t('pandit.client_details').split(' ')[0]} small kind="secondary" onPress={openClient} /> : null}
        {!closed && s.status !== 'requested' ? <Button title={t('session.end')} small kind="danger" onPress={end} /> : null}
        <Pressable onPress={() => setMenu(true)} accessibilityRole="button" accessibilityLabel={t('safety.more')} hitSlop={12}><T v="h2">⋯</T></Pressable>
      </View>
      {s.status !== 'requested' && !closed ? <BillingBar s={s} viewer={viewer} /> : null}
      {s.status === 'paused' ? <View style={{ padding: space.m, backgroundColor: c.surfaceAlt }}><T v="small">{t('session.paused')}</T></View> : null}
      {banner ? (
        <Pressable onPress={() => { if (banner.action === 'topup') router.push('/topup'); setBanner(null); }}
          style={{ padding: space.m, backgroundColor: c.marigold }} accessibilityRole="button">
          <T v="small" color={c.marigoldInk} style={{ fontWeight: '600' }}>{banner.text}{banner.action ? `  ·  ${t('session.add_money')}` : ''}</T>
        </Pressable>
      ) : null}

      {s.status === 'requested' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.l }}>
          <Avatar name={s.pandit?.displayName ?? ''} url={s.pandit?.photoUrl} size={88} />
          <T v="h2" style={{ textAlign: 'center' }}>{viewer === 'user' ? t('consult.waiting', { name: s.pandit?.displayName }) : t('pandit.new_request')}</T>
          <ActivityIndicator color={c.primary} />
          <T color={c.inkSoft} style={{ textAlign: 'center' }}>{t('consult.waiting_hint')}</T>
          {viewer === 'pandit' ? (
            <View style={{ flexDirection: 'row', gap: space.s, alignSelf: 'stretch' }}>
              <Button title={t('pandit.decline')} kind="secondary" style={{ flex: 1 }} onPress={() => api(`/pandit/sessions/${id}/respond`, { body: { accept: false } }).then(load)} />
              <Button title={t('pandit.accept')} style={{ flex: 1 }} onPress={() => api(`/pandit/sessions/${id}/respond`, { body: { accept: true } }).then(load)} />
            </View>
          ) : <Button title={t('common.cancel')} kind="secondary" onPress={() => api(`/sessions/${id}/end`, { body: {} }).then(() => router.back())} />}
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
          <FlatList
            ref={listRef}
            data={data}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: space.l, gap: space.s }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item: m }) => {
              const mine = m.sender === viewer;
              const translated = !mine ? Object.values(m.translations ?? {})[0] : undefined;
              const original = showOriginal.has(m.id);
              const shown = translated && !original ? translated : m.text;
              const rtl = RTL_LANGS.has(m.lang ?? s.userLanguage);
              return (
                <Pressable style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '86%' }} disabled={mine}
                  onLongPress={() => setReport({ messageId: m.id })} delayLongPress={400} accessibilityHint={mine ? undefined : t('safety.long_press_report')}>
                  <View style={{ backgroundColor: mine ? c.primary : c.surface, borderRadius: 18, borderBottomRightRadius: mine ? 4 : 18, borderBottomLeftRadius: mine ? 18 : 4,
                    paddingHorizontal: space.m, paddingVertical: space.s, borderWidth: mine ? 0 : 1, borderColor: c.line }}>
                    <T selectable color={mine ? c.onPrimary : c.ink} style={rtlText(rtl && !translated)}>{shown}</T>
                  </View>
                  {translated ? (
                    <Pressable onPress={() => setShowOriginal((p) => { const n = new Set(p); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })} hitSlop={6}>
                      <T v="tiny" color={c.primary} style={{ marginTop: 2 }}>{original ? t('session.show_translated') : `${t('session.translated')} · ${t('session.show_original')}`}</T>
                    </Pressable>
                  ) : null}
                </Pressable>
              );
            }}
            ListFooterComponent={typing ? <T v="small" color={c.inkSoft} style={{ marginTop: space.s }}>{s.kind === 'ai' ? t('session.thinking') : '…'}</T> : undefined}
            ListHeaderComponent={
              <View style={{ gap: space.s, marginBottom: space.s }}>
                {care ? <CareCard /> : null}
                <T v="tiny" color={c.inkSoft} style={{ textAlign: 'center' }}>{s.kind === 'ai' ? t('common.disclaimer') : t('safety.chat_notice')}</T>
              </View>
            }
          />
          {closed ? (
            <View style={{ padding: space.l, gap: space.s, borderTopWidth: 1, borderTopColor: c.line }}>
              <T style={{ fontWeight: '700', textAlign: 'center' }}>
                {s.status === 'rejected' ? t('consult.declined') : s.status === 'missed' ? t('consult.missed') : t('session.ended')}
              </T>
              {s.status === 'ended' ? (
                <T v="small" color={c.inkSoft} style={{ textAlign: 'center' }}>
                  {s.chargedPaise > 0
                    ? t('session.summary', { minutes: Math.ceil((s.freeSecondsUsed + s.paidSeconds) / 60), cost: rupees(s.chargedPaise, 2) })
                    : t('session.summary_free', { minutes: Math.ceil((s.freeSecondsUsed + s.paidSeconds) / 60) })}
                </T>
              ) : null}
              {s.kind === 'pandit' && viewer === 'user' && s.status === 'ended' && !review.sent
                ? <Button title={t('session.rate_title')} kind="secondary" onPress={() => setReview((r) => ({ ...r, open: true }))} /> : null}
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: space.s, padding: space.m, borderTopWidth: 1, borderTopColor: c.line, alignItems: 'flex-end' }}>
              <TextInput value={text} onChangeText={(v) => { setText(v); getSocket()?.emit('typing', id); }} placeholder={t('session.type_message')}
                placeholderTextColor={c.inkSoft} multiline editable={canType} maxLength={2000}
                style={[type.body, { flex: 1, color: c.ink, backgroundColor: c.surface, borderRadius: 22, paddingHorizontal: space.l, paddingTop: 12, paddingBottom: 12, maxHeight: 140, borderWidth: 1, borderColor: c.line }]} />
              <Button title={t('session.send')} onPress={() => send()} disabled={!text.trim() || !canType} style={{ borderRadius: 22, minHeight: 48 }} />
            </View>
          )}
        </KeyboardAvoidingView>
      )}

      {/* Safety menu: report and block (App Store 1.2 / Play user-generated content policy). */}
      <Sheet visible={menu} onClose={() => setMenu(false)}>
        <View style={{ gap: space.s }}>
          <Button title={s.kind === 'ai' ? t('safety.report_answer') : viewer === 'user' ? t('safety.report_pandit') : t('safety.report_user')} kind="secondary"
            onPress={() => { setMenu(false); setReport({}); }} />
          {s.kind === 'pandit' && viewer === 'user' && s.panditId ? (
            <Button title={t('safety.block_pandit')} kind="danger" onPress={() => Alert.alert(t('safety.block_q', { name: otherName }), t('safety.block_body'), [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('safety.block'), style: 'destructive', onPress: async () => {
                setMenu(false);
                try { await api(`/blocks/${s.panditId}`, { method: 'PUT', body: {} }); router.back(); } catch { Alert.alert(t('common.error_generic')); }
              } },
            ])} />
          ) : null}
          <Button title={t('safety.title')} kind="ghost" onPress={() => { setMenu(false); router.push('/safety'); }} />
        </View>
      </Sheet>
      <ReportSheet visible={!!report} onClose={() => setReport(null)}
        context={{ sessionId: s.id, messageId: report?.messageId, panditId: s.panditId ?? undefined }}
        categories={s.kind === 'ai' ? ['ai_answer', 'billing', 'technical', 'other'] : ['pandit_behaviour', 'abusive_message', 'billing', 'other']} />

      {/* Free time ended: explicit consent before any charge. */}
      <Sheet visible={s.status === 'awaiting_consent' && viewer === 'user'} onClose={() => {}}>
        <T v="h2">{t('session.free_ended_title')}</T>
        <T>{t('session.free_ended_body', { name: otherName, price: rupees(s.ratePaise), balance: rupees(s.balancePaise ?? 0, 2) })}</T>
        {(s.balancePaise ?? 0) >= s.ratePaise
          ? <Button title={t('session.continue_paid', { price: rupees(s.ratePaise) })} onPress={() => consent(true)} />
          : <Button title={t('session.add_money')} kind="marigold" onPress={() => router.push('/topup')} />}
        <Button title={t('session.stop_here')} kind="ghost" onPress={() => consent(false)} />
      </Sheet>

      <Sheet visible={review.open} onClose={() => setReview((r) => ({ ...r, open: false }))}>
        <T v="h2">{t('session.rate_title')}</T>
        <View style={{ flexDirection: 'row', gap: space.s, justifyContent: 'center' }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} onPress={() => setReview((r) => ({ ...r, rating: n }))} accessibilityRole="button" accessibilityLabel={`${n}`} hitSlop={6}>
              <T style={{ fontSize: 36, lineHeight: 44 }} color={n <= review.rating ? c.marigold : c.line}>★</T>
            </Pressable>
          ))}
        </View>
        <Field value={review.text} onChangeText={(v) => setReview((r) => ({ ...r, text: v }))} placeholder={t('session.rate_placeholder')} multiline />
        <Button title={t('session.submit_review')} disabled={!review.rating} onPress={async () => {
          await api(`/sessions/${id}/review`, { body: { rating: review.rating, text: review.text || undefined } }).catch(() => {});
          setReview({ open: false, rating: 0, text: '', sent: true });
        }} />
      </Sheet>

      <Sheet visible={clientOpen} onClose={() => setClientOpen(false)}>
        <T v="h2">{t('pandit.client_details')}</T>
        {client?.profile ? (
          <View style={{ gap: space.xs }}>
            <T style={{ fontWeight: '700' }}>{client.profile.name}</T>
            <T>{client.profile.date} · {client.profile.timeAccuracy === 'unknown' ? '—' : client.profile.time} ({client.profile.timeAccuracy})</T>
            <T>{client.profile.placeName} ({client.profile.lat.toFixed(2)}, {client.profile.lon.toFixed(2)}) UTC{client.profile.tzOffsetMinutes >= 0 ? '+' : '-'}{Math.abs(client.profile.tzOffsetMinutes / 60)}</T>
          </View>
        ) : client ? <T color={c.inkSoft}>{t('pandit.no_client_details')}</T> : <ActivityIndicator />}
      </Sheet>
    </SafeAreaView>
  );
}
