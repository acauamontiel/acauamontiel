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
| `?phase=1` | começa na fase 2 (0 = Duque, 1 = Bento, 2 = JK) |
| `?tp=1800` | começa 1800 m adiante dentro da fase |
| `?sim=20` | avança 20 s de jogo antes do primeiro quadro |
| `?bot` | piloto automático que persegue motos e desvia do resto |
| `?showcase` | estaciona um exemplar de cada veículo à frente |
| `?nohud` | esconde o HUD |
| `?dbg` | loga estado do tráfego e draw calls no console |
| `?env=0` | intensidade do reflexo da lataria |
| `?angle=0.75` | ângulo inicial da câmera orbital da tela de título (3/4 traseira) |

## Regras

- **Carros e ônibus**: bater tira 30% de dano e derruba a velocidade.
- **Buracos**: 8% de dano e perda de velocidade.
- **Motos**: +100 pontos, multiplicados pela sequência (até x8). Bater em um carro zera a sequência.
- **Raspão**: passar colado em um carro sem bater vale +50.
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

## Técnica PS1

Tudo está em `js/ps1.js`:

- render interno com 512 px no lado maior (o modo "hi-res" do Gran Turismo), seja a janela larga ou alta, com upscale nearest-neighbor;
- *vertex snapping* na grade de pixels do framebuffer baixo;
- mapeamento de textura **afim** (sem correção de perspectiva), com a pista subdividida para não "nadar" demais;
- iluminação Gouraud por vértice, texturas sem filtro e sem mipmap;
- quantização para 15 bits com dithering ordenado (Bayer 4x4) no pós-processamento;
- reflexo de céu *matcap* na lataria preta (o vidro reflete menos, via atributo `envCut` por vértice);
- céu em gradiente no pós-processamento, ancorado na linha do horizonte calculada da inclinação da câmera;
- textura de carroceria "desenrolada" por carro (`makeBodyTexture`): colunas, vidros laterais, vãos de porta,
  maçanetas, caixas de roda e borrachas, multiplicando a cor da pintura.

Os carros são carrocerias "loftadas" por seções transversais (`carBody` em `js/geometry.js`), com vincos
na linha de cintura e base dos vidros e o resto suave (Gouraud), como os modelos de ~400 triângulos do GT.
O Astra GSi tem aerofólio de teto com placas laterais e brake light, rodas texturizadas de cinco raios,
lanternas fumê, faróis e grade com gravata dourada.

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
