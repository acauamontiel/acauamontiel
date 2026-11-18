"""Extrai uma roda de um .blend para o JSON que export_glb.py aceita em --wheel-json.

Roda com o módulo `bpy` (pip install bpy) ou dentro do Blender:
    python3 blend_wheel.py roda.blend roda.json [--radius 0.319] [--outer -0.125]

Espera a roda deitada (eixo em Z, face externa em +Z) e classifica os objetos pelo material:
borracha -> pneu, dourado -> emblema, o resto -> aro. Objetos sem pai (piso, câmera, luzes) ficam de fora.
Malhas pesadas são reduzidas com o modificador Decimate (colapso) até o orçamento de triângulos.
"""
import sys, json, argparse
import bpy

ap = argparse.ArgumentParser()
ap.add_argument('blend'); ap.add_argument('out')
ap.add_argument('--radius', type=float, default=0.319, help='raio externo do pneu no jogo (m)')
ap.add_argument('--outer', type=float, default=-0.125, help='x da face externa do pneu no referencial da roda do GTA')
ap.add_argument('--tire-tris', type=int, default=9000)
ap.add_argument('--rim-tris', type=int, default=14000, help='orçamento por objeto do aro')
args = ap.parse_args()

bpy.ops.wm.open_mainfile(filepath=args.blend)
scene = bpy.context.scene

def kind(o):
    names = ' '.join((s.material.name if s.material else '') for s in o.material_slots).lower() + ' ' + o.name.lower()
    if 'borracha' in names or 'pneu' in names or 'tire' in names or 'rubber' in names: return 'wheel|tire'
    if 'dourado' in names or 'emblema' in names or 'gold' in names: return 'wheel|emblem'
    return 'wheel|rim'

parts = [o for o in scene.objects if o.type == 'MESH' and o.parent is not None]
for o in parts:
    budget = args.tire_tris if kind(o) == 'wheel|tire' else args.rim_tris
    dg = bpy.context.evaluated_depsgraph_get()
    m = o.evaluated_get(dg).to_mesh(); m.calc_loop_triangles(); n = len(m.loop_triangles); o.evaluated_get(dg).to_mesh_clear()
    if n > budget:
        md = o.modifiers.new('game_decimate', 'DECIMATE'); md.decimate_type = 'COLLAPSE'; md.ratio = budget / n

dg = bpy.context.evaluated_depsgraph_get()
raw = []
zmin = 1e9; zmax = -1e9; rmax = 0.0
for o in parts:
    e = o.evaluated_get(dg); m = e.to_mesh(); m.calc_loop_triangles()
    mw = o.matrix_world; nm = mw.to_3x3().inverted().transposed()
    cn = m.corner_normals
    verts = {}; pos = []; nor = []; tris = []
    for t in m.loop_triangles:
        idx = []
        for li in t.loops:
            v = mw @ m.vertices[m.loops[li].vertex_index].co
            nn = (nm @ cn[li].vector).normalized()
            key = (round(v.x, 5), round(v.y, 5), round(v.z, 5), round(nn.x, 2), round(nn.y, 2), round(nn.z, 2))
            i = verts.get(key)
            if i is None:
                i = verts[key] = len(pos); pos.append((v.x, v.y, v.z)); nor.append((nn.x, nn.y, nn.z))
            idx.append(i)
        tris.append(idx)
    k = kind(o)
    if k == 'wheel|tire' and len(pos) > 1000:
        zmin = min(zmin, min(p[2] for p in pos)); zmax = max(zmax, max(p[2] for p in pos))
        rmax = max(rmax, max((p[0] ** 2 + p[1] ** 2) ** 0.5 for p in pos))
    raw.append((o.name, k, pos, nor, tris))
    print('%-12s %-14s tris %6d verts %6d' % (o.name, k, len(tris), len(pos)))
    e.to_mesh_clear()

s = args.radius / rmax
print('escala %.4f (raio %.3f -> %.3f), largura %.3f' % (s, rmax, args.radius, (zmax - zmin) * s))
# Blender (x, y, z = eixo, face externa em +z) -> roda do GTA (x = eixo, face externa em -x): rotação própria.
# O x do Blender vira o eixo horizontal (frente/trás) e o y vira o vertical, para a gravata ficar deitada.
def cv(p): return (args.outer + (zmax - p[2]) * s, -p[0] * s, p[1] * s)
def cn_(n): return (-n[2], -n[0], n[1])
groups = {}
for name, k, pos, nor, tris in raw:
    g = groups.setdefault(k, {'material': k, 'pos': [], 'nor': [], 'tris': []})
    base = len(g['pos'])
    g['pos'] += [[round(c, 5) for c in cv(p)] for p in pos]
    g['nor'] += [[round(c, 3) for c in cn_(n)] for n in nor]
    # export_glb.py inverte o enrolamento (a roda do GTA é horária); aqui já sai invertido para voltar a anti-horário.
    g['tris'] += [[base + t[0], base + t[2], base + t[1]] for t in tris]
json.dump({'groups': list(groups.values())}, open(args.out, 'w'))
print('->', args.out, {k: len(g['tris']) for k, g in groups.items()})
