"""dff2glb genérico: carros e motos RenderWare (GTA SA .dff + .txd) para GLB no espaço do jogo.
Cores-chave do GTA SA (60,255,0 primária; 255,0,175 secundária) viram o material "paint";
materiais com alpha < 255 viram "glass". Decima tudo até um orçamento de triângulos."""
import sys, os, re, argparse, math
sys.path.insert(0, os.path.dirname(__file__))
import dff, dxt, glb, decimate

ap = argparse.ArgumentParser()
ap.add_argument('dff'); ap.add_argument('txd', nargs='?'); ap.add_argument('--out', required=True)
ap.add_argument('--skip-frames', default='_dam,ped_,Box_', help='trechos de nome de frame a ignorar (separados por vírgula)')
ap.add_argument('--skip-tex', default='')
ap.add_argument('--only-frames', default='', help='se dado, exporta só frames cujo nome contém um destes trechos')
ap.add_argument('--texsize', type=int, default=128)
ap.add_argument('--target', type=int, default=12000, help='orçamento total de triângulos (decimação proporcional)')
ap.add_argument('--min-tris', type=int, default=24)
ap.add_argument('--wheel-frame', default='', help='frame da roda única a instanciar nos wheel_*_dummy (ex.: wheel)')
ap.add_argument('--paint-frames', default='', help='frames cujos materiais sem textura viram paint (ex.: bau)')
ap.add_argument('--rename', default='', help='renomeia materiais sem textura por cor: "r,g,b=nome;..." (ex.: 196,131,87=skin)')
ap.add_argument('--ground', type=float, default=None)
ap.add_argument('--max-coord', type=float, default=60.0, help='descarta triângulos com vértices absurdos')
args = ap.parse_args()

d = open(args.dff, 'rb').read(); m = dff.read_dff(d)
txd = dff.read_txd(open(args.txd, 'rb').read()) if args.txd else {}
class TR: pass
tr = TR(); tr.data = open(args.txd, 'rb').read() if args.txd else b''
frames = m['frames']
skipf = [s for s in args.skip_frames.split(',') if s]; onlyf = [s for s in args.only_frames.split(',') if s]
skipt = set(args.skip_tex.lower().split(','))
paint_frames = [s for s in args.paint_frames.split(',') if s]
renames = {tuple(int(x) for x in k.split(',')): v for k, v in (item.split('=') for item in args.rename.split(';') if item)}
PAINT_KEYS = {(60, 255, 0), (255, 0, 175)}

def frame_name(a): return frames[a['frame']]['name']
def wanted(a):
    n = frame_name(a)
    if any(s in n for s in skipf): return False
    if onlyf and not any(s in n for s in onlyf): return False
    return True

# geometria no espaço do clump, por atomic
def world_prims(a):
    g = m['geoms'][a['geom']]; R, t = dff.frame_world(frames, a['frame'])
    pos = [dff.transform(v, R, t) for v in g['verts']]
    nor = [dff.transform(n, R, (0, 0, 0)) for n in g['normals']] if g['normals'] else [(0, 0, 1)] * len(pos)
    return g, pos, nor

# chão = mínimo z das rodas (ou de tudo)
allz = []
for a in m['atomics']:
    if not wanted(a): continue
    g, pos, nor = world_prims(a)
    allz += [p[2] for p in pos if abs(p[0]) < args.max_coord and abs(p[1]) < args.max_coord and abs(p[2]) < args.max_coord]
ground = args.ground if args.ground is not None else min(allz)
print('chão z=%.3f' % ground)
conv = lambda p: (p[0], p[2] - ground, -p[1])
convn = lambda n: (n[0], n[2], -n[1])

