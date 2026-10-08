"""Gera js/avenues_data.js

Consultas Overpass usadas (bbox de Pelotas: -31.80,-52.40,-31.70,-52.28), uma por avenida (N = regex do nome):
  <key>_geom.json : way["highway"]["name"~N]; out geom;
  <key>_pois.json : way["highway"]["name"~N]->.w; (nwr(around.w:45)["name"]; nwr(around.w:45)["shop"]; nwr(around.w:45)["amenity"];
                    way(around.w:45)["building"]; node(around.w:45)["highway"~"bus_stop|traffic_signals|crossing"];); out tags center;
  <key>_cross.json: way["highway"]["name"~N]->.w; node(w.w)->.n; way(bn.n)["highway"]["name"]; out geom;
 a partir dos JSON do Overpass (OpenStreetMap, ODbL):
traçado, ruas transversais, lojas/serviços com nome, prédios com andares, paradas e semáforos
ao longo dos 2 km de cada avenida a partir do ponto de partida da fase.
Uso: python3 build_avenues.py <pasta com *_geom.json, *_pois.json, *_cross.json> <saída.js>"""
import json, math, sys, os, re
R = 6371000.0
LAT0, LON0 = -31.76, -52.33
def xy(lat, lon): return ((lon - LON0) * math.cos(math.radians(LAT0)) * math.pi / 180 * R, (lat - LAT0) * math.pi / 180 * R)

def chain(ways):
    segs = [[(n['lat'], n['lon']) for n in w['geometry']] for w in ways if w.get('geometry')]
    used = [False] * len(segs); best = []
    def near(a, b): return abs(a[0]-b[0]) < 2e-5 and abs(a[1]-b[1]) < 2e-5
    for i in range(len(segs)):
        if used[i]: continue
        line = list(segs[i]); used[i] = True; changed = True
        while changed:
            changed = False
            for j in range(len(segs)):
                if used[j]: continue
                s = segs[j]
                if near(line[-1], s[0]): line += s[1:]; used[j] = True; changed = True
                elif near(line[-1], s[-1]): line += s[-2::-1]; used[j] = True; changed = True
                elif near(line[0], s[-1]): line = s[:-1] + line; used[j] = True; changed = True
                elif near(line[0], s[0]): line = s[::-1][:-1] + line; used[j] = True; changed = True
        if len(line) > len(best): best = line
    return best

def project(line_xy, p):
    best = None; acc = 0
    for i in range(len(line_xy) - 1):
        a, b = line_xy[i], line_xy[i+1]; dx, dy = b[0]-a[0], b[1]-a[1]; L2 = dx*dx + dy*dy
        if L2 == 0: continue
        u = max(0, min(1, ((p[0]-a[0])*dx + (p[1]-a[1])*dy) / L2)); cx, cy = a[0] + u*dx, a[1] + u*dy
        d = math.hypot(p[0]-cx, p[1]-cy); cross = dx*(p[1]-a[1]) - dy*(p[0]-a[0])
        if best is None or d < best[2]: best = (acc + u*math.sqrt(L2), math.copysign(d, cross), d)
        acc += math.sqrt(L2)
    return best

CATS = [  # (categoria do jogo, chaves shop/amenity/leisure/office)
    ('pharmacy', {'pharmacy', 'chemist'}), ('fuel', {'fuel'}), ('bank', {'bank', 'atm'}), ('supermarket', {'supermarket', 'convenience', 'greengrocer', 'variety_store'}),
    ('car', {'car'}), ('car_parts', {'car_parts', 'tyres', 'car_repair', 'motorcycle'}), ('restaurant', {'restaurant', 'pizza'}), ('fast_food', {'fast_food', 'cafe', 'bar', 'pub'}),
    ('bakery', {'bakery', 'confectionery', 'pastry'}), ('ice_cream', {'ice_cream'}), ('furniture', {'furniture', 'bed', 'interior_decoration', 'appliance', 'hifi'}),
    ('clothes', {'clothes', 'shoes', 'cosmetics', 'leather', 'sports', 'sewing'}), ('hardware', {'hardware', 'paint', 'trade', 'glaziery', 'doityourself', 'tool_hire'}),
    ('lottery', {'lottery', 'ticket'}), ('school', {'school', 'college', 'university', 'kindergarten', 'driving_school'}), ('church', {'place_of_worship'}),
    ('health', {'dentist', 'doctors', 'clinic', 'veterinary', 'optician'}), ('pet', {'pet'}), ('florist', {'florist', 'garden_centre'}), ('gym', {'fitness_centre', 'dojo'}),
    ('police', {'police'}), ('post', {'post_office'}), ('other', set()),
]
def category(t):
    keys = {t.get('shop'), t.get('amenity'), t.get('leisure'), t.get('office')}
    for cat, ks in CATS:
        if keys & ks: return cat
    return 'other'

def short(name):
    name = re.sub(r'\s+', ' ', name).strip()
    return name if len(name) <= 24 else name[:23].rstrip() + '.'

