"""Leitor mínimo de RenderWare DFF/TXD (GTA San Andreas): frames, geometrias, materiais, atomics."""
import struct

RW_STRUCT = 0x01; RW_STRING = 0x02; RW_EXT = 0x03; RW_TEXTURE = 0x06; RW_MATERIAL = 0x07; RW_MATLIST = 0x08
RW_FRAMELIST = 0x0E; RW_GEOMETRY = 0x0F; RW_CLUMP = 0x10; RW_ATOMIC = 0x14; RW_TEXNATIVE = 0x15; RW_TEXDICT = 0x16
RW_GEOMLIST = 0x1A; RW_FRAMENAME = 0x253F2FE; RW_BINMESH = 0x50E

def sections(d, off, end):
    while off + 12 <= end:
        t, size, ver = struct.unpack_from('<III', d, off)
        yield t, off + 12, size, ver
        off += 12 + size

def child(d, off, end, t):
    for t2, o, s, v in sections(d, off, end):
        if t2 == t: return o, s
    return None, None

def read_dff(d):
    co, cs = child(d, 0, len(d), RW_CLUMP)
    end = co + cs
    frames = []; geoms = []; atomics = []
    fo, fs = child(d, co, end, RW_FRAMELIST)
    so, ss = child(d, fo, fo + fs, RW_STRUCT)
    n = struct.unpack_from('<I', d, so)[0]
    p = so + 4
    for i in range(n):
        m = struct.unpack_from('<9f', d, p); pos = struct.unpack_from('<3f', d, p + 36); parent = struct.unpack_from('<i', d, p + 48)[0]
        frames.append({'rot': m, 'pos': pos, 'parent': parent, 'name': ''}); p += 56
    # nomes nas extensões, uma por frame, na ordem
    i = 0
    for t, o, s, v in sections(d, so + ss, fo + fs):
        if t == RW_EXT:
            name = ''
            for t2, o2, s2, v2 in sections(d, o, o + s):
                if t2 == RW_FRAMENAME: name = d[o2:o2 + s2].decode('latin1')
            if i < n: frames[i]['name'] = name
            i += 1
    go, gs = child(d, co, end, RW_GEOMLIST)
    so, ss = child(d, go, go + gs, RW_STRUCT)
    ng = struct.unpack_from('<I', d, so)[0]
    for t, o, s, v in sections(d, so + ss, go + gs):
        if t != RW_GEOMETRY: continue
        geoms.append(read_geometry(d, o, o + s, v))
    for t, o, s, v in sections(d, co, end):
        if t != RW_ATOMIC: continue
        so, ss = child(d, o, o + s, RW_STRUCT)
        fi, gi, flags = struct.unpack_from('<III', d, so)
        atomics.append({'frame': fi, 'geom': gi, 'flags': flags})
    return {'frames': frames, 'geoms': geoms, 'atomics': atomics}

