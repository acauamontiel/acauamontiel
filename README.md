# Crazy Astra · GSi em Pelotas

Jogo WebGL low-poly com espírito de Gran Turismo de PS1: um **Chevrolet Astra GSi preto com aerofólio**
correndo de madrugada pelas avenidas de **Pelotas/RS**, desviando de carros e buracos e ganhando pontos ao
atropelar motos.

Feito só com **JavaScript puro + [three.js](https://threejs.org/) r170** (embutido em `vendor/`). Sem TypeScript, sem React, sem build, sem CDN.
O Astra e os ônibus são modelos 3D de verdade (`assets/*.glb`), convertidos de mods de GTA com os scripts em `tools/rage2glb/`.

## Como rodar

```bash
docker compose up -d
```

Abra <http://localhost:8080>.

Qualquer servidor estático também serve (os módulos ES não carregam via `file://`).

## Controles

| Tecla | Ação |
|---|---|
| `←` `→` ou `A` `D` | desviar |
| `↑` ou `W` | acelerar (acima da velocidade de cruzeiro) |
| `Espaço` (ou `↓` / `S`) | frear |
| `↑` + `Espaço` ou `Shift` | drift: a traseira solta e o carro desliza para o lado em que você aponta |
| `Enter` | começar / recomeçar |
| `M` | liga/desliga o som |

No celular aparecem botões na tela: ◀ ▶ para desviar, FREIO, DRIFT e ACELERADOR.

Parâmetros de URL úteis (depuração):

| Parâmetro | Efeito |
|---|---|
| `?autostart` | pula a tela de título (sem áudio, pois não houve gesto) |
| `?day` | cena diurna, para comparar |
| `?phase=1` | começa na fase 2 (0 = Duque, 1 = Bento, 2 = JK) |
| `?tp=1800` | começa 1800 m adiante dentro da fase |
| `?sim=20` | avança 20 s de jogo antes do primeiro quadro |
| `?bot` | piloto automático que persegue motos e desvia do resto |
| `?showcase` | estaciona um exemplar de cada veículo à frente |
| `?nohud` | esconde o HUD |
| `?lowpoly` | usa o Astra e os ônibus procedurais em vez dos modelos GLB |
| `?touch` | força os botões de toque (para testar no desktop) |
| `?dbg` | loga estado do tráfego e draw calls no console |
| `?env=0` | intensidade do reflexo da lataria |
| `?angle=0.75` | ângulo inicial da câmera orbital da tela de título (3/4 traseira) |
| `?bus=turf` | estaciona um ônibus (turf, santasilvana, santarosa) ao lado do carro na tela de título |

## Regras

- **Carros e ônibus**: bater tira 30% de dano e derruba a velocidade.
- **Buracos**: 8% de dano e perda de velocidade.
- **Motos**: +100 pontos, multiplicados pela sequência (até x8). Bater em um carro zera a sequência.
- **Raspão**: passar colado em um carro sem bater vale +50.
- **Drift**: derrapar rende pontos enquanto durar e mantém a velocidade.
- A distância também pontua. O jogo acaba quando a lataria chega a zero.
- São **três fases de 2 km**, em sequência: Duque de Caxias → Bento Gonçalves → JK. Ao cruzar o pórtico
  de chegada a lataria restante vira bônus e a próxima fase começa com 25% de lataria recuperada.

## As avenidas

Cada fase é uma avenida real de Pelotas (a cidade em si é imaginada), com o ponto de partida num lugar real:

- **Fase 1 · Av. Duque de Caxias** — largada na sede da Brigada Militar do Fragata; canteiro central de
  lajotas vermelhas com eucaliptos, comércio de bairro (supermercados, farmácias, materiais de construção).
- **Fase 2 · Av. Bento Gonçalves** — largada no auditório do Colégio Pelotense; canteiro largo com árvores
  grandes, carros estacionados, muros pichados com prédios recuados, Parque Dom Antônio Zattera e
  Estádio Boca do Lobo.
- **Fase 3 · Av. Pres. Juscelino Kubitschek** — largada no supermercado BIG; meio-fio pintado de branco,
  terrenos de areia, palmeiras, canal, guindastes do porto, silos e posto de gasolina.

## Técnica

Tudo em `js/ps1.js`:

- render interno com 640 px no lado maior, seja a janela larga ou alta, com upscale nearest-neighbor;
- iluminação por fragmento: luar fraco, **postes de sódio** a cada 20 m no canteiro (poças quentes na pista) e o
  **farol do Astra** abrindo à frente; nada disso usa luzes do three.js, é tudo calculado no shader;
- emissivos: lanternas, faróis, luminárias e semáforos brilham via atributo por vértice; janelas acesas,
  vitrines, letreiros e o interior dos ônibus via máscara no alpha das texturas;
- texturas geradas em canvas, sem filtro (texels visíveis) e com mipmaps;
- reflexo de céu *matcap* na lataria preta (o vidro reflete menos, via atributo `envCut` por vértice);
- céu noturno em gradiente com estrelas, ancorado na linha do horizonte da câmera; neblina escura;
- textura de carroceria "desenrolada" por carro (`makeBodyTexture`): colunas, vidros laterais, vãos de porta,
  maçanetas, caixas de roda e borrachas, multiplicando a cor da pintura;
- curvas "dobradas" no vertex shader, como nos jogos de corrida da época: a lógica do jogo é reta, mas a
  pista aparece curvando (a JK tem a curva característica logo depois do BIG);
- decalques (linhas, faixas, calçadas, sombras, buracos) com polygon offset para não piscarem à distância.

Os carros são carrocerias "loftadas" por seções transversais (`carBody` em `js/geometry.js`), com vincos
na linha de cintura e base dos vidros e o resto suave (Gouraud), como os modelos de ~400 triângulos do GT.
O Astra GSi usa o modelo 3D de `assets/astra.glb` (ver abaixo); `?lowpoly` volta ao Astra procedural, que também
entra sozinho se o GLB não carregar.

## O modelo do Astra

`assets/astra.glb` foi gerado a partir de um mod de GTA V (`buffalo.yft` + `buffalo.ytd`, formato RAGE) com o
conversor em `tools/rage2glb/`, escrito em Python puro (sem dependências):

```bash
python3 tools/rage2glb/export_glb.py buffalo.yft buffalo.ytd assets/astra.glb --texsize 128 --skip 9,14,15,42,46,48,84,86 --curve farol:2.2,lanterna:1.8,vehiclelights128:2.0,farolvidro:2.0
```

O que o conversor faz:

- descomprime o recurso RSC7 e lê o fragmento: drawable, esqueleto, shaders, buffers de vértices e índices
  (posição, normal, UV, índices de osso), e o dicionário de texturas (DXT1/DXT5/ARGB → PNG);
- mantém só o exterior: descarta as peças ligadas a ossos de interior/motor/som e os shaders de interior
  (`--skip-bones`, `--skip-shaders`, `--skip`), e deixa de fora os decalques da tampa ("SUPER SPORT", "ASTRA", "2.0", "GSi 16V"; `--drop-uv` tira só uma região de UV se for preciso); `--curve` escurece faróis e lanternas (máscara negra) mantendo as lâmpadas claras; o resultado tem ~31 mil triângulos em vez dos 310 mil originais;
- converte os eixos (GTA: y para frente, z para cima → jogo: -z para frente, y para cima) e coloca as rodas no chão;
- decima as rodas (30 mil → 1,4 mil triângulos cada) por colapso de arestas com quádricas (`decimate.py`) e
  instancia as quatro nos ossos `wheel_lf/rf/lr/rr`, espelhando as da direita;
- reduz as texturas para 128 px (256 px para faróis e lanternas) e grava um GLB com materiais nomeados
  `shader|textura`, que `js/astra_model.js` troca pelos materiais do jogo (pintura preta com reflexo,
  vidro fumê, faróis e lanternas acesos, gravatas pretas, placa MGY 8888 gerada em canvas).

### O modelo do ônibus

`assets/bus.glb` vem de um mod de GTA San Andreas (`bus.dff` + `bus.txd`, RenderWare), convertido por
`tools/rage2glb/export_dff.py`:

```bash
python3 tools/rage2glb/export_dff.py bus.dff bus.txd assets/bus.glb \
  --skip-frames "_dam,Box_,IL,ped_,das1,SL,dx-lights" \
  --skip-tex d4exn1main,dxn1-route,d4exn1wall,dxn1-seat1,d4exn1dash,d4exn1floor,d4exn1heater,d4exn1int2,d4exn1tcktprntr,4317,dxn1-seat2,d4exn1ceilling,d4exn1signs,dexsl360logos,dx4-lights \
  --livery-tex dxn1-body1,dxn1-body2,dxn1-body3,dxn1-body4,dxn1-body5,dxn1-body6,dxn1-body7,dxn1-body8,dxn1-body9 --livery-colors "221,221,221"
```

- lê frames (hierarquia), geometrias, Bin Mesh (divisão por material) e o TXD (DXT1 → PNG);
- descarta o interior (bancos, corrimãos, painel): à noite as janelas ficam acesas e opacas, então ele não faria falta;
  o resultado tem ~9 mil triângulos, com as quatro rodas decimadas;
- os painéis de carroceria do mod recebem um **UV projetado** (lateral, frente, traseira, teto e assoalho) no layout
  de `makeBusSkin()` em `js/textures.js`, que pinta em canvas as três empresas (Turf, Santa Silvana, Santa Rosa):
  cor base, saia, teto, nome, número e serpentinas. Assim a pintura do mod não é usada e trocar de empresa é
  trocar uma textura de 256x128;
- `js/bus_model.js` carrega o GLB e instancia os ônibus do tráfego (`makeVehicle` usa o modelo quando ele está
  carregado; o ônibus loftado continua como reserva e com `?lowpoly`).

`tools/viewer.html?game=bus&kind=santarosa&views=side,isoFL,rear&dist=2.6` mostra cada pintura como no jogo.

`tools/viewer.html?views=isoFL,rear,side&list` mostra o GLB com vários ângulos e a lista de peças
(`?only=g39` ou `?hide=wheel` isolam peças; `?game` carrega com os materiais do jogo, placa MGY 8888 incluída). Os modelos originais do mod não ficam no repositório; só o GLB derivado.

## Estrutura

```
index.html        HUD e telas (DOM)
css/style.css
js/main.js        loop, estado do jogo, câmera
js/ps1.js         material/shader (luz noturna, emissivos, curva) e pós-processamento
js/textures.js    texturas procedurais
js/geometry.js    helpers low-poly
js/vehicles.js    Astra procedural (reserva), carros do tráfego, ônibus (Turf, Santa Silvana, Santa Rosa), moto, buraco
js/astra_model.js carrega assets/astra.glb e aplica os materiais do jogo
js/city.js        avenidas, prédios, cruzamentos e pontos de referência
js/traffic.js     spawn, movimento e colisões
js/hud.js  js/input.js  js/audio.js
assets/astra.glb  modelo do Astra (gerado por tools/rage2glb)
assets/bus.glb    modelo do ônibus urbano (idem)
js/bus_model.js   carrega assets/bus.glb e aplica as pinturas das empresas
tools/rage2glb/   conversores .yft/.ytd (GTA V) e .dff/.txd (GTA SA) → GLB (Python puro)
tools/viewer.html visualizador do GLB
vendor/           three.module.min.js, BufferGeometryUtils.js e GLTFLoader.js (r170, MIT)
docker-compose.yml  nginx servindo a pasta em :8080
```