def build(folder, key, start, max_s=2000):
    ways = json.load(open(os.path.join(folder, key + '_geom.json')))['elements']
    line = chain(ways); line_xy = [xy(*p) for p in line]
    s0 = xy(*start)
    if math.hypot(line_xy[-1][0]-s0[0], line_xy[-1][1]-s0[1]) < math.hypot(line_xy[0][0]-s0[0], line_xy[0][1]-s0[1]): line = line[::-1]; line_xy = line_xy[::-1]
    ps = project(line_xy, s0)[0]
    out = {'pois': [], 'streets': [], 'stops': [], 'signals': [], 'levels': []}
    seen = set()
    for e in json.load(open(os.path.join(folder, key + '_pois.json')))['elements']:
        t = e.get('tags', {}); c = e.get('center') or ({'lat': e['lat'], 'lon': e['lon']} if 'lat' in e else None)
        if not c: continue
        s, lat, d = project(line_xy, xy(c['lat'], c['lon'])); s -= ps
        if s < -30 or s > max_s: continue
        side = 1 if lat < 0 else -1  # +x = direita do sentido de viagem (o jogo usa x > 0 à direita)
        hw = t.get('highway')
        if hw == 'traffic_signals': out['signals'].append(round(s)); continue
        if hw == 'bus_stop': out['stops'].append([round(s), side]); continue
        if t.get('building:levels') and e['type'] == 'way':
            try: out['levels'].append([round(s), side, int(float(t['building:levels']))])
            except ValueError: pass
        if t.get('name') and (t.get('shop') or t.get('amenity') or t.get('leisure') or t.get('office')) and d < 100:
            k = (t['name'], round(s / 20))
            if k in seen: continue
            seen.add(k)
            out['pois'].append({'s': round(s), 'side': side, 'name': short(t['name']), 'cat': category(t)})
    cross_file = os.path.join(folder, key + '_cross.json')
    if os.path.exists(cross_file):
        try:
            nodes = {(round(p[0], 6), round(p[1], 6)) for p in line}
            seenst = set()
            for w in json.load(open(cross_file))['elements']:
                t = w.get('tags', {}); name = t.get('name', '')
                if not name or re.search(r'Duque de Caxias|Bento Gon|Juscelino', name): continue
                for n in w.get('geometry', []):
                    if (round(n['lat'], 6), round(n['lon'], 6)) in nodes:
                        s, lat, d = project(line_xy, xy(n['lat'], n['lon'])); s -= ps
                        if -30 <= s <= max_s and (name, round(s / 30)) not in seenst:
                            seenst.add((name, round(s / 30))); out['streets'].append([round(s), short(name)])
        except Exception as ex: print('cross', key, ex)
    out['streets'].sort(); out['signals'] = sorted(set(out['signals'])); out['stops'].sort(); out['pois'].sort(key=lambda p: p['s']); out['levels'].sort()
    # perfil lateral real (desvio em relação à reta inicial), a cada 100 m
    pts = []; acc = 0
    for i in range(len(line_xy) - 1):
        pts.append((acc, line_xy[i])); acc += math.hypot(line_xy[i+1][0]-line_xy[i][0], line_xy[i+1][1]-line_xy[i][1])
    pts.append((acc, line_xy[-1]))
    def at(s):
        for i in range(len(pts) - 1):
            if pts[i][0] <= s <= pts[i+1][0]:
                u = (s - pts[i][0]) / max(1e-6, pts[i+1][0] - pts[i][0]); a, b = pts[i][1], pts[i+1][1]; return (a[0] + u*(b[0]-a[0]), a[1] + u*(b[1]-a[1]))
        return pts[-1][1]
    p0 = at(ps); p1 = at(ps + 150); hx, hy = p1[0]-p0[0], p1[1]-p0[1]; hl = math.hypot(hx, hy); hx /= hl; hy /= hl
    out['lateral'] = [round(-(at(ps + s)[0]-p0[0])*hy + (at(ps + s)[1]-p0[1])*hx) for s in range(0, max_s + 1, 100)]
    print('%s: %d lojas, %d ruas, %d paradas, %d semáforos, %d prédios com andares' % (key, len(out['pois']), len(out['streets']), len(out['stops']), len(out['signals']), len(out['levels'])))
    return out

folder, outp = sys.argv[1], sys.argv[2]
data = {
    'duque': build(folder, 'duque', (-31.7545946, -52.3925491)),   # Posto da Brigada Militar, Fragata
    'bento': build(folder, 'bento', (-31.75924, -52.34725)),       # Colégio Municipal Pelotense
    'jk': build(folder, 'jk', (-31.76361, -52.32872)),             # antigo BIG (hoje Carrefour)
}
with open(outp, 'w') as f:
    f.write('// Gerado por tools/osm/build_avenues.py a partir do OpenStreetMap (© colaboradores do OSM, ODbL).\n')
    f.write('// Distâncias em metros desde o ponto de partida de cada fase; side 1 = direita, -1 = esquerda.\n')
    f.write('export const AVENUES = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('->', outp, os.path.getsize(outp), 'bytes')
