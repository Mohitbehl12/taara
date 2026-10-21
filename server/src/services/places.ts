import tzLookup from '@photostructure/tz-lookup';
import { HttpError } from '../lib/http.js';

/**
 * UTC offset (minutes) in force at the birth place at the birth moment, including historical changes
 * (e.g. India used +05:30 throughout, but places abroad had DST). Uses the runtime's IANA tz database.
 */
export function tzOffsetAt(lat: number, lon: number, date: string, time = '12:00') {
  const zone = tzLookup(lat, lon);
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  // Iterate twice: guess UTC from offset, then re-read the offset at that UTC instant.
  let offset = 0;
  for (let i = 0; i < 2; i++) {
    const utc = Date.UTC(y, m - 1, d, hh, mm) - offset * 60_000;
    offset = offsetFor(zone, new Date(utc));
  }
  return { zone, tzOffsetMinutes: offset };
}

function offsetFor(zone: string, at: Date) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
    .formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = part.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return 0;
  const v = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === '-' ? -v : v;
}

// Major Indian cities for instant offline search. The app also geocodes any other place on the device.
export const CITIES: [string, string, number, number][] = [
  ['New Delhi', 'Delhi', 28.6139, 77.209], ['Mumbai', 'Maharashtra', 19.076, 72.8777], ['Kolkata', 'West Bengal', 22.5726, 88.3639],
  ['Chennai', 'Tamil Nadu', 13.0827, 80.2707], ['Bengaluru', 'Karnataka', 12.9716, 77.5946], ['Hyderabad', 'Telangana', 17.385, 78.4867],
  ['Ahmedabad', 'Gujarat', 23.0225, 72.5714], ['Pune', 'Maharashtra', 18.5204, 73.8567], ['Jaipur', 'Rajasthan', 26.9124, 75.7873],
  ['Lucknow', 'Uttar Pradesh', 26.8467, 80.9462], ['Kanpur', 'Uttar Pradesh', 26.4499, 80.3319], ['Nagpur', 'Maharashtra', 21.1458, 79.0882],
  ['Indore', 'Madhya Pradesh', 22.7196, 75.8577], ['Bhopal', 'Madhya Pradesh', 23.2599, 77.4126], ['Patna', 'Bihar', 25.5941, 85.1376],
  ['Vadodara', 'Gujarat', 22.3072, 73.1812], ['Surat', 'Gujarat', 21.1702, 72.8311], ['Ludhiana', 'Punjab', 30.901, 75.8573],
  ['Agra', 'Uttar Pradesh', 27.1767, 78.0081], ['Nashik', 'Maharashtra', 19.9975, 73.7898], ['Varanasi', 'Uttar Pradesh', 25.3176, 82.9739],
  ['Prayagraj', 'Uttar Pradesh', 25.4358, 81.8463], ['Amritsar', 'Punjab', 31.634, 74.8723], ['Chandigarh', 'Chandigarh', 30.7333, 76.7794],
  ['Jalandhar', 'Punjab', 31.326, 75.5762], ['Meerut', 'Uttar Pradesh', 28.9845, 77.7064], ['Ghaziabad', 'Uttar Pradesh', 28.6692, 77.4538],
  ['Noida', 'Uttar Pradesh', 28.5355, 77.391], ['Gurugram', 'Haryana', 28.4595, 77.0266], ['Faridabad', 'Haryana', 28.4089, 77.3178],
  ['Dehradun', 'Uttarakhand', 30.3165, 78.0322], ['Haridwar', 'Uttarakhand', 29.9457, 78.1642], ['Shimla', 'Himachal Pradesh', 31.1048, 77.1734],
  ['Jammu', 'Jammu & Kashmir', 32.7266, 74.857], ['Srinagar', 'Jammu & Kashmir', 34.0837, 74.7973], ['Udaipur', 'Rajasthan', 24.5854, 73.7125],
  ['Jodhpur', 'Rajasthan', 26.2389, 73.0243], ['Kota', 'Rajasthan', 25.2138, 75.8648], ['Ajmer', 'Rajasthan', 26.4499, 74.6399],
  ['Bikaner', 'Rajasthan', 28.0229, 73.3119], ['Gwalior', 'Madhya Pradesh', 26.2183, 78.1828], ['Jabalpur', 'Madhya Pradesh', 23.1815, 79.9864],
  ['Ujjain', 'Madhya Pradesh', 23.1765, 75.7885], ['Raipur', 'Chhattisgarh', 21.2514, 81.6296], ['Ranchi', 'Jharkhand', 23.3441, 85.3096],
  ['Jamshedpur', 'Jharkhand', 22.8046, 86.2029], ['Dhanbad', 'Jharkhand', 23.7957, 86.4304], ['Gaya', 'Bihar', 24.7914, 85.0002],
  ['Bhagalpur', 'Bihar', 25.2425, 86.9842], ['Muzaffarpur', 'Bihar', 26.1209, 85.3647], ['Darbhanga', 'Bihar', 26.1542, 85.8918],
  ['Gorakhpur', 'Uttar Pradesh', 26.7606, 83.3732], ['Bareilly', 'Uttar Pradesh', 28.367, 79.4304], ['Aligarh', 'Uttar Pradesh', 27.8974, 78.088],
  ['Mathura', 'Uttar Pradesh', 27.4924, 77.6737], ['Ayodhya', 'Uttar Pradesh', 26.7922, 82.1998], ['Bhubaneswar', 'Odisha', 20.2961, 85.8245],
  ['Cuttack', 'Odisha', 20.4625, 85.8828], ['Puri', 'Odisha', 19.8135, 85.8312], ['Guwahati', 'Assam', 26.1445, 91.7362],
  ['Dibrugarh', 'Assam', 27.4728, 94.912], ['Silchar', 'Assam', 24.8333, 92.7789], ['Shillong', 'Meghalaya', 25.5788, 91.8933],
  ['Imphal', 'Manipur', 24.817, 93.9368], ['Agartala', 'Tripura', 23.8315, 91.2868], ['Aizawl', 'Mizoram', 23.7271, 92.7176],
  ['Kohima', 'Nagaland', 25.6751, 94.1086], ['Itanagar', 'Arunachal Pradesh', 27.0844, 93.6053], ['Gangtok', 'Sikkim', 27.3389, 88.6065],
  ['Siliguri', 'West Bengal', 26.7271, 88.3953], ['Durgapur', 'West Bengal', 23.5204, 87.3119], ['Asansol', 'West Bengal', 23.6739, 86.9524],
  ['Howrah', 'West Bengal', 22.5958, 88.2636], ['Kochi', 'Kerala', 9.9312, 76.2673], ['Thiruvananthapuram', 'Kerala', 8.5241, 76.9366],
  ['Kozhikode', 'Kerala', 11.2588, 75.7804], ['Thrissur', 'Kerala', 10.5276, 76.2144], ['Kannur', 'Kerala', 11.8745, 75.3704],
  ['Coimbatore', 'Tamil Nadu', 11.0168, 76.9558], ['Madurai', 'Tamil Nadu', 9.9252, 78.1198], ['Tiruchirappalli', 'Tamil Nadu', 10.7905, 78.7047],
  ['Salem', 'Tamil Nadu', 11.6643, 78.146], ['Tirunelveli', 'Tamil Nadu', 8.7139, 77.7567], ['Vellore', 'Tamil Nadu', 12.9165, 79.1325],
  ['Thanjavur', 'Tamil Nadu', 10.787, 79.1378], ['Puducherry', 'Puducherry', 11.9416, 79.8083], ['Mysuru', 'Karnataka', 12.2958, 76.6394],
  ['Mangaluru', 'Karnataka', 12.9141, 74.856], ['Hubballi', 'Karnataka', 15.3647, 75.124], ['Belagavi', 'Karnataka', 15.8497, 74.4977],
  ['Udupi', 'Karnataka', 13.3409, 74.7421], ['Visakhapatnam', 'Andhra Pradesh', 17.6868, 83.2185], ['Vijayawada', 'Andhra Pradesh', 16.5062, 80.648],
  ['Guntur', 'Andhra Pradesh', 16.3067, 80.4365], ['Tirupati', 'Andhra Pradesh', 13.6288, 79.4192], ['Nellore', 'Andhra Pradesh', 14.4426, 79.9865],
  ['Warangal', 'Telangana', 17.9689, 79.5941], ['Karimnagar', 'Telangana', 18.4386, 79.1288], ['Aurangabad', 'Maharashtra', 19.8762, 75.3433],
  ['Kolhapur', 'Maharashtra', 16.705, 74.2433], ['Solapur', 'Maharashtra', 17.6599, 75.9064], ['Thane', 'Maharashtra', 19.2183, 72.9781],
  ['Navi Mumbai', 'Maharashtra', 19.033, 73.0297], ['Amravati', 'Maharashtra', 20.9374, 77.7796], ['Panaji', 'Goa', 15.4909, 73.8278],
  ['Margao', 'Goa', 15.2832, 73.9862], ['Rajkot', 'Gujarat', 22.3039, 70.8022], ['Bhavnagar', 'Gujarat', 21.7645, 72.1519],
  ['Jamnagar', 'Gujarat', 22.4707, 70.0577], ['Gandhinagar', 'Gujarat', 23.2156, 72.6369], ['Dwarka', 'Gujarat', 22.2394, 68.9678],
  ['Bathinda', 'Punjab', 30.211, 74.9455], ['Patiala', 'Punjab', 30.3398, 76.3869], ['Rohtak', 'Haryana', 28.8955, 76.6066],
  ['Hisar', 'Haryana', 29.1492, 75.7217], ['Panipat', 'Haryana', 29.3909, 76.9635], ['Karnal', 'Haryana', 29.6857, 76.9905],
  ['Kathmandu', 'Nepal', 27.7172, 85.324], ['Dubai', 'UAE', 25.2048, 55.2708], ['Singapore', 'Singapore', 1.3521, 103.8198],
  ['London', 'United Kingdom', 51.5074, -0.1278], ['New York', 'USA', 40.7128, -74.006], ['San Francisco', 'USA', 37.7749, -122.4194],
  ['Toronto', 'Canada', 43.6532, -79.3832], ['Sydney', 'Australia', -33.8688, 151.2093],
];

export function searchCities(q: string, limit = 10) {
  const s = q.trim().toLowerCase();
  if (s.length < 2) return [];
  return CITIES.filter(([n]) => n.toLowerCase().startsWith(s))
    .concat(CITIES.filter(([n]) => !n.toLowerCase().startsWith(s) && n.toLowerCase().includes(s)))
    .slice(0, limit)
    .map(([name, region, lat, lon]) => ({ name, region, lat, lon, label: `${name}, ${region}` }));
}

export function assertCoords(lat: number, lon: number) {
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) throw new HttpError(400, 'invalid_coordinates');
}
