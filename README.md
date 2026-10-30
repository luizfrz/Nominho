<div align="center">

# Nominho
<img width="300" height="300" alt="4 Sem Título_20261030102922" src="https://github.com/user-attachments/assets/5434d2f3-a3d2-487a-9f8a-57840a60475c" />



**Busca de domínios com verificação de disponibilidade via RDAP, ranqueamento determinístico e recomendação de registrador.**

<p>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-19-149ECA?style=for-the-badge&logo=react&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-7-3178C6?style=for-the-badge&logo=typescript&logoColor=white">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-20.9+-5FA04E?style=for-the-badge&logo=nodedotjs&logoColor=white">
  <img alt="CSS3" src="https://img.shields.io/badge/CSS3-custom%20properties-1572B6?style=for-the-badge&logo=css3&logoColor=white">
  <img alt="RDAP" src="https://img.shields.io/badge/RDAP-RFC%209083-1b3dff?style=for-the-badge">
  <img alt="Stateless" src="https://img.shields.io/badge/Backend-stateless-lightgrey?style=for-the-badge">
  <img alt="3 dependências de runtime" src="https://img.shields.io/badge/Depend%C3%AAncias%20de%20runtime-3-2ea44f?style=for-the-badge">
</p>

</div>

---

## 📑 Sumário

