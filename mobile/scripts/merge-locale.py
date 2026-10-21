# Merges a partial locale JSON into src/i18n/locales/<code>.json (deep merge, new keys win). Usage: python3 merge-locale.py <code> <file>
import json, sys
code, src = sys.argv[1], sys.argv[2]
p = f'src/i18n/locales/{code}.json'
d = json.load(open(p)); add = json.load(open(src))
def merge(a, b):
    for k, v in b.items():
        if isinstance(v, dict): merge(a.setdefault(k, {}), v)
        else: a[k] = v
merge(d, add)
# one top-level section per line, like the other locale files
open(p, 'w').write('{' + ',\n'.join(json.dumps(k, ensure_ascii=False) + ':' + json.dumps(v, ensure_ascii=False, separators=(',', ':')) for k, v in d.items()) + '}\n')
