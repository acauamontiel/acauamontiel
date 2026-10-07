"""dff2glb: exporta um veículo RenderWare (GTA SA .dff + .txd) para GLB no espaço do jogo."""
import sys, os, re, argparse
sys.path.insert(0, os.path.dirname(__file__))
import dff, dxt, glb, decimate

ap = argparse.ArgumentParser()
ap.add_argument('dff'); ap.add_argument('txd'); ap.add_argument('out')
ap.add_argument('--skip-frames', default='_dam,Box_,IL,ped_,das1', help='prefixos/trechos de nome de frame a ignorar')
ap.add_argument('--skip-tex', default='', help='texturas (materiais) a ignorar')
ap.add_argument('--skip-mats', default='', help='índices de material da carroceria a ignorar')
ap.add_argument('--livery-tex', default='', help='texturas que viram o material "livery" (UV projetado: lateral/frente/traseira/teto)')
ap.add_argument('--livery-colors', default='', help='cores RGB (r,g,b;r,g,b) de materiais sem textura que também viram livery')
ap.add_argument('--livery-test', action='store_true', help='embute uma textura de teste colorida por região no material livery')
ap.add_argument('--texsize', type=int, default=128)
ap.add_argument('--wheel-tris', type=int, default=500)
ap.add_argument('--ground', type=float, default=None)
args = ap.parse_args()

d = open(args.dff, 'rb').read(); m = dff.read_dff(d)
td = open(args.txd, 'rb').read(); txd = dff.read_txd(td)
class TR: pass
tr = TR(); tr.data = td
frames = m['frames']
skipf = [s for s in args.skip_frames.split(',') if s]; skipt = set(args.skip_tex.lower().split(',')); skipm = set(int(x) for x in args.skip_mats.split(',') if x)
livery = set(args.livery_tex.lower().split(','))
livery_colors = set(tuple(int(x) for x in c.split(',')) for c in args.livery_colors.split(';') if c)
def is_livery(mat): return (mat['tex'] or '').lower() in livery or (not mat['tex'] and mat['color'][:3] in livery_colors)

# chão: centro da roda - raio
wheel = next((a for a in m['atomics'] if frames[a['frame']]['name'].startswith('reifen') or 'wheel' in frames[a['frame']]['name']), None)
R, t = dff.frame_world(frames, wheel['frame']); g = m['geoms'][wheel['geom']]
wr = max(abs(v[2]) for v in g['verts'])
ground = args.ground if args.ground is not None else t[2] - wr
print('roda raio %.3f centro z %.3f chão %.3f' % (wr, t[2], ground))
conv = lambda p: (p[0], p[2] - ground, -p[1])
convn = lambda n: (n[0], n[2], -n[1])

out = glb.GLB(); tex_cache = {}; mat_cache = {}
def tex_index(name):
    key = (name or '').lower()
    if key in tex_cache: return tex_cache[key]
    t = txd.get(key)
    if t is None: tex_cache[key] = None; print('  textura ausente:', name); return None
    data, w, h = dxt.texture_png(tr, t, args.texsize)
    tex_cache[key] = out.image_png(name, data); print('  textura %s %dx%d -> %dx%d' % (name, t['w'], t['h'], w, h))
    return tex_cache[key]
def material(mat):
    tex = (mat['tex'] or '').lower(); col = mat['color']
    key = (tex, col)
    if key in mat_cache: return mat_cache[key]
    if is_livery(mat):
        key = ('livery', 0)
        if key in mat_cache: return mat_cache[key]
        name = 'livery'; mm = {'name': name, 'pbrMetallicRoughness': {'baseColorFactor': [0.9, 0.9, 0.9, 1], 'metallicFactor': 0, 'roughnessFactor': 0.8}, 'extras': {'tex': 'livery'}}
        if args.livery_test:
            rows = []
            for y in range(128):
                row = bytearray(256 * 4)
                for x in range(256):
                    u, v = x / 256, y / 128
                    if v < 0.5: c = (int(255 * u), 60, int(255 * (1 - 2 * v)))      # lateral: u = frente->trás, v = teto->chão
                    elif u < 0.25: c = (220, 40, 40)                                  # frente
                    elif u < 0.5: c = (40, 200, 60)                                   # traseira
                    elif u < 0.75: c = (240, 220, 40)                                 # teto
                    else: c = (40, 40, 40)                                            # embaixo
                    row[4*x:4*x+4] = bytes(c) + b'\xff'
                rows.append(row)
            mm['pbrMetallicRoughness']['baseColorTexture'] = {'index': out.image_png('livery_test', dxt.png(rows, 256, 128))}
    else:
        name = '%s|%d,%d,%d,%d' % (tex, *col)
        mm = {'name': name, 'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': 0.8}, 'extras': {'tex': tex, 'color': list(col)}}
        ti = tex_index(mat['tex']) if tex else None
        if ti is not None: mm['pbrMetallicRoughness']['baseColorTexture'] = {'index': ti}
        mm['pbrMetallicRoughness']['baseColorFactor'] = [col[0] / 255, col[1] / 255, col[2] / 255, col[3] / 255]
        if col[3] < 255: mm['alphaMode'] = 'BLEND'; mm['doubleSided'] = True
    mat_cache[key] = out.material(mm); return mat_cache[key]

