// 22 Scheduled Languages of India + English. `tts` = a voice is available for spoken AI replies.
export interface Language { code: string; english: string; native: string; rtl?: boolean; sarvam: string; tts: boolean }

export const LANGUAGES: Language[] = [
  { code: 'hi', english: 'Hindi', native: 'हिन्दी', sarvam: 'hi-IN', tts: true },
  { code: 'en', english: 'English', native: 'English', sarvam: 'en-IN', tts: true },
  { code: 'bn', english: 'Bengali', native: 'বাংলা', sarvam: 'bn-IN', tts: true },
  { code: 'mr', english: 'Marathi', native: 'मराठी', sarvam: 'mr-IN', tts: true },
  { code: 'te', english: 'Telugu', native: 'తెలుగు', sarvam: 'te-IN', tts: true },
  { code: 'ta', english: 'Tamil', native: 'தமிழ்', sarvam: 'ta-IN', tts: true },
  { code: 'gu', english: 'Gujarati', native: 'ગુજરાતી', sarvam: 'gu-IN', tts: true },
  { code: 'ur', english: 'Urdu', native: 'اردو', rtl: true, sarvam: 'ur-IN', tts: false },
  { code: 'kn', english: 'Kannada', native: 'ಕನ್ನಡ', sarvam: 'kn-IN', tts: true },
  { code: 'or', english: 'Odia', native: 'ଓଡ଼ିଆ', sarvam: 'od-IN', tts: true },
  { code: 'ml', english: 'Malayalam', native: 'മലയാളം', sarvam: 'ml-IN', tts: true },
  { code: 'pa', english: 'Punjabi', native: 'ਪੰਜਾਬੀ', sarvam: 'pa-IN', tts: true },
  { code: 'as', english: 'Assamese', native: 'অসমীয়া', sarvam: 'as-IN', tts: false },
  { code: 'mai', english: 'Maithili', native: 'मैथिली', sarvam: 'mai-IN', tts: false },
  { code: 'sat', english: 'Santali', native: 'ᱥᱟᱱᱛᱟᱲᱤ', sarvam: 'sat-IN', tts: false },
  { code: 'ks', english: 'Kashmiri', native: 'کٲشُر', rtl: true, sarvam: 'ks-IN', tts: false },
  { code: 'ne', english: 'Nepali', native: 'नेपाली', sarvam: 'ne-IN', tts: false },
  { code: 'kok', english: 'Konkani', native: 'कोंकणी', sarvam: 'kok-IN', tts: false },
  { code: 'sd', english: 'Sindhi', native: 'سنڌي', rtl: true, sarvam: 'sd-IN', tts: false },
  { code: 'doi', english: 'Dogri', native: 'डोगरी', sarvam: 'doi-IN', tts: false },
  { code: 'mni', english: 'Manipuri', native: 'মণিপুরী', sarvam: 'mni-IN', tts: false },
  { code: 'brx', english: 'Bodo', native: 'बड़ो', sarvam: 'brx-IN', tts: false },
  { code: 'sa', english: 'Sanskrit', native: 'संस्कृतम्', sarvam: 'sa-IN', tts: false },
];

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);
export const langInfo = (code: string) => LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
