import struct, json

class GLB:
    def __init__(self):
        self.bin = bytearray(); self.views = []; self.accessors = []; self.images = []; self.textures = []
        self.materials = []; self.meshes = []; self.nodes = []; self.samplers = [{'magFilter': 9728, 'minFilter': 9986, 'wrapS': 10497, 'wrapT': 10497}]
    def view(self, data, target=None):
        while len(self.bin) % 4: self.bin += b'\0'
        v = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(data)}
        if target: v['target'] = target
        self.bin += data; self.views.append(v); return len(self.views) - 1
    def accessor(self, data, ctype, count, atype, minmax=None, target=34962):
        a = {'bufferView': self.view(data, target), 'componentType': ctype, 'count': count, 'type': atype}
        if minmax: a['min'], a['max'] = minmax
        self.accessors.append(a); return len(self.accessors) - 1
    def image_png(self, name, data):
        self.images.append({'name': name, 'mimeType': 'image/png', 'bufferView': self.view(data)})
        self.textures.append({'sampler': 0, 'source': len(self.images) - 1}); return len(self.textures) - 1
    def material(self, m): self.materials.append(m); return len(self.materials) - 1
    def mesh(self, name, prims): self.meshes.append({'name': name, 'primitives': prims}); return len(self.meshes) - 1
    def node(self, n): self.nodes.append(n); return len(self.nodes) - 1
    def primitive(self, positions, normals, uvs, indices, material):
        n = len(positions)
        pos = struct.pack('<%df' % (3*n), *[c for p in positions for c in p])
        mn = [min(p[i] for p in positions) for i in range(3)]; mx = [max(p[i] for p in positions) for i in range(3)]
        prim = {'attributes': {'POSITION': self.accessor(pos, 5126, n, 'VEC3', (mn, mx))}, 'material': material, 'mode': 4}
        if normals:
            prim['attributes']['NORMAL'] = self.accessor(struct.pack('<%df' % (3*n), *[c for p in normals for c in p]), 5126, n, 'VEC3')
        if uvs:
            prim['attributes']['TEXCOORD_0'] = self.accessor(struct.pack('<%df' % (2*n), *[c for p in uvs for c in p]), 5126, n, 'VEC2')
        if n <= 65535:
            prim['indices'] = self.accessor(struct.pack('<%dH' % len(indices), *indices), 5123, len(indices), 'SCALAR', target=34963)
        else:
            prim['indices'] = self.accessor(struct.pack('<%dI' % len(indices), *indices), 5125, len(indices), 'SCALAR', target=34963)
        return prim
    def write(self, path, extras=None):
        while len(self.bin) % 4: self.bin += b'\0'
        j = {'asset': {'version': '2.0', 'generator': 'crazy-astra rage2glb'}, 'buffers': [{'byteLength': len(self.bin)}], 'bufferViews': self.views,
             'accessors': self.accessors, 'materials': self.materials, 'meshes': self.meshes, 'nodes': self.nodes,
             'scenes': [{'nodes': list(range(len(self.nodes)))}], 'scene': 0, 'samplers': self.samplers}
        if self.images: j['images'] = self.images; j['textures'] = self.textures
        if extras: j['extras'] = extras
        js = json.dumps(j, separators=(',', ':')).encode()
        while len(js) % 4: js += b' '
        out = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(self.bin))
        out += struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(self.bin)) + b'BIN\0' + bytes(self.bin)
        open(path, 'wb').write(out)
