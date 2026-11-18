"""Troca as rodas de um GLB já exportado pela roda de blend_wheel.py, sem precisar do .yft original.

    python3 swap_wheel.py assets/astra.glb roda.json assets/astra.glb [--keep vehicle_tire]

Substitui as primitivas das malhas wheel_l / wheel_r (mantendo as que casam com --keep, ex.: o disco de freio)
e regrava o binário só com o que continua em uso.
"""
import sys, json, struct, argparse
ap = argparse.ArgumentParser()
ap.add_argument('glb'); ap.add_argument('wheel'); ap.add_argument('out')
ap.add_argument('--keep', default='vehicle_tire', help='prefixos de material das primitivas da roda a manter')
args = ap.parse_args()

d = open(args.glb, 'rb').read()
jl = struct.unpack_from('<I', d, 12)[0]; j = json.loads(d[20:20 + jl]); bin0 = d[20 + jl + 8:]
keep = tuple(k for k in args.keep.split(',') if k)
groups = json.load(open(args.wheel))['groups']

new_bin = bytearray(); views = []; accs = []
def view(data, target=None):
    while len(new_bin) % 4: new_bin.append(0)
    v = {'buffer': 0, 'byteOffset': len(new_bin), 'byteLength': len(data)}
    if target: v['target'] = target
    new_bin.extend(data); views.append(v); return len(views) - 1
view_map = {}
def copy_view(i):
    if i not in view_map:
        bv = j['bufferViews'][i]; o = bv.get('byteOffset', 0)
        view_map[i] = view(bin0[o:o + bv['byteLength']], bv.get('target'))
        if 'byteStride' in bv: views[view_map[i]]['byteStride'] = bv['byteStride']
    return view_map[i]
acc_map = {}
def copy_acc(i):
    if i not in acc_map:
        a = dict(j['accessors'][i]); a['bufferView'] = copy_view(a['bufferView']); accs.append(a); acc_map[i] = len(accs) - 1
    return acc_map[i]
def acc(fmt, n, rows, typ, ctype, target, minmax=False):
    flat = [c for r in rows for c in r] if n > 1 else list(rows)
    a = {'bufferView': view(struct.pack('<%d%s' % (len(flat), fmt), *flat), target), 'componentType': ctype, 'count': len(rows), 'type': typ}
    if minmax: a['min'] = [min(r[k] for r in rows) for k in range(n)]; a['max'] = [max(r[k] for r in rows) for k in range(n)]
    accs.append(a); return len(accs) - 1

mat_index = {m['name']: i for i, m in enumerate(j['materials'])}
def material(name):
    if name not in mat_index:
        j['materials'].append({'name': name, 'pbrMetallicRoughness': {'metallicFactor': 0.0, 'roughnessFactor': 0.7, 'baseColorFactor': [0.5, 0.5, 0.5, 1]}})
        mat_index[name] = len(j['materials']) - 1
    return mat_index[name]

def wheel_prims(mirror):
    prims = []; sx = -1 if mirror else 1
    for g in groups:
        # roda do GTA (x eixo, y frente, z cima) -> jogo (x, y cima, -z frente); espelho no x para o lado direito
        pos = [(sx * p[0], p[2], -p[1]) for p in g['pos']]; nor = [(sx * n[0], n[2], -n[1]) for n in g['nor']]
        ind = [i for t in g['tris'] for i in ((t[0], t[1], t[2]) if mirror else (t[0], t[2], t[1]))]
        big = len(pos) > 65535
        prims.append({'attributes': {'POSITION': acc('f', 3, pos, 'VEC3', 5126, 34962, True), 'NORMAL': acc('f', 3, nor, 'VEC3', 5126, 34962),
                                     'TEXCOORD_0': acc('f', 2, [(0.0, 0.0)] * len(pos), 'VEC2', 5126, 34962)},
                      'indices': acc('I' if big else 'H', 1, ind, 'SCALAR', 5125 if big else 5123, 34963), 'material': material(g['material'])})
    return prims

total = 0
for m in j['meshes']:
    wheel = m['name'] in ('wheel_l', 'wheel_r')
    prims = []
    for p in m['primitives']:
        if wheel and not j['materials'][p['material']]['name'].startswith(keep): continue
        q = dict(p); q['attributes'] = {k: copy_acc(v) for k, v in p['attributes'].items()}; q['indices'] = copy_acc(p['indices']); prims.append(q)
    if wheel: prims += wheel_prims(m['name'] == 'wheel_r')
    m['primitives'] = prims
    total += sum(accs[p['indices']]['count'] // 3 for p in prims) * (2 if wheel else 1)
for im in j.get('images', []): im['bufferView'] = copy_view(im['bufferView'])
j['bufferViews'] = views; j['accessors'] = accs
while len(new_bin) % 4: new_bin.append(0)
j['buffers'] = [{'byteLength': len(new_bin)}]
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
out = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(new_bin)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(new_bin), b'BIN\x00') + bytes(new_bin)
open(args.out, 'wb').write(out)
print('total tris ~%d -> %s %.1f MB' % (total, args.out, len(out) / 1e6))
