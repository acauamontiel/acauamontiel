import sys, zlib, struct, json

def joaat(s):
    h = 0
    for c in s.lower().encode():
        h = (h + c) & 0xffffffff
        h = (h + (h << 10)) & 0xffffffff
        h ^= h >> 6
    h = (h + (h << 3)) & 0xffffffff
    h ^= h >> 11
    h = (h + (h << 15)) & 0xffffffff
    return h

SHADER_NAMES = """vehicle_paint1 vehicle_paint2 vehicle_paint3 vehicle_paint4 vehicle_paint5 vehicle_paint6 vehicle_paint7 vehicle_paint8 vehicle_paint9
vehicle_paint1_enveff vehicle_paint2_enveff vehicle_paint3_enveff vehicle_paint4_enveff vehicle_paint6_enveff vehicle_paint3_lvr vehicle_paint4_emissive vehicle_paint5_enveff vehicle_paint7_enveff vehicle_paint8_enveff vehicle_paint9_enveff
vehicle_mesh vehicle_mesh2_enveff vehicle_mesh_enveff vehicle_vehglass vehicle_vehglass_inner vehicle_interior vehicle_interior2 vehicle_lightsemissive vehicle_tire vehicle_tire_emissive
vehicle_detail vehicle_detail2 vehicle_badges vehicle_decal vehicle_decal2 vehicle_dash_emissive vehicle_dash_emissive_opaque vehicle_basic vehicle_blurredrotor vehicle_blurredrotor_emissive
vehicle_cloth vehicle_cloth2 vehicle_cutout vehicle_emissive_opaque vehicle_emissive_alpha vehicle_generic vehicle_licenseplate vehicle_track vehicle_track2 vehicle_track_ammo vehicle_track_emissive vehicle_lights vehicle_nosplash vehicle_nowater vehicle_shuts vehicle_wheel vehicle_cloth_enveff vehicle_paint4_fence
default normal spec emissive glass decal cutout""".split()
SHADER_BY_HASH = {joaat(n): n for n in SHADER_NAMES}
PARAM_NAMES = """DiffuseSampler BumpSampler SpecSampler DirtSampler DiffuseSampler2 DiffuseSampler3 DamageSampler SnowSampler DetailSampler DiffuseSampler2 BumpSampler2 SpecSampler2 EnvironmentSampler ReflectionSampler
matDiffuseColor matDiffuseColor2 matDiffuseColorTint specularFactor specularColorFactor specularFalloffMult specularFresnel specularIntensityMult bumpiness emissiveMultiplier dirtLevelMod dirtColor dirtColor2 dirtTint
diffuse2SpecMod diffuseTexMatrix diffuseTexMatrix2 hardAlphaBlend envEffFatThickness envEffScale envEffTexTileUV envEffThickness envEffColorMod damageMap damageTextureOffset bumpSamplerDamaged envEffSampler
reflectivePower envEffZScale emissiveMultiplier matMaterialColorScale spec2Factor spec2ColorIntensity spec2Color specularFalloff specularIntensity dirtDecalMask dirtDecalMod dimmerSetPacked umGlobalParams tintPaletteSelector
detailSettings tintPaletteSampler useTessellation wetnessMultiplier bumpSelector""".split()
PARAM_BY_HASH = {joaat(n): n for n in PARAM_NAMES}

TYPE_SIZES = {0:0,1:4,2:4,3:8,4:4,5:8,6:12,7:16,8:4,9:4,10:4,11:4,12:4,13:4,14:4,15:4}
SEMANTICS = ['pos','blendw','blendi','normal','color0','color1','uv0','uv1','uv2','uv3','uv4','uv5','uv6','uv7','tangent0','tangent1']

def size_from_flags(flags):
    s = [((flags>>27)&1)<<0, ((flags>>26)&1)<<1, ((flags>>25)&1)<<2, ((flags>>24)&1)<<3,
         ((flags>>17)&0x7F)<<4, ((flags>>11)&0x3F)<<5, ((flags>>7)&0xF)<<6, ((flags>>5)&0x3)<<7, ((flags>>4)&1)<<8]
    return (0x200 << (flags & 0xF)) * sum(s)