1. [Visão geral](#1-visão-geral)
2. [Arquitetura](#2-arquitetura)
3. [Ciclo de vida de uma busca](#3-ciclo-de-vida-de-uma-busca)
4. [Algoritmos](#4-algoritmos)
5. [Contrato da API](#5-contrato-da-api)
6. [Cliente: estado e persistência](#6-cliente-estado-e-persistência)
7. [Camada visual](#7-camada-visual)
8. [Estrutura do repositório](#8-estrutura-do-repositório)
9. [Desenvolvimento](#9-desenvolvimento)

## 1. Visão geral

Aplicação Next.js (App Router) **sem banco de dados e sem variáveis de ambiente**. Um único Route Handler (`GET /api/search`) gera candidatos de domínio a partir de um termo, consulta o servidor RDAP autoritativo de cada um (**10 por vez**, com retry e cache), pontua os resultados com uma função pura e devolve JSON ou, em *streaming*, um resultado por linha (NDJSON). A UI é um único Client Component que renderiza o resultado e guarda preferências no `localStorage`.

| Item | Valor |
|---|---|
| Runtime | Node.js ≥ 20.9 (requisito do Next 16) |
| Dependências de runtime | `next`, `react`, `react-dom` |
| Fonte de verdade da disponibilidade | RDAP (RFC 7480 e RFC 9083) |
| Estado no servidor | só memória do processo: cache RDAP, bootstrap da IANA, cotação e contador de *rate limit*. Sem banco |
| Estado no cliente | `localStorage`: `theme`, `mode`, `currency` |
| Testes automatizados | `node:test` sobre as funções puras (`npm test`) |

## 2. Arquitetura

```
┌───────────────────────────── Browser ─────────────────────────────┐
│  app/page.tsx  ("use client")                                     │
│   ├─ estado: q, data, progress, cur/chosen, theme, mode, sort     │
│   ├─ lê o stream NDJSON e acumula os resultados                   │
│   └─ deriva: lista, recommended, bestPrice()                      │
└───────────────────────────────┬───────────────────────────────────┘
                                │ GET /api/search?q=…&stream=1
┌───────────────────────────────▼───────────────────────────────────┐
│  app/api/search/route.ts                                          │
│   slug → rateLimit(ip) → candidates → getUsdBrl()                 │
│   pool(10) ─► checkDomain() ─► NDJSON (meta, result…, done)       │
└───────────────────────────────┬───────────────────────────────────┘
                                ▼
 checkDomain(domain)   (lib/rdap.ts)
   1. cache em memória?            available 2 min · taken 30 min · unknown nunca
   2. bootstrap IANA (cache 24 h)  data.iana.org/rdap/dns.json → servidor da extensão
   3. GET {servidor}/domain/{d}    404 available · 200 taken · 429/5xx/timeout → retry
   4. sem RDAP ou "unknown"        DNS NS: tem servidores de nome → taken; senão unknown
```

Decisões de projeto:

- **Lógica pura separada de I/O.** `lib/domains.ts` (slug, pontuação, candidatos, melhor preço, formatação) e `lib/pool.ts` não fazem rede, então são testadas direto. Rede e DNS ficam em `lib/rdap.ts` e `lib/fx.ts`.
- **Só o servidor autoritativo diz "livre".** O `rdap.org` foi removido: ele responde `404` também quando não conhece o servidor da extensão, o que gerava falsos "livre". Agora o servidor vem do bootstrap oficial da IANA.
- **Preço e nota no servidor; moeda e ordenação no cliente.** O servidor devolve USD e a taxa do dia; trocar de moeda não exige nova requisição.
- **Cliente sem biblioteca de UI nem de estado.** CSS puro com custom properties.

## 3. Ciclo de vida de uma busca

```
 "Padaria do João"
        │ slug(): NFD → remove diacríticos → lowercase → [^a-z0-9]+ → "" → slice(0,40)
        ▼
 "padariadojoao"                      (< 2 caracteres → HTTP 422)
        │ rateLimit(ip)               (> 10 buscas/min → HTTP 429 + Retry-After)
        ▼
 candidates()   82 candidatos → ordena por score() → slice(0, 60)
        │ pool(candidatos, 10, checkDomain)       no máximo 10 consultas simultâneas
        ▼
 { type: "meta", query, total, rate }             NDJSON, um objeto por linha
 { type: "result", result }  × 60                 na ordem em que cada consulta termina
 { type: "done" }
        │ cliente: recommended = melhor nota entre os "available" (só ao terminar)
```

**Geração de candidatos.** São 15 *bases*: o termo, 6 prefixos (`get`, `my`, `try`, `use`, `go`, `the`) e 8 sufixos (`app`, `hub`, `lab`, `hq`, `now`, `online`, `br`, `pro`). A base exata é combinada com as **12 extensões**, e as demais só com as **5 principais** (`com`, `com.br`, `io`, `app`, `dev`): 12 + 14 × 5 = **82 candidatos**. Eles são ordenados por nota e cortados em `MAX_CHECKS = 60`.

## 4. Algoritmos

### 4.1 Pontuação (`score`)

Função pura e determinística, saturada em [0, 100]:

```
score = w(tld)                              peso da extensão
      + max(0, 30 − 2·max(0, len(base) − 5))   bônus de tamanho (30 pts até 5 letras)
      + (base == kw ? 20 : 8)               bônus de nome exato vs. variação
      − (base contém dígito ? 8 : 0)
```

| TLD | peso `w` | preço (USD/ano) | TLD | peso `w` | preço (USD/ano) |
|---|---:|---:|---|---:|---:|
| `com` | 40 | 12 | `org` | 25 | 11 |
| `com.br` | 36 | 8 | `co` | 24 | 28 |
| `io` | 30 | 40 | `ai` | 24 | 75 |
| `dev` | 28 | 13 | `xyz` | 10 | 3 |
| `app` | 27 | 14 | `site` | 8 | 3 |
| `net` | 26 | 14 | `online` | 8 | 4 |

Exemplo: `padariadojoao.com` → 40 + (30 − 2·8 = 14) + 20 = **74**; `padariadojoao.com.br` → 36 + 14 + 20 = **70**.

Os preços são **constantes de estimativa** em `TLDS`, não cotações de mercado.

### 4.2 Disponibilidade (`checkDomain`)

O servidor RDAP vem do **bootstrap da IANA** (RFC 9224), indexado pelo último rótulo do domínio (`com.br` → `br`). O arquivo é baixado uma vez e fica em cache por 24 h; se o download falhar, usa-se o último válido ou, na falta dele, um mapa mínimo (`com`, `net`, `br`).

| Resposta do servidor | Status |
|---|---|
| HTTP `404` | `available` |
| HTTP `200` | `taken` |
| `429`, `5xx`, timeout ou erro de rede | repete até 2 vezes e, se persistir, `unknown` |
| Outros códigos (`400`, `403`…) | `unknown` |

- **Timeout** de 4 s por tentativa. **Backoff** exponencial com *jitter* (300 ms, 600 ms…), respeitando `Retry-After` (limitado a 3 s).
- **Sem RDAP.** Extensões ausentes do bootstrap (no momento do teste, `.io` e `.co`) nunca viram `available`. O código consulta o DNS: se existem registros **NS**, o domínio é `taken`; senão fica `unknown`.
- O mesmo DNS é usado como apoio quando o RDAP devolve `unknown`.
- **Cache** em memória: `available` por 2 min, `taken` por 30 min, `unknown` nunca. Limite de 5000 entradas, removendo as mais antigas.

`unknown` **nunca** é recomendado.

### 4.3 Recomendação e melhor preço

- **`recommended`**: com a lista já ordenada por nota, é o primeiro item `available`.
- **`bestPrice(results)`**: filtra `available`; restringe a nota ≥ 50 (se o conjunto ficar vazio, usa todos os livres); ordena por `price` crescente e, em empate, por `score` decrescente; devolve o primeiro. Roda no cliente sobre os resultados completos, antes de qualquer filtro de UI.

### 4.4 Moeda

Preços trafegam em USD. O servidor busca a cotação em `lib/fx.ts` (AwesomeAPI e, como alternativa, `open.er-api.com`), com *timeout* de 3 s, faixa de sanidade 2 < taxa < 12 e cache de 1 h. Se as duas falharem, usa a última cotação boa ou a constante `USD_BRL = 5.5`, e tenta de novo em 5 min. O cliente formata com `Intl.NumberFormat` (`pt-BR`/BRL ou `en-US`/USD, sem casas decimais). Precedência da moeda ativa:

```
cur = chosen ?? suggested
suggested = (q.length ≥ 2 ? isPortuguese(q) || navigator.language ∈ pt* : navigator.language ∈ pt*) ? "BRL" : "USD"
```

`isPortuguese` é heurística em três níveis: (1) caracteres `áàâãéêíóôõúç`; (2) interseção das palavras (sem acento) com o conjunto `PT_WORDS`; (3) palavras de ≥ 5 letras terminadas em `-cao|-coes|-inho|-inha|-aria|-eiro|-eira|-dade|-mente`. É um classificador de sugestão, não de idioma.

## 5. Contrato da API

```
GET /api/search?q=<texto>[&stream=1]
```

### Resposta JSON (padrão)

```jsonc
{
  "query": "padariadojoao",            // termo normalizado
  "rate": 5.39,                         // USD→BRL usado nesta resposta
  "recommended": {                      // null se não houver domínio livre
    "domain": "padariadojoao.com",
    "status": "available",
    "score": 74,
    "price": 12,                        // USD/ano
    "exact": true                       // base === termo
  },
  "results": [ /* até 60 itens, ordenados por score desc */ ]
}
```

### Streaming (`stream=1`, `application/x-ndjson`)

```
{"type":"meta","query":"padariadojoao","total":60,"rate":5.39}
{"type":"result","result":{"domain":"padariadojoao.com.br","status":"available","score":70,"price":8,"exact":true}}
… (um por candidato, na ordem de conclusão)
{"type":"done"}
```

Se o cliente desconecta, as consultas que ainda não começaram são descartadas.

### Erros

| HTTP | Quando | Corpo |
|---|---|---|
| `422` | termo normalizado com menos de 2 caracteres | `{ "error": "Digite ao menos 2 letras ou números." }` |
| `429` | mais de 10 buscas por minuto do mesmo IP | `{ "error": "Muitas buscas seguidas. Tente de novo em Ns." }` + `Retry-After` |

O IP vem de `x-forwarded-for` (primeiro valor) ou `x-real-ip`.

```ts
type Status = "available" | "taken" | "unknown";
interface Result { domain: string; status: Status; score: number; price: number; exact: boolean }
```

## 6. Cliente: estado e persistência

| Chave `localStorage` | Valores | Efeito |
|---|---|---|
| `theme` | `azul` `verde` `roxo` `laranja` `rosa` `preto` | grava `data-theme` em `<html>` |
| `mode` | `auto` `light` `dark` | controla `data-dark` em `<html>` |
| `currency` | `BRL` `USD` | sobrepõe a sugestão automática |

Todo acesso a `localStorage` está dentro de `try/catch` (modo privado, cookies bloqueados).

**Anti-flash.** Um `<script>` inline no `<head>` (`app/layout.tsx`) aplica `theme` e `data-dark="1"` (quando `mode === "dark"`) **antes da hidratação**; por isso `<html>` usa `suppressHydrationWarning`. O efeito que sincroniza `data-dark` só roda depois de `modeReady`, para não sobrescrever o valor inicial com `"0"`.

**Máquina de estados do modo escuro.**

```
dark = mode === "dark" || (mode === "auto" && window.scrollY > 280)
ciclo do botão: auto → dark → light → auto
```

O listener de `scroll` é `passive` e só chama `setScrolled`, que re-renderiza apenas quando o booleano muda.

## 7. Camada visual

- **Tokens.** `:root` define `--blue`, `--blue-d`, `--lime`, `--ink`, `--paper`, `--paper-2`, `--muted`. Os temas são sobrescritas em `[data-theme="…"]`, e o escuro em `[data-dark="1"]`, que remapeia `--ink`/`--paper`.
- **Contraste no escuro.** Áreas com fundo azul ou amarelo fixam texto e bordas com valores literais (`#f4f1e8`, `#0b0f2a`). O azul usado como cor de texto vem de `--blue-t: color-mix(in srgb, var(--blue) 50%, #fff)`, calculado por tema.
- **Onda de letras.** No `mousemove` do `<h1>`, para cada `.ltr` calcula-se `p = max(0, 1 − dist/150)` entre o cursor e o centro do `getBoundingClientRect()` e aplica-se `translateY(−24p px) scale(1 + 0.4p) rotate(−dx/14·p deg)`. É O(n) por evento, com n ≈ 20 letras. Desligada com `prefers-reduced-motion: reduce` (e por CSS, que zera animações e transições).
- **Responsivo.** Um *breakpoint* em `max-width: 760px` reorganiza o ticket, a tabela de resultados, o card de melhor preço e o ranking em coluna única.

## 8. Estrutura do repositório

```
app/
  api/search/route.ts   Route Handler: valida, limita, orquestra e faz streaming
  layout.tsx            <html>, metadados, script anti-flash
  page.tsx              Client Component: UI, estado, leitura do stream, preferências
  globals.css           tokens, componentes, temas, modo escuro
lib/
  domains.ts            (puro) TLDS, slug, score, candidates, isPortuguese,
                        formatPrice, bestPrice, USD_BRL
  rdap.ts               bootstrap IANA, consulta RDAP com retry, DNS, cache
  pool.ts               (puro) execução com limite de concorrência
  ratelimit.ts          janela fixa por IP
  fx.ts                 cotação USD→BRL ao vivo com reserva
  registrars.ts         REGISTRARS: dados do ranking (ordem = posição)
tests/
  domains.test.ts       node:test: slug, score, candidates, bestPrice, isPortuguese,
                        formatPrice, pickService, pool
```

### Pontos de extensão

| Tarefa | Local |
|---|---|
| Nova extensão (peso e preço) | `TLDS` em `lib/domains.ts` (o servidor RDAP vem do bootstrap da IANA) |
| Prefixos/sufixos | `PREFIXES`, `SUFFIXES` |
| Limite de consultas por busca / simultâneas | `MAX_CHECKS` (`lib/domains.ts`) / `CONCURRENCY` (`route.ts`) |
| Limite de buscas por IP | `MAX_PER_WINDOW`, `WINDOW_MS` em `lib/ratelimit.ts` |
| TTLs, timeout e retries do RDAP | `TTL`, `TIMEOUT_MS`, `RETRIES` em `lib/rdap.ts` |
| Corte de qualidade do melhor preço | `bestPrice()` (hoje `score >= 50`) |
| Cotação de reserva / fontes de câmbio | `USD_BRL` em `lib/domains.ts` / `lib/fx.ts` |
| Registrador no ranking | novo objeto em `lib/registrars.ts` |
| Novo tema | bloco `[data-theme="x"]` em `globals.css` + item em `THEMES` (`page.tsx`) |

## 9. Desenvolvimento

```bash
npm install
npm run dev        # http://localhost:3000 (Turbopack/HMR)
npm run build      # build de produção + checagem de tipos
npm start          # servidor de produção
npm test           # testes unitários (node:test; Node ≥ 22.18 roda .ts direto)
npx tsc --noEmit   # só checagem de tipos
```

Teste manual rápido da API:

```bash
curl -s "http://localhost:3000/api/search?q=padaria%20do%20joao" | jq '.recommended'
curl -si "http://localhost:3000/api/search?q=a"                  # 422
curl -sN "http://localhost:3000/api/search?q=padaria&stream=1"   # NDJSON
```

## 10. Deploy e operação

Qualquer host de Node.js serve (`npm run build && npm start`); não há variáveis de ambiente nem migrações.

- **Egress.** O servidor precisa alcançar `data.iana.org`, os servidores RDAP (`rdap.registro.br`, `rdap.verisign.com` etc.), o DNS e as APIs de câmbio.
- **Fan-out controlado.** No máximo 10 consultas simultâneas por busca e 10 buscas por minuto por IP, o que limita a ~600 consultas por minuto por IP. Os `429` dos registros são tratados com *backoff*.
- **Estado em memória.** Cache, bootstrap, cotação e contador de *rate limit* vivem no processo. Em *serverless* ou com várias instâncias, cada uma tem o seu (ver §11).
- **Atrás de proxy.** O *rate limit* confia em `x-forwarded-for`. Só é seguro se o proxy sobrescreve esse cabeçalho; caso contrário o cliente pode forjá-lo.