def read_geometry(d, o, end, ver):
    so, ss = child(d, o, end, RW_STRUCT)
    flags, nuv, native, ntri, nvert, nmorph = struct.unpack_from('<HBBIII', d, so)
    p = so + 16
    if ver < 0x34000: p += 12
    g = {'flags': flags, 'ntri': ntri, 'nvert': nvert, 'colors': None, 'uvs': [], 'tris': [], 'verts': [], 'normals': None, 'materials': []}
    if flags & 0x08:
        g['colors'] = [struct.unpack_from('<4B', d, p + 4 * i) for i in range(nvert)]; p += 4 * nvert
    nuv = nuv or ((flags & 0x04 and 1) or 0) or (2 if flags & 0x80 else 0)
    for k in range(nuv):
        g['uvs'].append([struct.unpack_from('<2f', d, p + 8 * i) for i in range(nvert)]); p += 8 * nvert
    for i in range(ntri):
        b, a, mat, c = struct.unpack_from('<4H', d, p + 8 * i)
        g['tris'].append((a, b, c, mat))
    p += 8 * ntri
    p += 16  # esfera
    hasv, hasn = struct.unpack_from('<II', d, p); p += 8
    if hasv: g['verts'] = [struct.unpack_from('<3f', d, p + 12 * i) for i in range(nvert)]; p += 12 * nvert
    if hasn: g['normals'] = [struct.unpack_from('<3f', d, p + 12 * i) for i in range(nvert)]; p += 12 * nvert
    # Bin Mesh PLG na extensão: divisão real por material (as triplas acima costumam vir com material 0)
    eo, es = child(d, so + ss, end, RW_EXT)
    if eo:
        bo, bs = child(d, eo, eo + es, RW_BINMESH)
        if bo:
            bflags, nsplit, ntot = struct.unpack_from('<III', d, bo); p2 = bo + 12; tris = []
            for si in range(nsplit):
                ni, mat = struct.unpack_from('<II', d, p2); p2 += 8
                idx = struct.unpack_from('<%dI' % ni, d, p2); p2 += 4 * ni
                if bflags == 1:  # strip
                    for k in range(ni - 2):
                        a, b, c = idx[k], idx[k+1], idx[k+2]
                        if a == b or b == c or a == c: continue
                        tris.append((a, c, b, mat) if k % 2 else (a, b, c, mat))
                else:
                    for k in range(0, ni - ni % 3, 3): tris.append((idx[k], idx[k+1], idx[k+2], mat))
            g['tris'] = tris; g['strip'] = bflags == 1
    mo, ms = child(d, so + ss, end, RW_MATLIST)
    if mo:
        for t, o2, s2, v in sections(d, mo, mo + ms):
            if t != RW_MATERIAL: continue
            so2, ss2 = child(d, o2, o2 + s2, RW_STRUCT)
            _, r, gg, b, a, _, textured = struct.unpack_from('<I4BII', d, so2)
            m = {'color': (r, gg, b, a), 'tex': None}
            to, ts = child(d, so2 + ss2, o2 + s2, RW_TEXTURE)
            if to:
                names = [d[o3:o3 + s3].split(b'\0')[0].decode('latin1') for t3, o3, s3, v3 in sections(d, to, to + ts) if t3 == RW_STRING]
                m['tex'] = names[0] if names else None
            g['materials'].append(m)
    return g

def frame_world(frames, i):
    """Matriz 3x4 (rot 3x3 + pos) do frame i no espaço do clump."""
    f = frames[i]
    R = [list(f['rot'][0:3]), list(f['rot'][3:6]), list(f['rot'][6:9])]  # linhas = eixos locais (RenderWare: row-major, vetores-linha)
    t = list(f['pos'])
    if f['parent'] < 0: return R, t
    PR, Pt = frame_world(frames, f['parent'])
    # v_world = v_local * R * PR + t * PR + Pt   (vetores-linha)
    def mul(a, b): return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
    def vmul(v, m): return [sum(v[k] * m[k][j] for k in range(3)) for j in range(3)]
    return mul(R, PR), [x + y for x, y in zip(vmul(t, PR), Pt)]

def transform(v, R, t):
    return tuple(sum(v[k] * R[k][j] for k in range(3)) + t[j] for j in range(3))

def read_txd(d):
    out = {}
    for t, o, s, v in sections(d, 0, len(d)):
        if t != RW_TEXDICT: continue
        for t2, o2, s2, v2 in sections(d, o, o + s):
            if t2 != RW_TEXNATIVE: continue
            so, ss = child(d, o2, o2 + s2, RW_STRUCT)
            name = d[so + 8:so + 40].split(b'\0')[0].decode('latin1')
            rfmt = struct.unpack_from('<I', d, so + 72)[0]; fourcc = d[so + 76:so + 80]
            w, h, depth, mips, rtype, comp = struct.unpack_from('<HHBBBB', d, so + 80)
            dsize = struct.unpack_from('<I', d, so + 88)[0]
            out[name.lower()] = {'name': name, 'w': w, 'h': h, 'format': fourcc.decode('latin1') if fourcc[:3] == b'DXT' else rfmt, 'data': so + 92, 'depth': depth, 'stride': w * depth // 8}
    return out
