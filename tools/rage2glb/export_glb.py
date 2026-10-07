"""rage2glb: exporta carroceria + rodas de um .yft/.ytd (GTA V) para GLB no espaço do jogo (x direita, y cima, -z frente)."""
import sys, json, math, argparse
sys.path.insert(0, __import__('os').path.dirname(__file__))
import rage, dxt, glb

ap = argparse.ArgumentParser()
ap.add_argument('yft'); ap.add_argument('ytd'); ap.add_argument('out')
ap.add_argument('--only', default='', help='índices de geometria a incluir, ex: 39,40,49')
ap.add_argument('--skip', default='', help='índices a excluir')
ap.add_argument('--skip-shaders', default='vehicle_interior2,vehicle_dash_emissive')
ap.add_argument('--skip-bones', default='interiorlight,engine,seat_pside_f,seat_dside_f,seat_dside_r,seat_pside_r,motor,som,caixasom,dials,dialsb,steeringwheel,internoluz,chassis_lowlod,chassis_dummy,neon_l,neon_r,neon_f,neon_b,CorneteiraByPedro³D')
ap.add_argument('--wheel-only', default='', help='índices de geometria da roda a incluir')
ap.add_argument('--no-wheels', action='store_true')
ap.add_argument('--wheel-tris', type=int, default=700, help='triângulos alvo do aro (pneu = 70%%)')
ap.add_argument('--texsize-big', default='farol,lanterna,vehiclelights128,farolvidro', help='texturas exportadas com o dobro do tamanho')
ap.add_argument('--texsize', type=int, default=256)
ap.add_argument('--ground', type=float, default=None, help='z (GTA) do chão; default = centro da roda - raio')
ap.add_argument('--report', action='store_true')
ap.add_argument('--drop-uv', default='', help='remove triângulos pelo centro do UV: gi:umin,umax,vmin,vmax;...')
args = ap.parse_args()

r = rage.Res(args.yft); frag = rage.read_frag(r); d = frag['drawable']
rt = rage.Res(args.ytd); txd = {t['name'].lower(): t for t in rage.read_txd(rt, 0)}
sk = d['skeleton']; bone_by_name = {b['name']: i for i, b in enumerate(sk)}
model = d['lods']['high'][0]
only = set(int(x) for x in args.only.split(',') if x); skip = set(int(x) for x in args.skip.split(',') if x)
skip_shaders = set(args.skip_shaders.split(',')); skip_bones = set(bone_by_name[n] for n in args.skip_bones.split(',') if n in bone_by_name)

# roda: primeiro drawable filho com modelo
import re
wheel_model = None; wheel_bb = None
for m in re.finditer(b'DRFR', r.data):
    o = m.start()
    if o % 16 or o == r.ptr(0x30): continue
    lp = r.ptr(o+0x50)
    if lp:
        wheel_model = rage.read_model(r, r.ptrlist(lp)[0]); wheel_bb = (r.vec(o+0x30,3), r.vec(o+0x40,3)); break
wheel_r = wheel_bb[1][2] if wheel_bb else 0.32
wl = sk[bone_by_name['wheel_lf']]['pos']
ground = args.ground if args.ground is not None else wl[2] - wheel_r
print('raio roda %.3f, chão z=%.3f' % (wheel_r, ground))

def conv(p):  # GTA (x, y fwd, z up) -> jogo (x, y up, -z fwd); chão em y=0
    return (p[0], p[2] - ground, -p[1])
def convn(n): return (n[0], n[2], -n[1])

out = glb.GLB()
tex_cache = {}
def tex_index(name):
    if not name: return None
    key = name.lower()
    if key in tex_cache: return tex_cache[key]
    t = txd.get(key)
    if t is None: tex_cache[key] = None; print('  textura ausente:', name); return None
    try:
        data, w, h = dxt.texture_png(rt, t, args.texsize * (2 if key in args.texsize_big.lower().split(',') else 1))
    except Exception as e:
        print('  textura falhou', name, e); tex_cache[key] = None; return None
    tex_cache[key] = out.image_png(name, data); print('  textura %s %dx%d -> %dx%d' % (name, t['w'], t['h'], w, h))
    return tex_cache[key]

