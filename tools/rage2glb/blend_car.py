"""Converte o carro de um .blend (frente em +Y, chão em Z = 0, 1 unidade = 1 m) no GLB que o jogo carrega.

    pip install bpy        # ou rode dentro do Blender
    python3 blend_car.py astra_fix.blend assets/astra.glb

- objetos ocultos, câmeras, luzes e os nomes em --skip (o chão de cena) ficam de fora;
- cada vazio `<prefixo>lf/lr/rf/rr` (--wheel-prefix) marca uma roda: os filhos do `lf` são reduzidos com Decimate,
  unidos numa malha só e instanciados nos quatro eixos como `wheel_lf/lr/rf/rr` (as da direita espelhadas);
- materiais, cores e texturas saem como estão no .blend; o jogo só decide o tipo de shader pelo nome.
"""
import sys, argparse
import bpy
from mathutils import Matrix

ap = argparse.ArgumentParser()
ap.add_argument('blend'); ap.add_argument('out')
ap.add_argument('--skip', default='Chao,Piso')
ap.add_argument('--wheel-prefix', default='roda_nova_')
ap.add_argument('--tire-tris', type=int, default=9000)
ap.add_argument('--part-tris', type=int, default=14000, help='orçamento por peça da roda (aro, raios...)')
args = ap.parse_args()

bpy.ops.wm.open_mainfile(filepath=args.blend)
scene = bpy.context.scene
skip = set(args.skip.split(','))
wheels = {o.name[len(args.wheel_prefix):]: o for o in scene.objects if o.type == 'EMPTY' and o.name.startswith(args.wheel_prefix)}
locs = {k: o.matrix_world.translation.copy() for k, o in wheels.items()}
src = wheels.get('lf')
keep_children = set(src.children_recursive) if src else set()

for o in list(scene.objects):
    wheel_part = any(o.parent is w or o in w.children_recursive for w in wheels.values())
    drop = (o.hide_render or o.hide_get() or o.name in skip or (o.type not in ('MESH', 'EMPTY'))
            or (wheel_part and o not in keep_children) or (o.type == 'MESH' and o.name.startswith('wheel_')))
    if drop: bpy.data.objects.remove(o, do_unlink=True)

def tri_count(o):
    dg = bpy.context.evaluated_depsgraph_get(); e = o.evaluated_get(dg); m = e.to_mesh(); m.calc_loop_triangles(); n = len(m.loop_triangles); e.to_mesh_clear(); return n

if src:
    parts = [o for o in keep_children if o.type == 'MESH']
    for o in parts:
        names = (o.name + ' ' + ' '.join(s.material.name for s in o.material_slots if s.material)).lower()
        budget = args.tire_tris if ('pneu' in names or 'borracha' in names or 'tire' in names) else args.part_tris
        n = tri_count(o)
        if n > budget:
            md = o.modifiers.new('game_decimate', 'DECIMATE'); md.decimate_type = 'COLLAPSE'; md.ratio = budget / n
    with bpy.context.temp_override(active_object=parts[0], object=parts[0], selected_objects=parts, selected_editable_objects=parts):
        bpy.ops.object.convert(target='MESH')
        bpy.ops.object.join()
    w = parts[0]; mw = w.matrix_world.copy()
    w.parent = None; w.matrix_world = Matrix.Identity(4)
    w.data.transform(Matrix.Translation(-locs['lf']) @ mw)
    w.name = 'wheel_lf'; w.data.name = 'wheel'; w.location = locs['lf']
    print('roda: %d triângulos' % tri_count(w))
    right = None
    for k in ('lr', 'rf', 'rr'):
        if k not in locs: continue
        # as da direita usam uma cópia espelhada da malha (nó sem escala negativa: o jogo gira o nó direto)
        if k[0] == 'r' and right is None:
            right = w.data.copy(); right.name = 'wheel_r'; right.transform(Matrix.Diagonal((-1, 1, 1, 1))); right.flip_normals()
        c = bpy.data.objects.new('wheel_' + k, right if k[0] == 'r' else w.data); scene.collection.objects.link(c)
        c.location = locs[k]
    for e in wheels.values(): bpy.data.objects.remove(e, do_unlink=True)

total = sum(tri_count(o) for o in scene.objects if o.type == 'MESH')
for o in scene.objects: o.select_set(False)
bpy.ops.export_scene.gltf(filepath=args.out, export_format='GLB', export_apply=True, export_yup=True, export_cameras=False, export_lights=False,
                          export_animations=False, export_skins=False, export_morph=False, export_image_format='AUTO')
import os
print('total %d triângulos -> %s %.1f MB' % (total, args.out, os.path.getsize(args.out) / 1e6))