out = glb.GLB(); tex_cache = {}; mat_cache = {}
def tex_index(name):
    key = (name or '').lower()
    if key in tex_cache: return tex_cache[key]
    t = txd.get(key)
    ok = t is not None and (t['format'] in ('DXT1', 'DXT3', 'DXT5') or (isinstance(t['format'], int) and (t['format'] & 0x0f00) in (0x0500, 0x0600) and t['depth'] == 32))
    if not ok: tex_cache[key] = None; print('  textura ausente/não suportada:', name, t and t['format']); return None
    data, w, h = dxt.texture_png(tr, t, args.texsize)
    tex_cache[key] = out.image_png(name, data); print('  textura %s %dx%d -> %dx%d' % (name, t['w'], t['h'], w, h))
    return tex_cache[key]

def mat_name(mat, fname):
    tex = (mat['tex'] or '').lower(); col = mat['color']
    if col[:3] in PAINT_KEYS and col[3] == 255: return 'paint'
    if any(s in fname for s in paint_frames) and not tex: return 'paint2'
    if col[3] < 255: return 'glass|%s|%d,%d,%d,%d' % (tex, *col)
    if not tex and col[:3] in renames: return renames[col[:3]]
    return '%s|%d,%d,%d,%d' % (tex, *col)

def material(mat, fname):
    name = mat_name(mat, fname)
    if name in mat_cache: return mat_cache[name]
    tex = (mat['tex'] or '').lower(); col = mat['color']
    mm = {'name': name, 'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': 0.8}, 'extras': {'tex': tex, 'color': list(col)}}
    if name == 'paint': mm['pbrMetallicRoughness']['baseColorFactor'] = [0.8, 0.1, 0.1, 1]
    elif name == 'paint2': mm['pbrMetallicRoughness']['baseColorFactor'] = [0.9, 0.7, 0.1, 1]
    else:
        ti = tex_index(mat['tex']) if tex and tex not in skipt else None
        if ti is not None: mm['pbrMetallicRoughness']['baseColorTexture'] = {'index': ti}
        mm['pbrMetallicRoughness']['baseColorFactor'] = [col[0] / 255, col[1] / 255, col[2] / 255, col[3] / 255]
        if col[3] < 255: mm['alphaMode'] = 'BLEND'; mm['doubleSided'] = True
    mat_cache[name] = out.material(mm); return mat_cache[name]

# coleta primitivas: (nome, mat, pos, nor, uv, tris)
prims = []
wheel_prims = []; wheel_origin = None
for a in m['atomics']:
    if not wanted(a): continue
    fname = frame_name(a); g, pos, nor = world_prims(a)
    is_wheel = bool(args.wheel_frame) and fname == args.wheel_frame
    if is_wheel:
        R, t = dff.frame_world(frames, a['frame']); wheel_origin = t
    by = {}
    for t3 in g['tris']:
        a0, b0, c0, mi = t3
        if g['materials'][mi]['tex'] and g['materials'][mi]['tex'].lower() in skipt: continue
        if any(abs(c) > args.max_coord for v in (a0, b0, c0) for c in pos[v]): continue
        by.setdefault(mi, []).append((a0, b0, c0))
    LIGHT_KEYS = {(255, 175, 0), (185, 255, 0), (0, 255, 200), (255, 60, 0), (255, 255, 0), (0, 255, 255), (255, 0, 255)}
    groups = []
    for mi, tris in by.items():
        mat = g['materials'][mi]
        if not mat['tex'] and mat['color'][:3] in LIGHT_KEYS:
            # luzes: separa frente (y > 0 no GTA) e trás para o jogo decidir farol/lanterna pela posição
            front = [tt for tt in tris if sum(pos[v][1] for v in tt) > 0]; back = [tt for tt in tris if sum(pos[v][1] for v in tt) <= 0]
            if front: groups.append((mi, front))
            if back: groups.append((mi, back))
        else: groups.append((mi, tris))
    for mi, tris in groups:
        mat = g['materials'][mi]
        used = sorted(set(v for tt in tris for v in tt)); remap = {v: i for i, v in enumerate(used)}
        P = []; N = []; UV = []
        for v in used:
            p = pos[v]
            if is_wheel: p = (p[0] - wheel_origin[0], p[1] - wheel_origin[1], p[2] - wheel_origin[2])
            P.append(p); N.append(nor[v]); UV.append(g['uvs'][0][v] if g['uvs'] else (0, 0))
        T = [[remap[v] for v in tt] for tt in tris]
        (wheel_prims if is_wheel else prims).append([fname, mat, P, N, UV, T])

