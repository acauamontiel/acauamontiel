"""Decimação por quádricas (Garland-Heckbert) em Python puro. Trabalha com posições soldadas e
atributos por canto (wedge), como os formatos de jogo exigem."""
import heapq, math

def _add(a, b): return [x + y for x, y in zip(a, b)]
def _sub(a, b): return [x - y for x, y in zip(a, b)]
def _cross(a, b): return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
def _dot(a, b): return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
def _norm(a):
    l = math.sqrt(_dot(a, a)); return [x / l for x in a] if l > 1e-12 else None

def plane_quadric(p, n, w=1.0):
    d = -_dot(n, p); v = [n[0], n[1], n[2], d]
    return [v[i]*v[j]*w for i in range(4) for j in range(4)]

def qadd(a, b): return [x + y for x, y in zip(a, b)]
def qeval(q, p):
    v = [p[0], p[1], p[2], 1.0]
    return sum(q[i*4+j]*v[i]*v[j] for i in range(4) for j in range(4))

def decimate(pos, attrs, tris, target, boundary_w=4.0, weld_eps=1e-5):
    """pos: lista de posições por vértice original; attrs: lista paralela (qualquer objeto, por canto);
    tris: lista de triplas de índices originais. Retorna (pos2, attrs2, tris2)."""
    # solda por posição
    key = {}; wid = []
    for i, p in enumerate(pos):
        k = tuple(round(c / weld_eps) for c in p)
        if k not in key: key[k] = len(key)
        wid.append(key[k])
    nv = len(key)
    P = [None] * nv
    for i, p in enumerate(pos): P[wid[i]] = list(p)
    faces = []  # [a, b, c, wa, wb, wc, alive]
    for t in tris:
        a, b, c = (wid[t[0]], wid[t[1]], wid[t[2]])
        if a == b or b == c or a == c: continue
        faces.append([a, b, c, t[0], t[1], t[2], True])
    vf = [set() for _ in range(nv)]
    for fi, f in enumerate(faces):
        for v in f[:3]: vf[v].add(fi)
    Q = [[0.0]*16 for _ in range(nv)]
    edge_count = {}
    for fi, f in enumerate(faces):
        a, b, c = f[:3]
        n = _cross(_sub(P[b], P[a]), _sub(P[c], P[a]))
        area = math.sqrt(_dot(n, n)) * 0.5
        nn = _norm(n)
        if nn is None: continue
        q = plane_quadric(P[a], nn, area)
        for v in (a, b, c): Q[v] = qadd(Q[v], q)
        for e in ((a, b), (b, c), (c, a)):
            k = (min(e), max(e)); edge_count[k] = edge_count.get(k, 0) + 1
    # quádricas de borda: plano perpendicular à face passando pela aresta
    for (a, b), cnt in edge_count.items():
        if cnt != 1: continue
        fi = next(iter(vf[a] & vf[b]), None)
        if fi is None: continue
        f = faces[fi]
        fn = _norm(_cross(_sub(P[f[1]], P[f[0]]), _sub(P[f[2]], P[f[0]])))
        if fn is None: continue
        e = _sub(P[b], P[a]); l = math.sqrt(_dot(e, e))
        pn = _norm(_cross(e, fn))
        if pn is None: continue
        q = plane_quadric(P[a], pn, boundary_w * l * l)
        Q[a] = qadd(Q[a], q); Q[b] = qadd(Q[b], q)
    ver = [0] * nv
    heap = []
    def cost(a, b):
        q = qadd(Q[a], Q[b])
        best = None
        mid = [(x + y) * 0.5 for x, y in zip(P[a], P[b])]
        for p in (mid, P[a], P[b]):
            c = qeval(q, p)
            if best is None or c < best[0]: best = (c, p)
        return best
    def push(a, b):
        if a == b: return
        c, p = cost(a, b)
        heapq.heappush(heap, (c, a, b, ver[a], ver[b], tuple(p)))
    for (a, b) in edge_count: push(a, b)
    nfaces = len(faces)
    while nfaces > target and heap:
        c, a, b, va, vb, p = heapq.heappop(heap)
        if ver[a] != va or ver[b] != vb or not vf[a] or not vf[b]: continue
        # evita virar triângulos
        bad = False
        moved = vf[a] | vf[b]
        for fi in moved:
            f = faces[fi]
            if not f[6]: continue
            if a in f[:3] and b in f[:3]: continue  # será removido
            old = [P[v] for v in f[:3]]
            new = [list(p) if v in (a, b) else P[v] for v in f[:3]]
            n0 = _cross(_sub(old[1], old[0]), _sub(old[2], old[0]))
            n1 = _cross(_sub(new[1], new[0]), _sub(new[2], new[0]))
            if _dot(n0, n1) <= 0 or _dot(n1, n1) < 1e-16: bad = True; break
        if bad: continue
        # colapsa b em a
        P[a] = list(p); Q[a] = qadd(Q[a], Q[b])
        for fi in list(vf[b]):
            f = faces[fi]
            if a in f[:3]:
                f[6] = False; nfaces -= 1
                for v in f[:3]:
                    vf[v].discard(fi)
            else:
                for k in range(3):
                    if f[k] == b: f[k] = a
                vf[a].add(fi)
        vf[b] = set(); ver[a] += 1; ver[b] += 1
        neigh = set()
        for fi in vf[a]:
            for v in faces[fi][:3]:
                if v != a: neigh.add(v)
        for v in neigh: push(a, v)
    # saída: vértices únicos por (posição soldada, wedge)
    out_idx = {}; pos2 = []; attrs2 = []; tris2 = []
    for f in faces:
        if not f[6]: continue
        tri = []
        for k in range(3):
            key2 = (f[k], f[3+k])
            if key2 not in out_idx:
                out_idx[key2] = len(pos2); pos2.append(tuple(P[f[k]])); attrs2.append(attrs[f[3+k]])
            tri.append(out_idx[key2])
        tris2.append(tri)
    return pos2, attrs2, tris2
