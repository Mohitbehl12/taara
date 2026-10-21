import { connectPglite, db, schema } from '../src/db/client.js';
import { eq } from 'drizzle-orm';
await connectPglite('/tmp/claude-0/demo/.data/db');
const [u] = await db().select().from(schema.users).where(eq(schema.users.phone, '+919811000001'));
await db().insert(schema.palmReadings).values({ userId: u.id, hand: 'right', imagePath: '/dev/null', mediaType: 'image/jpeg', lang: 'hi', quick: {
  isPalm: true, imageIssue: null,
  handShape: { type: 'earth', observation: 'हथेली चौकोर है और उँगलियाँ अपेक्षाकृत छोटी हैं।', meaning: 'परंपरा में पृथ्वी हाथ व्यावहारिक, भरोसेमंद और मेहनती स्वभाव से जोड़ा जाता है।' },
  lines: [
    { key: 'heart', visible: true, observation: 'हृदय रेखा लंबी और साफ़ है, तर्जनी के नीचे तक जाती है।', meaning: 'पारंपरिक रूप से यह गर्मजोशी भरे, वफ़ादार और भावनाओं को खुलकर जताने वाले स्वभाव को दर्शाती है।' },
    { key: 'head', visible: true, observation: 'मस्तिष्क रेखा सीधी है और हथेली के बीच तक जाती है।', meaning: 'इसे स्पष्ट, व्यावहारिक सोच और योजनाबद्ध निर्णयों से जोड़ा जाता है।' },
    { key: 'life', visible: true, observation: 'जीवन रेखा अंगूठे के चारों ओर चौड़ा घेरा बनाती है।', meaning: 'परंपरा इसे ऊर्जा, उत्साह और नए अनुभवों के प्रति खुलेपन से जोड़ती है।' },
    { key: 'fate', visible: true, observation: 'भाग्य रेखा हथेली के बीच से हल्की शुरू होकर ऊपर गहरी होती है।', meaning: 'इसे करियर में समय के साथ बढ़ती स्थिरता से जोड़ा जाता है।' },
    { key: 'sun', visible: false, observation: '', meaning: '' },
  ],
  summary: 'आपकी हथेली एक व्यावहारिक, भरोसेमंद और गर्मजोशी भरे व्यक्ति की ओर इशारा करती है। करियर की रेखा समय के साथ मज़बूत होती दिखती है। संतुलन और धैर्य आपकी सबसे बड़ी ताक़त हैं।',
} });
console.log('palm seeded');
process.exit(0);