FALLBACK = {'vehicle_paint1': [0.06, 0.06, 0.07, 1], 'vehicle_tire': [0.08, 0.08, 0.08, 1], 'vehicle_vehglass': [0.1, 0.12, 0.15, 0.6]}
mat_cache = {}
def material(si):
    if si in mat_cache: return mat_cache[si]
    s = d['shaders'][si]; tex = s['params'].get('DiffuseSampler', (None, None))[1]
    m = {'name': '%s|%s' % (s['name'], tex or ''), 'pbrMetallicRoughness': {'metallicFactor': 0.0, 'roughnessFactor': 0.8}, 'doubleSided': False,
         'extras': {'shader': s['name'], 'tex': tex or ''}}
    ti = tex_index(tex) if s['name'] != 'vehicle_paint1' else None
    if ti is not None: m['pbrMetallicRoughness']['baseColorTexture'] = {'index': ti}
    else: m['pbrMetallicRoughness']['baseColorFactor'] = FALLBACK.get(s['name'], [0.5, 0.5, 0.5, 1])
    if 'glass' in s['name']: m['alphaMode'] = 'BLEND'; m['doubleSided'] = True
    elif s['name'] in ('vehicle_badges', 'vehicle_decal', 'vehicle_cutout', 'emissive', 'vehicle_lightsemissive') or (tex and ('faixa' in tex.lower())): m['alphaMode'] = 'MASK'; m['alphaCutoff'] = 0.4
    mat_cache[si] = out.material(m); return mat_cache[si]

drop_uv = {}
for item in args.drop_uv.split(';'):
    if not item: continue
    gi, rect = item.split(':'); drop_uv.setdefault(int(gi), []).append([float(x) for x in rect.split(',')])