total = sum(len(p[5]) for p in prims) + 4 * sum(len(p[5]) for p in wheel_prims)
print('triângulos antes: %d (roda única: %d)' % (total, sum(len(p[5]) for p in wheel_prims)))
scale = min(1.0, args.target / max(1, total))
def dec(p):
    fname, mat, P, N, UV, T = p
    target = max(args.min_tris, int(len(T) * scale))
    if len(T) <= target: return p
    P2, A2, T2 = decimate.decimate(P, list(zip(N, UV)), T, target)
    return [fname, mat, P2, [a[0] for a in A2], [a[1] for a in A2], T2]
prims = [dec(p) for p in prims]; wheel_prims = [dec(p) for p in wheel_prims]
total2 = sum(len(p[5]) for p in prims) + 4 * sum(len(p[5]) for p in wheel_prims)
print('triângulos depois: %d' % total2)

def orient(P, N, T):
    agree = 0
    for tt in T[:: max(1, len(T) // 200)]:
        a, b, c = (P[v] for v in tt)
        e1 = [b[i] - a[i] for i in range(3)]; e2 = [c[i] - a[i] for i in range(3)]
        n = [e1[1]*e2[2]-e1[2]*e2[1], e1[2]*e2[0]-e1[0]*e2[2], e1[0]*e2[1]-e1[1]*e2[0]]
        vn = N[tt[0]]; agree += 1 if sum(n[i]*vn[i] for i in range(3)) >= 0 else -1
    return agree < 0

def emit(p, mirror=False, local=False):
    fname, mat, P, N, UV, T = p
    flip = orient(P, N, T)
    if mirror: flip = not flip
    sx = -1 if mirror else 1
    pos = [(sx * q[0], q[2] - (0 if local else ground), -q[1]) for q in P]
    nor = [(sx * n[0], n[2], -n[1]) for n in N]
    ind = [i for tt in T for i in ((tt[0], tt[2], tt[1]) if flip else (tt[0], tt[1], tt[2]))]
    return out.primitive(pos, nor, UV, ind, material(mat, fname))

bymesh = {}
for p in prims: bymesh.setdefault(p[0], []).append(p)
for fname, ps in bymesh.items():
    name = re.sub(r'[^A-Za-z0-9_]+', '', fname) or 'part'
    mi = out.mesh(name, [emit(p) for p in ps]); out.node({'name': name, 'mesh': mi})
    print('%-28s tris %6d' % (name, sum(len(p[5]) for p in ps)))
if wheel_prims:
    for side, mirror in (('r', False), ('l', True)):
        mi = out.mesh('wheel_' + side, [emit(p, mirror=mirror, local=True) for p in wheel_prims])
        for f in frames:
            if f['name'].startswith('wheel_') and f['name'].endswith('_dummy') and f['name'][6] == side:
                R, t = dff.frame_world(frames, frames.index(f))
                out.node({'name': f['name'].replace('_dummy', ''), 'mesh': mi, 'translation': list(conv(t))})
                print('  nó %s em %s' % (f['name'], [round(x, 3) for x in conv(t)]))
pts = [conv(q) for p in prims for q in p[2]]
bb = [[min(q[i] for q in pts) for i in range(3)], [max(q[i] for q in pts) for i in range(3)]]
out.write(args.out, extras={'bbox': bb})
print('bbox', [[round(x, 2) for x in b] for b in bb], 'tris', total2, '->', args.out, '%.1f MB' % (os.path.getsize(args.out) / 1e6))