BOX = None  # caixa da carroceria no espaço do jogo, preenchida antes de exportar
def project_uv(p, n):
    (x0, y0, z0), (x1, y1, z1) = BOX
    ax, ay, az = abs(n[0]), abs(n[1]), abs(n[2])
    if ax >= ay and ax >= az:
        u = (p[2] - z0) / (z1 - z0)
        if n[0] > 0: u = 1 - u
        return (u, 0.5 * (y1 - p[1]) / (y1 - y0))
    if az >= ay:
        u = (p[0] - x0) / (x1 - x0)
        if n[2] < 0: u = 1 - u; base = 0.0
        else: base = 0.25
        return (base + 0.25 * u, 0.5 + 0.5 * (y1 - p[1]) / (y1 - y0))
    base = 0.5 if n[1] > 0 else 0.75
    return (base + 0.25 * (p[0] - x0) / (x1 - x0), 0.5 + 0.5 * (p[2] - z0) / (z1 - z0))

def build(g, mats_sel, R, t, local=False):
    """Devolve lista de (mat_idx, prim) para a geometria, separada por material."""
    by = {}
    for a, b, c, mi in g['tris']:
        if mi in mats_sel: by.setdefault(mi, []).append((a, b, c))
    prims = []
    for mi, tris in by.items():
        used = sorted(set(v for tt in tris for v in tt)); remap = {v: i for i, v in enumerate(used)}
        pos = []; nor = []; uv = []
        for v in used:
            p = g['verts'][v]; n = g['normals'][v] if g['normals'] else (0, 0, 1)
            if not local: p = dff.transform(p, R, t); n = dff.transform(n, R, (0, 0, 0))
            pos.append(conv(p) if not local else (p[0], p[2], -p[1])); nor.append(convn(n)); uv.append(g['uvs'][0][v] if g['uvs'] else (0, 0))
        # orientação pelas normais
        agree = 0
        for tt in tris[:: max(1, len(tris) // 200)]:
            a, b, c = (pos[remap[v]] for v in tt)
            e1 = [b[i] - a[i] for i in range(3)]; e2 = [c[i] - a[i] for i in range(3)]
            n = [e1[1]*e2[2]-e1[2]*e2[1], e1[2]*e2[0]-e1[0]*e2[2], e1[0]*e2[1]-e1[1]*e2[0]]
            vn = nor[remap[tt[0]]]; agree += 1 if sum(n[i]*vn[i] for i in range(3)) >= 0 else -1
        flip = agree < 0
        ind = []
        for a, b, c in tris:
            a, b, c = remap[a], remap[b], remap[c]; ind += [a, c, b] if flip else [a, b, c]
        if is_livery(g['materials'][mi]):
            # UV projetado por triângulo (vértices duplicados por face)
            pos2 = []; nor2 = []; uv2 = []; ind2 = []
            for k in range(0, len(ind), 3):
                a, b, c = (pos[ind[k]], pos[ind[k+1]], pos[ind[k+2]])
                e1 = [b[i] - a[i] for i in range(3)]; e2 = [c[i] - a[i] for i in range(3)]
                fn = [e1[1]*e2[2]-e1[2]*e2[1], e1[2]*e2[0]-e1[0]*e2[2], e1[0]*e2[1]-e1[1]*e2[0]]
                for vi in ind[k:k+3]:
                    ind2.append(len(pos2)); pos2.append(pos[vi]); nor2.append(nor[vi]); uv2.append(project_uv(pos[vi], fn))
            pos, nor, uv, ind = pos2, nor2, uv2, ind2
        prims.append((mi, pos, nor, uv, ind))
    return prims

ch = next(a for a in m['atomics'] if frames[a['frame']]['name'] == 'Chassis'); R, t = dff.frame_world(frames, ch['frame'])
pts = [conv(dff.transform(v, R, t)) for v in m['geoms'][ch['geom']]['verts']]
BOX = [[min(p[i] for p in pts) for i in range(3)], [max(p[i] for p in pts) for i in range(3)]]
total = 0
for a in m['atomics']:
    f = frames[a['frame']]; fname = f['name']
    if any(s in fname for s in skipf): continue
    g = m['geoms'][a['geom']]
    R, t = dff.frame_world(frames, a['frame'])
    mats_sel = set(mi for mi, mat in enumerate(g['materials']) if (mat['tex'] or '').lower() not in skipt and not (fname == 'Chassis' and mi in skipm))
    is_wheel = fname.startswith('reifen')
    prims = build(g, mats_sel, R, t, local=is_wheel)
    gprims = []
    for mi, pos, nor, uv, ind in prims:
        mat = g['materials'][mi]
        if is_wheel and len(ind) // 3 > args.wheel_tris:
            attrs = list(zip(nor, uv)); tris = [ind[i:i+3] for i in range(0, len(ind), 3)]
            p2, a2, t2 = decimate.decimate(pos, attrs, tris, args.wheel_tris)
            print('  roda %s: %d -> %d tris' % (fname, len(tris), len(t2)))
            pos, nor, uv, ind = p2, [x[0] for x in a2], [x[1] for x in a2], [i for tt in t2 for i in tt]
        name = '%s_m%02d_%s' % (fname, mi, re.sub(r'[^A-Za-z0-9]+', '', mat['tex'] or 'cor'))
        prim = out.primitive(pos, nor, uv, ind, material(mat)); total += len(ind) // 3
        if is_wheel: gprims.append(prim)
        else:
            mi2 = out.mesh(name, [prim]); out.node({'name': name, 'mesh': mi2}); print('%-40s tris %6d' % (name, len(ind) // 3))
    if is_wheel and gprims:
        mi2 = out.mesh(fname, gprims); out.node({'name': 'wheel_' + fname.split('_')[1], 'mesh': mi2, 'translation': list(conv(t))})
        print('  nó wheel_%s em %s' % (fname.split('_')[1], [round(x, 3) for x in conv(t)]))

bb = BOX
out.write(args.out, extras={'bbox': bb, 'wheelRadius': wr})
print('bbox', [[round(x, 2) for x in b] for b in bb]); print('total tris', total, '->', args.out, '%.1f MB' % (os.path.getsize(args.out) / 1e6))
