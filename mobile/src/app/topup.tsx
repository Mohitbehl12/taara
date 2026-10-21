import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useTranslation } from 'react-i18next';
import { api, rupees } from '@/lib/api';
import { useApp } from '@/lib/store';
import { space, useTheme } from '@/lib/theme';
import { Button, Screen, T } from '@/components/ui';

interface Order { orderId: string; keyId: string | null; creditPaise: number; gstPaise: number; totalPaise: number; demo: boolean }

/** Razorpay Checkout runs inside a WebView (UPI, cards, netbanking, wallets). The server verifies the signature and credits once. */
function checkoutHtml(o: Order, user: { name: string | null; phone: string | null; email: string | null }) {
  const opts = {
    key: o.keyId, order_id: o.orderId, amount: o.totalPaise, currency: 'INR', name: 'Taara', description: 'Wallet top-up',
    prefill: { name: user.name ?? '', contact: user.phone ?? '', email: user.email ?? '' }, theme: { color: '#F5B700' },
  };
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#1C1610"><script src="https://checkout.razorpay.com/v1/checkout.js"></script><script>
var o=${JSON.stringify(opts)};
o.handler=function(r){window.ReactNativeWebView.postMessage(JSON.stringify({ok:true,r:r}))};
o.modal={ondismiss:function(){window.ReactNativeWebView.postMessage(JSON.stringify({ok:false,dismissed:true}))}};
var rz=new Razorpay(o);rz.on('payment.failed',function(e){window.ReactNativeWebView.postMessage(JSON.stringify({ok:false,failed:true}))});rz.open();
</script></body></html>`;
}

export default function Topup() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const router = useRouter();
  const { meta, user, refreshUser } = useApp();
  const options = meta?.pricing.topupsPaise ?? [10000, 25000, 50000, 100000];
  const gstPct = meta?.pricing.gstPct ?? 18;
  const [amount, setAmount] = useState(options[1] ?? options[0]);
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const gst = Math.round((amount * gstPct) / 100);

  const done = async (ok: boolean, msg?: string) => {
    setOrder(null); setBusy(false);
    await refreshUser().catch(() => {});
    if (ok) { Alert.alert(t('wallet.success', { amount: rupees(amount) })); router.back(); }
    else if (msg) Alert.alert(msg);
  };

  const pay = async () => {
    setBusy(true);
    try {
      const o = await api<Order>('/wallet/topup', { body: { creditPaise: amount } });
      if (o.demo) {
        // Development server without Razorpay keys: confirm directly.
        await api('/wallet/topup/confirm', { body: { orderId: o.orderId } });
        await done(true);
      } else setOrder(o);
    } catch (e: any) { setBusy(false); Alert.alert(e.code === 'network' ? t('common.network_error') : t('common.error_generic')); }
  };

  if (order && user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.sky }}>
        <WebView originWhitelist={['*']} source={{ html: checkoutHtml(order, user) }} javaScriptEnabled
          onMessage={async (e) => {
            const m = JSON.parse(e.nativeEvent.data);
            if (m.ok) {
              try {
                await api('/wallet/topup/confirm', { body: { orderId: order.orderId, paymentId: m.r.razorpay_payment_id, signature: m.r.razorpay_signature } });
                await done(true);
              } catch { await done(false, t('wallet.failed')); }
            } else await done(false, m.failed ? t('wallet.failed') : undefined);
          }} />
      </SafeAreaView>
    );
  }

  return (
    <Screen edges={['top', 'bottom']} style={{ paddingTop: space.l, gap: space.l }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T v="h1">{t('wallet.add')}</T>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button"><T v="h2" color={c.inkSoft}>✕</T></Pressable>
      </View>
      <T color={c.inkSoft}>{t('wallet.choose_amount')}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
        {options.map((a) => (
          <Pressable key={a} onPress={() => setAmount(a)} accessibilityRole="radio" accessibilityState={{ selected: a === amount }}
            style={{ width: '48%', minHeight: 72, borderRadius: 16, justifyContent: 'center', alignItems: 'center',
              backgroundColor: a === amount ? c.primary : c.surface, borderWidth: a === amount ? 0 : 1, borderColor: c.line }}>
            <T v="h2" color={a === amount ? c.onPrimary : c.ink}>{rupees(a)}</T>
          </Pressable>
        ))}
      </View>
      <View style={{ gap: space.s, paddingVertical: space.m, borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.line }}>
        {[[t('wallet.credit'), rupees(amount, 2)], [t('wallet.gst', { pct: gstPct }), rupees(gst, 2)], [t('wallet.total'), rupees(amount + gst, 2)]].map(([k, v], i) => (
          <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T style={{ fontWeight: i === 2 ? '700' : '400' }}>{k}</T>
            <T style={{ fontWeight: i === 2 ? '700' : '400', fontVariant: ['tabular-nums'] }}>{v}</T>
          </View>
        ))}
      </View>
      <Button title={t('wallet.pay', { amount: rupees(amount + gst, 2) })} onPress={pay} loading={busy} />
      <T v="tiny" color={c.inkSoft}>{t('wallet.refund_policy')}</T>
    </Screen>
  );
}