def build_geometry(g, bone_filter=True, mirror=False, gi=None):
    vs = rage.vertices(r, g); idx = rage.indices(r, g)
    tris = [idx[i:i+3] for i in range(0, len(idx) - len(idx) % 3, 3)]
    for u0, u1, v0, v1 in drop_uv.get(gi, []):
        def inside(t):
            u = sum(vs[v]['uv0'][0] for v in t) / 3; w = sum(vs[v]['uv0'][1] for v in t) / 3
            return u0 <= u <= u1 and v0 <= w <= v1
        tris = [t for t in tris if not inside(t)]
    if bone_filter and 'blendi' in vs[0]:
        tris = [t for t in tris if not any(vs[v]['blendi'][2] in skip_bones for v in t)]
    if not tris: return None
    # orientação: compara normal geométrica com normal dos vértices
    agree = 0
    for t in tris[:: max(1, len(tris)//200)]:
        a, b, c = (vs[v]['pos'] for v in t)
        e1 = [b[i]-a[i] for i in range(3)]; e2 = [c[i]-a[i] for i in range(3)]
        n = [e1[1]*e2[2]-e1[2]*e2[1], e1[2]*e2[0]-e1[0]*e2[2], e1[0]*e2[1]-e1[1]*e2[0]]
        vn = vs[t[0]]['normal']; agree += 1 if sum(n[i]*vn[i] for i in range(3)) >= 0 else -1
    flip = agree < 0
    if mirror: flip = not flip
    used = sorted(set(v for t in tris for v in t)); remap = {v: i for i, v in enumerate(used)}
    pos = []; nor = []; uv = []
    for v in used:
        p = conv(vs[v]['pos']); n = convn(vs[v]['normal'])
        if mirror: p = (-p[0], p[1], p[2]); n = (-n[0], n[1], n[2])
        pos.append(p); nor.append(n); u = vs[v].get('uv0', (0, 0)); uv.append((u[0], u[1]))
    ind = []
    for t in tris:
        a, b, c = (remap[v] for v in t)
        ind += [a, c, b] if flip else [a, b, c]
    return pos, nor, uv, ind, [sk[vs[v]['blendi'][2]]['name'] for v in used[:1]] if 'blendi' in vs[0] else []

total = 0; manifest = []
for gi, g in enumerate(model['geoms']):
    s = d['shaders'][g['shader']]
    if only and gi not in only: continue
    if gi in skip or s['name'] in skip_shaders: continue
    res = build_geometry(g, gi=gi)
    if not res: continue
    pos, nor, uv, ind, bones = res
    tex = s['params'].get('DiffuseSampler', (None, None))[1] or ''
    name = 'g%02d_%s_%s' % (gi, s['name'].replace('vehicle_', ''), re.sub(r'[^A-Za-z0-9]+', '', tex)[:16])
    prim = out.primitive(pos, nor, uv, ind, material(g['shader']))
    mi = out.mesh(name, [prim]); out.node({'name': name, 'mesh': mi})
    total += len(ind)//3; manifest.append((name, len(ind)//3))
    print('%-40s tris %6d' % (name, len(ind)//3))

if wheel_model and not args.no_wheels:
    import decimate
    groups = [('cap', [0], 60, 'spec|dourado'), ('ring', [1], 120, 'vehicle_mesh|black'), ('rim', [2, 3, 4, 5], args.wheel_tris, 'wheel|rim'),
              ('tire', [6, 7, 8, 9], int(args.wheel_tris * 0.7), 'wheel|tire'), ('disc', [10], 60, 'vehicle_tire|tormoz_color')]
    mats = {}
    for name, gis, target, mname in groups:
        if mname in mats: continue
        shader, tex = mname.split('|')
        m = {'name': mname, 'pbrMetallicRoughness': {'metallicFactor': 0.0, 'roughnessFactor': 0.7}, 'extras': {'shader': shader, 'tex': tex}}
        ti = tex_index(tex) if tex in txd else None
        if ti is not None: m['pbrMetallicRoughness']['baseColorTexture'] = {'index': ti}
        else: m['pbrMetallicRoughness']['baseColorFactor'] = {'rim': [0.55, 0.56, 0.58, 1], 'tire': [0.07, 0.07, 0.07, 1]}.get(tex, [0.5, 0.5, 0.5, 1])
        mats[mname] = out.material(m)
    decimated = {}
    for name, gis, target, mname in groups:
        pos = []; attrs = []; tris = []
        for gi in gis:
            if gi >= len(wheel_model['geoms']): continue
            g = wheel_model['geoms'][gi]; vs = rage.vertices(r, g); idx = rage.indices(r, g); base = len(pos)
            for v in vs: pos.append(v['pos']); attrs.append((v['normal'], v.get('uv0', (0, 0))))
            tris += [[base + idx[i], base + idx[i+1], base + idx[i+2]] for i in range(0, len(idx) - len(idx) % 3, 3)]
        if not tris: continue
        p2, a2, t2 = decimate.decimate(pos, attrs, tris, target)
        decimated[name] = (p2, a2, t2, mname)
        print('%-40s tris %6d -> %5d' % ('wheel ' + name, len(tris), len(t2)))
    for side, mirror in (('l', False), ('r', True)):
        prims = []
        for name, (p2, a2, t2, mname) in decimated.items():
            sx = -1 if mirror else 1
            pos = [(sx * p[0], p[2], -p[1]) for p in p2]; nor = [(sx * a[0][0], a[0][2], -a[0][1]) for a in a2]; uv = [a[1] for a in a2]
            # orientação original é horária (igual ao corpo): inverte; espelho inverte de novo
            ind = [i for t in t2 for i in ((t[0], t[1], t[2]) if mirror else (t[0], t[2], t[1]))]
            prims.append(out.primitive(pos, nor, uv, ind, mats[mname]))
            if side == 'l': total += 2 * len(t2)
        mi = out.mesh('wheel_' + side, prims)
        for bn in (('wheel_lf', 'wheel_lr') if side == 'l' else ('wheel_rf', 'wheel_rr')):
            p = conv(sk[bone_by_name[bn]]['pos'])
            out.node({'name': bn, 'mesh': mi, 'translation': list(p)})
            print('  nó %s em %s' % (bn, [round(x, 3) for x in p]))

bbmin = conv(d['bbmin']); bbmax = conv(d['bbmax'])
out.write(args.out, extras={'source': frag['name'], 'bbox': [bbmin, bbmax], 'wheelRadius': wheel_r})
print('total tris', total, '->', args.out, '%.1f MB' % (__import__('os').path.getsize(args.out)/1e6))
