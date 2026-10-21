import type { TFunction } from 'i18next';

/** Human message for an API error code. Falls back to the generic error. */
export function errorMessage(t: TFunction, e: { code?: string } | null | undefined): string {
  const code = e?.code ?? '';
  const known: Record<string, string> = {
    network: 'common.network_error',
    age_restricted: 'errors.age_restricted',
    age_not_confirmed: 'errors.terms',
    terms_not_accepted: 'errors.terms',
    pandit_blocked: 'errors.pandit_blocked',
    slow_down: 'errors.slow_down',
    otp_cooldown: 'errors.otp_cooldown',
    otp_limit: 'errors.otp_limit',
    too_many_attempts: 'errors.otp_limit',
    palm_photo_expired: 'errors.palm_photo_expired',
    account_blocked: 'errors.account_blocked',
  };
  return t(known[code] ?? 'common.error_generic');
}