class Res:
    def __init__(self, path):
        d = open(path,'rb').read()
        magic, ver, sysf, gfxf = struct.unpack('<4sIII', d[:16])
        assert magic == b'RSC7', magic
        self.version = ver
        self.sysz = size_from_flags(sysf); self.gfxz = size_from_flags(gfxf)
        self.data = zlib.decompress(d[16:], -15)
        assert len(self.data) == self.sysz + self.gfxz, (hex(len(self.data)), hex(self.sysz), hex(self.gfxz))
    def off(self, p):
        if p == 0: return None
        seg = p >> 28
        o = p & 0x0fffffff
        if seg == 5: return o
        if seg == 6: return self.sysz + o
        raise ValueError(hex(p))
    def u8(self,o): return self.data[o]
    def u16(self,o): return struct.unpack_from('<H', self.data, o)[0]
    def u32(self,o): return struct.unpack_from('<I', self.data, o)[0]
    def u64(self,o): return struct.unpack_from('<Q', self.data, o)[0]
    def f32(self,o): return struct.unpack_from('<f', self.data, o)[0]
    def vec(self,o,n): return struct.unpack_from('<%df'%n, self.data, o)
    def ptr(self,o): return self.off(self.u64(o))
    def cstr(self,o):
        if o is None: return None
        e = self.data.index(b'\0', o); return self.data[o:e].decode('latin1')
    def ptrlist(self, o):  # ResourcePointerList64: ptr, count u16, cap u16
        p = self.ptr(o); n = self.u16(o+8)
        return [self.ptr(p+8*i) for i in range(n)] if p is not None else []

def read_texture_base(r, o):
    return {'name': r.cstr(r.ptr(o+0x28))}

def read_texture(r, o):
    t = read_texture_base(r, o)
    t.update({'w': r.u16(o+0x50), 'h': r.u16(o+0x52), 'depth': r.u16(o+0x54), 'stride': r.u16(o+0x56),
              'format': r.data[o+0x58:o+0x5c].decode('latin1') if r.data[o+0x58:o+0x5c].isalnum() or b' ' in r.data[o+0x58:o+0x5c] else r.u32(o+0x58),
              'levels': r.u8(o+0x5d), 'data': r.ptr(o+0x70)})
    return t

def read_txd(r, o):
    out = []
    n = r.u16(o+0x38); tp = r.ptr(o+0x30)
    hp = r.ptr(o+0x20)
    for i in range(n):
        t = read_texture(r, r.ptr(tp+8*i)); t['hash'] = r.u32(hp+4*i); out.append(t)
    return out

def read_shader(r, o):
    pp = r.ptr(o); nameh = r.u32(o+8); pcount = r.u8(o+0x10); bucket = r.u8(o+0x11); pdsize = r.u16(o+0x14)
    fileh = r.u32(o+0x18)
    params = {}
    hashes_o = pp + pdsize
    for i in range(pcount):
        po = pp + 16*i
        typ = r.u8(po); dp = r.ptr(po+8); h = r.u32(hashes_o + 4*i)
        name = PARAM_BY_HASH.get(h, '0x%08x' % h)
        if typ == 0:
            params[name] = ('tex', r.cstr(r.ptr(dp+0x28)) if dp is not None else None)
        else:
            params[name] = ('vec', [list(r.vec(dp+16*k, 4)) for k in range(typ)] if dp is not None else None)
    return {'name': SHADER_BY_HASH.get(nameh, '0x%08x' % nameh), 'file': SHADER_BY_HASH.get(fileh, '0x%08x' % fileh), 'bucket': bucket, 'params': params}

def read_shader_group(r, o):
    n = r.u16(o+0x18); sp = r.ptr(o+0x10)
    return [read_shader(r, r.ptr(sp+8*i)) for i in range(n)]

def read_skeleton(r, o):
    if o is None: return []
    n = r.u16(o+0x5e); bp = r.ptr(o+0x20)
    bones = []
    for i in range(n):
        b = bp + 0x50*i
        bones.append({'rot': list(r.vec(b,4)), 'pos': list(r.vec(b+0x10,3)), 'scale': list(r.vec(b+0x20,3)),
                      'sibling': struct.unpack_from('<h', r.data, b+0x30)[0], 'parent': struct.unpack_from('<h', r.data, b+0x32)[0],
                      'name': r.cstr(r.ptr(b+0x38)), 'flags': r.u16(b+0x40), 'index': r.u16(b+0x42), 'tag': r.u16(b+0x44)})
    return bones

