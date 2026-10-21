export interface Language { code: string; english: string; native: string; rtl?: boolean; tts: boolean }
export interface Meta {
  languages: Language[];
  signs: { en: string; sa: string; hi: string; lord: string }[];
  nakshatras: string[];
  pricing: {
    aiBillingMode: 'per_minute' | 'per_message'; aiRatePerMinPaise: number; aiRatePerMessagePaise: number;
    freePanditMinutes: number; topupsPaise: number[]; gstPct: number; reportPricesPaise: Record<string, number>;
    panditMinRatePaise: number; panditMaxRatePaise: number; commissionPct: number;
    palmDetailedPricePaise: number; palmFreePerDay: number;
  };
  features: { ai: boolean; voice: boolean; panditCalls: boolean };
}
export interface BirthProfile {
  id: string; name: string; relation: string; date: string; time: string | null; timeAccuracy: 'exact' | 'approx' | 'unknown';
  placeName: string; lat: number; lon: number; tzOffsetMinutes: number; isPrimary: boolean;
}
export interface User {
  id: string; name: string | null; phone: string | null; email: string | null; gender: string | null; language: string;
  theme: 'light' | 'dark' | 'system'; goal: string | null; role: string; balancePaise: number; freeSecondsRemaining: number;
  notificationPrefs: Record<string, boolean>; aiProfileConsent: boolean;
  pandit: { id: string; status: string } | null; profiles: BirthProfile[];
}
export interface Pandit {
  id: string; displayName: string; photoUrl: string | null; bio: string; experienceYears: number; specializations: string[];
  languages: string[]; verified: boolean; chatRatePaise: number; voiceRatePaise: number; videoRatePaise: number;
  participatesInFree: boolean; online: boolean; busy: boolean; rating: number | null; ratingCount: number; totalSessions: number;
  reviews?: { rating: number; text: string | null; name: string; createdAt: string }[];
}
export interface Session {
  id: string; userId: string; panditId: string | null; kind: 'ai' | 'pandit'; mode: 'chat' | 'voice' | 'video';
  status: 'requested' | 'active' | 'awaiting_consent' | 'paused' | 'ended' | 'rejected' | 'missed';
  billingMode: 'per_minute' | 'per_message'; ratePaise: number; userLanguage: string; freeEligible: boolean;
  freeSecondsUsed: number; paidSeconds: number; chargedPaise: number; startedAt: string | null; endedAt: string | null;
  endReason: string | null; consentDeadline: string | null; balancePaise?: number; freeSecondsRemaining?: number;
  panditUserId?: string | null; panditEarnedPaise?: number; requestedAt: string;
}
export interface Message {
  id: string; sessionId: string; sender: 'user' | 'pandit' | 'ai' | 'system'; text: string; lang: string | null;
  translations: Record<string, string>; createdAt: string; clientId?: string; pendingId?: string;
}
export interface Placement {
  planet: string; longitude: number; sign: number; degreeInSign: number; nakshatra: number; pada: number; house: number;
  retrograde: boolean; combust: boolean; dignity: string; navamsaSign: number; simple: string; detailed: string;
}
export interface Horoscope {
  sign: number; period: string; periodKey: string; general: string; love: string; career: string; finance: string; health: string;
  family: string; growth: string; advice: string; luckyNumber: number; luckyColor: string; compatibleSign: number;
  energy: { overall: number; love: number; career: number; money: number; health: number; family: number };
}
