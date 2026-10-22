# Re-generate with: download india-pincode (npm pack) and cities.json, adjust the two input paths below, run with python3.
# Builds server/data/places.tsv.gz: name<TAB>region<TAB>lat<TAB>lon, most important first.
# Sources: India Post office directory (Open Government Data License – India) and GeoNames cities >1000 (CC BY 4.0).
import gzip, json, re, sys, unicodedata
from collections import defaultdict
ip = json.load(gzip.open('/tmp/claude-0/geo/ip/package/data/pincodes.json.gz'))
world = json.load(open('/tmp/claude-0/geo/package/cities.json'))
admin1 = {a['code']: a['name'] for a in json.load(open('/tmp/claude-0/geo/package/admin1.json'))} if True else {}
SMALL = {'and', 'of', 'the'}
def title(s):
    s = re.sub(r'\s+', ' ', s.strip())
    return ' '.join(w if w.lower() in SMALL and i else w.capitalize() for i, w in enumerate(s.lower().split(' ')))
def clean_office(o):
    o = re.sub(r'\b(B\.?O|S\.?O|H\.?O|G\.?P\.?O|P\.?O|E\.?D\.?O|N\.?D\.?S\.?O)\.?\s*$', '', o.strip(), flags=re.I)
    o = re.sub(r'\s*\(.*?\)\s*$', '', o).strip(' .-')
    o = re.sub(r'\b(B\.?O|S\.?O|H\.?O|E\.?D\.?S\.?O)\b\.?', ' ', o, flags=re.I)
    o = re.sub(r'\s+', ' ', o).strip(' .-')
    return title(o)
rows = []; seen = set(); dist_pts = defaultdict(list)
rank = {'HO': 1, 'PO': 1, 'SO': 2, 'BO': 3}
ip.sort(key=lambda r: rank.get(r.get('t'), 3))
for r in ip:
    lat, lon = r.get('a'), r.get('n')
    if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)): continue
    if not (6 <= lat <= 37.5 and 68 <= lon <= 97.5): continue
    name = clean_office(r.get('o', '')); dist = title(r.get('i', '')); state = title(r.get('s', ''))
    if not name or len(name) < 2: continue
    dist_pts[(dist, state)].append((lat, lon))
    key = (name.lower(), dist.lower())
    if key in seen: continue
    seen.add(key)
    rows.append((rank.get(r.get('t'), 3), name, f'{dist}, {state}', lat, lon))
# District centroids (median, robust to stray coordinates) come first.
dists = []
for (dist, state), pts in dist_pts.items():
    if not dist: continue
    la = sorted(p[0] for p in pts)[len(pts)//2]; lo = sorted(p[1] for p in pts)[len(pts)//2]
    dists.append((0, dist, f'District, {state}', la, lo))
rows = dists + sorted(rows, key=lambda r: r[0])
india_n = len(rows)
# World towns (outside India). Country names in English.
import subprocess
cn = json.loads(subprocess.check_output(['node', '-e', "const d=new Intl.DisplayNames(['en'],{type:'region'});const o={};for(const c of process.argv[1].split(','))try{o[c]=d.of(c)}catch{};console.log(JSON.stringify(o))", ','.join(sorted({w['country'] for w in world}))]))
for w in []:  # world towns now come from the OpenStreetMap lookup (keeps the server small)
    if w['country'] == 'IN': continue
    a1 = admin1.get(f"{w['country']}.{w['admin1']}", '')
    region = ', '.join(x for x in [a1, cn.get(w['country'], w['country'])] if x)
    rows.append((9, w['name'], region, float(w['lat']), float(w['lng'])))
bad = lambda s: '\t' in s or '\n' in s
with gzip.open('/home/claude/taara/server/data/places.tsv.gz', 'wt', encoding='utf-8', compresslevel=9) as f:
    for _, n, reg, la, lo in rows:
        if bad(n) or bad(reg): continue
        f.write(f'{n}\t{reg}\t{la:.4f}\t{lo:.4f}\n')
print('india', india_n, 'districts', len(dists), 'total', len(rows))
