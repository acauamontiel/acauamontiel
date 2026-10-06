# Pelotas Turismo · Astra GSi

Jogo WebGL com visual de PlayStation 1 (estilo Gran Turismo): um **Chevrolet Astra GSi preto com aerofólio**
correndo pelas avenidas de **Pelotas/RS**, desviando de carros e buracos e ganhando pontos ao atropelar motos.

Feito só com **JavaScript puro + [three.js](https://threejs.org/) r170** (embutido em `vendor/`). Sem TypeScript, sem React, sem build, sem CDN.

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
| `↓` ou `S` | frear |
| `Enter` / `Espaço` | começar / recomeçar |
| `M` | liga/desliga o som |
| `P` | liga/desliga o filtro PS1 (snapping, textura afim, dithering) |

No celular: toque na metade esquerda/direita da tela para desviar; dois dedos freiam.

Parâmetros de URL úteis (depuração):

| Parâmetro | Efeito |
|---|---|
| `?autostart` | pula a tela de título (sem áudio, pois não houve gesto) |
| `?nops1` | começa com o filtro PS1 desligado |
| `?tp=1800` | começa 1800 m adiante (1440 m por avenida: Duque → Bento → JK) |
| `?sim=20` | avança 20 s de jogo antes do primeiro quadro |
| `?bot` | piloto automático que persegue motos e desvia do resto |
| `?showcase` | estaciona um exemplar de cada veículo à frente |
| `?nohud` | esconde o HUD |
| `?dbg` | loga estado do tráfego e draw calls no console |
| `?env=0` | intensidade do reflexo da lataria |

## Regras

- **Carros e ônibus**: bater tira 30% de dano e derruba a velocidade.
- **Buracos**: 8% de dano e perda de velocidade.
- **Motos**: +100 pontos, multiplicados pela sequência (até x8). Bater em um carro zera a sequência.
- **Raspão**: passar colado em um carro sem bater vale +50.
- A distância também pontua. O jogo acaba quando o dano chega a 100%.

## As avenidas

O percurso alterna, a cada 1,44 km, três avenidas reais de Pelotas (a cidade em si é imaginada):

- **Av. Duque de Caxias** — liga o Centro ao Fragata; canteiro central arborizado desde 1914 (eucaliptos e
  grevíleas), comércio de bairro (supermercados, farmácias, materiais de construção, bancos).
- **Av. Bento Gonçalves** — Centro, fluxo intenso, bancos e comércio, palmeiras no canteiro,
  Parque Dom Antônio Zattera de um lado e o Estádio Boca do Lobo do outro.
- **Av. Pres. Juscelino Kubitschek** — região do Porto, Areal e São Gonçalo: canal, galpões, guindastes,
  silos, borracharias e posto de gasolina.

## Técnica PS1

Tudo está em `js/ps1.js`:

- render em ~320x240 com upscale nearest-neighbor;
- *vertex snapping* na grade de pixels do framebuffer baixo;
- mapeamento de textura **afim** (sem correção de perspectiva), com a pista subdividida para não "nadar" demais;
- iluminação Gouraud por vértice, texturas sem filtro e sem mipmap;
- quantização para 15 bits com dithering ordenado (Bayer 4x4) no pós-processamento;
- reflexo de céu *matcap* na lataria preta.

Texturas são geradas em canvas na hora (`js/textures.js`); a cidade é procedural em trechos de 40 m (`js/city.js`).

## Estrutura

```
index.html        HUD e telas (DOM)
css/style.css
js/main.js        loop, estado do jogo, câmera
js/ps1.js         material/shader PS1 e pós-processamento
js/textures.js    texturas procedurais
js/geometry.js    helpers low-poly
js/vehicles.js    Astra GSi, carros do tráfego, moto, buraco
js/city.js        avenidas, prédios, cruzamentos e pontos de referência
js/traffic.js     spawn, movimento e colisões
js/hud.js  js/input.js  js/audio.js
vendor/           three.module.min.js e BufferGeometryUtils.js (r170, MIT)
docker-compose.yml  nginx servindo a pasta em :8080
```
