import struct, zlib

def rgb565(c):
    r = (c >> 11) & 31; g = (c >> 5) & 63; b = c & 31
    return ((r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2))

def decode_dxt(data, off, w, h, fmt):
    """Returns list of bytearrays rows RGBA (w*4 bytes each)."""
    bw = (w + 3) // 4; bh = (h + 3) // 4
    bs = 8 if fmt == 'DXT1' else 16
    rows = [bytearray(w * 4) for _ in range(h)]
    for by in range(bh):
        for bx in range(bw):
            o = off + (by * bw + bx) * bs
            alphas = None
            if fmt == 'DXT5':
                a0 = data[o]; a1 = data[o+1]
                bits = int.from_bytes(data[o+2:o+8], 'little')
                if a0 > a1:
                    atab = [a0, a1] + [((7-i)*a0 + i*a1)//7 for i in range(1,7)]
                else:
                    atab = [a0, a1] + [((5-i)*a0 + i*a1)//5 for i in range(1,5)] + [0, 255]
                alphas = [atab[(bits >> (3*i)) & 7] for i in range(16)]
                o += 8
            elif fmt == 'DXT3':
                bits = int.from_bytes(data[o:o+8], 'little')
                alphas = [((bits >> (4*i)) & 15) * 17 for i in range(16)]
                o += 8
            c0, c1 = struct.unpack_from('<HH', data, o)
            r0 = rgb565(c0); r1 = rgb565(c1)
            if fmt != 'DXT1' or c0 > c1:
                ctab = [r0 + (255,), r1 + (255,), tuple((2*a+b)//3 for a, b in zip(r0, r1)) + (255,), tuple((a+2*b)//3 for a, b in zip(r0, r1)) + (255,)]
            else:
                ctab = [r0 + (255,), r1 + (255,), tuple((a+b)//2 for a, b in zip(r0, r1)) + (255,), (0, 0, 0, 0)]
            idx = int.from_bytes(data[o+4:o+8], 'little')
            for py in range(4):
                y = by*4 + py
                if y >= h: break
                row = rows[y]
                for px in range(4):
                    x = bx*4 + px
                    if x >= w: break
                    c = ctab[(idx >> (2*(py*4+px))) & 3]
                    p = x*4
                    row[p] = c[0]; row[p+1] = c[1]; row[p+2] = c[2]
                    row[p+3] = alphas[py*4+px] if alphas is not None else c[3]
    return rows

def decode_argb(data, off, w, h, stride):
    rows = []
    for y in range(h):
        src = data[off + y*stride: off + y*stride + w*4]
        row = bytearray(w*4)
        for x in range(w):
            b, g, r, a = src[4*x:4*x+4]
            row[4*x] = r; row[4*x+1] = g; row[4*x+2] = b; row[4*x+3] = a
        rows.append(row)
    return rows

def downscale(rows, w, h, factor):
    if factor <= 1: return rows, w, h
    nw = max(1, w // factor); nh = max(1, h // factor)
    out = []
    n = factor * factor
    for y in range(nh):
        row = bytearray(nw*4)
        for x in range(nw):
            r = g = b = a = 0
            for dy in range(factor):
                src = rows[y*factor+dy]
                for dx in range(factor):
                    p = (x*factor+dx)*4
                    r += src[p]; g += src[p+1]; b += src[p+2]; a += src[p+3]
            row[4*x] = r//n; row[4*x+1] = g//n; row[4*x+2] = b//n; row[4*x+3] = a//n
        out.append(row)
    return out, nw, nh

def png(rows, w, h):
    raw = b''.join(b'\0' + bytes(r) for r in rows)
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')

def tone_curve(rows, gamma):
    lut = bytes(int(round(255 * (i / 255.0) ** gamma)) for i in range(256))
    for row in rows:
        for p in range(0, len(row), 4):
            row[p] = lut[row[p]]; row[p+1] = lut[row[p+1]]; row[p+2] = lut[row[p+2]]
    return rows

def texture_png(r, t, maxsize=256, gamma=1.0):
    w, h = t['w'], t['h']; fmt = t['format']; off = t['data']
    if fmt in ('DXT1', 'DXT3', 'DXT5'):
        rows = decode_dxt(r.data, off, w, h, fmt)
    elif fmt == 21 or (isinstance(fmt, int) and (fmt & 0x0f00) in (0x0500, 0x0600) and t.get('depth', 32) == 32):
        rows = decode_argb(r.data, off, w, h, t['stride'])
    else:
        raise ValueError('unsupported format %r for %s' % (fmt, t['name']))
    f = 1
    while max(w, h) // f > maxsize: f *= 2
    rows, w, h = downscale(rows, w, h, f)
    if gamma != 1.0: rows = tone_curve(rows, gamma)
    return png(rows, w, h), w, h
