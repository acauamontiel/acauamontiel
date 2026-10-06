# Crazy Astra · GSi em Pelotas

Jogo WebGL low-poly com espírito de Gran Turismo de PS1: um **Chevrolet Astra GSi preto com aerofólio**
correndo de madrugada pelas avenidas de **Pelotas/RS**, desviando de carros e buracos e ganhando pontos ao
atropelar motos.

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
O Astra GSi tem aerofólio de teto com placas laterais e brake light, rodas texturizadas de cinco raios,
lanternas fumê, faróis e grade com gravata dourada.

## Estrutura

```
index.html        HUD e telas (DOM)
css/style.css
js/main.js        loop, estado do jogo, câmera
js/ps1.js         material/shader (luz noturna, emissivos, curva) e pós-processamento
js/textures.js    texturas procedurais
js/geometry.js    helpers low-poly
js/vehicles.js    Astra GSi, carros do tráfego, ônibus (Turf, Santa Maria, Santa Rosa), moto, buraco
js/city.js        avenidas, prédios, cruzamentos e pontos de referência
js/traffic.js     spawn, movimento e colisões
js/hud.js  js/input.js  js/audio.js
vendor/           three.module.min.js e BufferGeometryUtils.js (r170, MIT)
docker-compose.yml  nginx servindo a pasta em :8080
```