def half(h):
    s = (h >> 15) & 1; e = (h >> 10) & 0x1f; m = h & 0x3ff
    if e == 0: v = (m / 1024.0) * 2.0**-14
    elif e == 31: v = float('inf') if m == 0 else float('nan')
    else: v = (1 + m/1024.0) * 2.0**(e-15)
    return -v if s else v

def read_decl(r, o):
    flags = r.u32(o); stride = r.u16(o+4); count = r.u8(o+7); types = r.u64(o+8)
    comps = []; off = 0
    for i in range(16):
        if flags & (1 << i):
            t = (types >> (4*i)) & 0xf
            comps.append((SEMANTICS[i], t, off)); off += TYPE_SIZES[t]
    return {'stride': stride, 'count': count, 'comps': comps, 'computed': off}

def decode_component(r, o, t):
    d = r.data
    if t == 1: return (half(r.u16(o)), half(r.u16(o+2)))
    if t == 2: return (r.f32(o),)
    if t == 3: return tuple(half(r.u16(o+2*k)) for k in range(4))
    if t == 5: return r.vec(o,2)
    if t == 6: return r.vec(o,3)
    if t == 7: return r.vec(o,4)
    if t == 8: return tuple(d[o:o+4])
    if t == 9: return tuple(d[o:o+4])  # BGRA? ubyte4n
    if t == 10:  # Dec3N
        v = r.u32(o)
        def s10(x): x &= 0x3ff; return (x - 1024 if x & 0x200 else x) / 511.0
        return (s10(v), s10(v>>10), s10(v>>20), ((v>>30)&3))
    return None

def read_geometry(r, o):
    vb = r.ptr(o+0x18); ib = r.ptr(o+0x38)
    icount = r.u32(o+0x58)
    boneids_p = r.ptr(o+0x68); stride = r.u16(o+0x70); nbone = r.u16(o+0x72)
    vcount = r.u32(vb+0x18); vdata = r.ptr(vb+0x10); decl = read_decl(r, r.ptr(vb+0x30))
    idata = r.ptr(ib+0x10)
    boneids = [r.u16(boneids_p+2*i) for i in range(nbone)] if boneids_p else []
    return {'vb': vb, 'ib': ib, 'icount': icount, 'vcount': vcount, 'vdata': vdata, 'idata': idata, 'stride': stride, 'decl': decl, 'boneids': boneids}

def read_model(r, o):
    gp = r.ptr(o+8); n = r.u16(o+0x10); smp = r.ptr(o+0x20); skb = r.u32(o+0x28); mask = r.u16(o+0x2c)
    geoms = []
    for i in range(n):
        g = read_geometry(r, r.ptr(gp+8*i)); g['shader'] = r.u16(smp+2*i); geoms.append(g)
    return {'geoms': geoms, 'skel_binding': skb, 'mask': mask, 'hasskin': (skb>>8)&0xff, 'boneidx': (skb>>24)&0xff}

def read_drawable(r, o):
    d = {'shaders': read_shader_group(r, r.ptr(o+0x10)) if r.ptr(o+0x10) else [],
         'skeleton': read_skeleton(r, r.ptr(o+0x18)),
         'sphere': list(r.vec(o+0x20,4)), 'bbmin': list(r.vec(o+0x30,3)), 'bbmax': list(r.vec(o+0x40,3)),
         'lods': {}}
    for k, off in (('high',0x50),('med',0x58),('low',0x60),('vlow',0x68)):
        lp = r.ptr(o+off)
        if lp: d['lods'][k] = [read_model(r, m) for m in r.ptrlist(lp)]
    d['loddist'] = list(r.vec(o+0x70,4))
    d['name'] = r.cstr(r.ptr(o+0xa8)) if r.ptr(o+0xa8) else None
    return d

def read_frag(r):
    f = {'name': r.cstr(r.ptr(0x58)), 'drawable': read_drawable(r, r.ptr(0x30))}
    return f

def vertices(r, g):
    out = []
    for i in range(g['vcount']):
        base = g['vdata'] + i*g['stride']
        v = {}
        for sem, t, off in g['decl']['comps']:
            v[sem] = decode_component(r, base+off, t)
        out.append(v)
    return out

def indices(r, g):
    return list(struct.unpack_from('<%dH' % g['icount'], r.data, g['idata']))
