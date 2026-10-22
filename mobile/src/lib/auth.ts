// Login is asked for only when it's needed (chat, AI, wallet, palm reading, reports) — never just to look around.
import { useCallback } from 'react';
import { useRouter } from 'expo-router';
type Router = ReturnType<typeof useRouter>;
import { useApp } from './store';

/** Returns `ensure(next)`: true if signed in; otherwise opens login, which comes back to `next` afterwards. */
export function useRequireLogin() {
  const router = useRouter();
  const token = useApp((s) => s.token);
  const consented = useApp((s) => !!s.user?.consentCurrent);
  return useCallback((next?: string) => {
    if (token && consented) return true;
    router.push({ pathname: token ? '/consent' : '/login', params: next ? { next } : {} });
    return false;
  }, [router, token, consented]);
}

/** After OTP (or Apple sign-in): consent if it's still needed, then back to where the person was going. */
export function finishLogin(router: Router, next?: string) {
  const u = useApp.getState().user;
  if (router.canDismiss()) router.dismissAll();
  if (u && !u.consentCurrent) { router.push({ pathname: '/consent', params: next ? { next } : {} }); return; }
  if (next) router.push(next as never);
}
