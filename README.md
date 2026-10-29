<div align="center">

# 🔎 Nominho

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

Aplicação Next.js (App Router) **sem banco de dados e sem variáveis de ambiente**. Um único Route Handler (`GET /api/search`) gera candidatos de domínio a partir de um termo, consulta o servidor RDAP de cada um **em paralelo**, pontua os resultados com uma função pura e devolve JSON. A UI é um único Client Component que renderiza o resultado e guarda preferências no `localStorage`.

| Item | Valor |
|---|---|
| Runtime | Node.js ≥ 20.9 (requisito do Next 16) |
| Dependências de runtime | `next`, `react`, `react-dom` |
| Fonte de verdade da disponibilidade | RDAP (RFC 7480 e RFC 9083) |
| Estado no servidor | nenhum (stateless, sem cache, sem fila) |
| Estado no cliente | `localStorage`: `theme`, `mode`, `currency` |
| Testes automatizados | nenhum (ver [§12](#12-melhorias-planejadas)) |

## 2. Arquitetura

```
┌───────────────────────────── Browser ─────────────────────────────┐
│  app/page.tsx  ("use client")                                     │
│   ├─ estado: q, data, cur/chosen, theme, mode, sort, filtros      │
│   ├─ cálculo derivado: lista ordenada/filtrada, bestPrice()       │
│   └─ fetch("/api/search?q=…")                                     │
└───────────────────────────────┬───────────────────────────────────┘
                                │ JSON
┌───────────────────────────────▼───────────────────────────────────┐
│  app/api/search/route.ts   (Route Handler, runtime Node)          │
│   slug(q) → candidates(kw) → Promise.all(check()) → sort → JSON   │
└───────────────────────────────┬───────────────────────────────────┘
                                │ HTTPS (≤ 60 requisições simultâneas)
        ┌───────────────────────┼─────────────────────────┐
        ▼                       ▼                         ▼
 rdap.registro.br     rdap.verisign.com/{com,net}      rdap.org
     (.com.br)               (.com, .net)         (bootstrap → registro)
```

Decisões de projeto:

- **Lógica pura em `lib/domains.ts`** (slug, pontuação, geração de candidatos, melhor preço, formatação). Só `check()` faz I/O, o que deixa o resto trivial de testar.
- **Preço e nota são calculados no servidor; moeda e ordenação no cliente.** O servidor sempre devolve preços em USD, e a troca de moeda não exige nova requisição.
- **Cliente sem biblioteca de UI nem de estado.** Estilos em CSS puro com custom properties.

## 3. Ciclo de vida de uma busca

```
 "Padaria do João"
        │ slug(): NFD → remove diacríticos → lowercase → [^a-z0-9]+ → "" → slice(0,40)
        ▼
 "padariadojoao"                      (< 2 caracteres → HTTP 422)
        │ candidates()
        ▼
 82 candidatos  →  ordena por score() desc  →  slice(0, 60)
        │ Promise.all(check())          timeout 8 s por domínio, sem limite de concorrência
        ▼
 status ∈ { available | taken | unknown }
        │ sort por score desc
        ▼
 recommended = primeiro resultado com status === "available"
```

**Geração de candidatos.** São 15 *bases*: o termo, 6 prefixos (`get`, `my`, `try`, `use`, `go`, `the`) e 8 sufixos (`app`, `hub`, `lab`, `hq`, `now`, `online`, `br`, `pro`). A base exata é combinada com as **12 extensões**, e as demais só com as **5 principais** (`com`, `com.br`, `io`, `app`, `dev`): 12 + 14 × 5 = **82 candidatos**. Eles são ordenados por nota e cortados em `MAX_CHECKS = 60`, limitando o fan-out por busca.

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

### 4.2 Disponibilidade (`check`)

```ts
fetch(rdapUrl(domain, tld), {
  headers: { Accept: "application/rdap+json" },
  signal: AbortSignal.timeout(8000),
  cache: "no-store",
});
```

| Resposta | Status interno |
|---|---|
| HTTP `404` | `available` |
| HTTP `200` | `taken` |
| Qualquer outro código, timeout ou erro de rede | `unknown` |

Roteamento do endpoint: `.com.br` → `rdap.registro.br`; `.com` e `.net` → `rdap.verisign.com/{tld}/v1/`; demais → `rdap.org` (redireciona ao RDAP do registro; o `fetch` segue os redirects). `unknown` **nunca** é recomendado. Veja a ressalva sobre falsos positivos em [§11](#11-limitações-conhecidas).

### 4.3 Recomendação e melhor preço

- **`recommended`**: com a lista já ordenada por nota, é o primeiro item `available`.
- **`bestPrice(results)`**: filtra `available`; restringe a nota ≥ 50 (se o conjunto ficar vazio, usa todos os livres); ordena por `price` crescente e, em empate, por `score` decrescente; devolve o primeiro. Roda no cliente sobre os resultados completos, antes de qualquer filtro de UI.

### 4.4 Moeda

Preços trafegam em USD. O cliente aplica `USD_BRL = 5.5` (constante) e formata com `Intl.NumberFormat` (`pt-BR`/BRL ou `en-US`/USD, sem casas decimais). Precedência da moeda ativa:

```
cur = chosen ?? suggested
suggested = (q.length ≥ 2 ? isPortuguese(q) || navigator.language ∈ pt* : navigator.language ∈ pt*) ? "BRL" : "USD"
```

`isPortuguese` é heurística em três níveis: (1) caracteres `áàâãéêíóôõúç`; (2) interseção das palavras (sem acento) com o conjunto `PT_WORDS`; (3) palavras de ≥ 5 letras terminadas em `-cao|-coes|-inho|-inha|-aria|-eiro|-eira|-dade|-mente`. É um classificador de sugestão, não de idioma.

## 5. Contrato da API

```
GET /api/search?q=<texto>
```

**200**

```jsonc
{
  "query": "padariadojoao",            // termo normalizado
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

**422** `{ "error": "Digite ao menos 2 letras ou números." }` quando o termo normalizado tem menos de 2 caracteres.

```ts
type Status = "available" | "taken" | "unknown";
interface Result { domain: string; status: Status; score: number; price: number; exact: boolean }
```

A rota não define limites de taxa, `Cache-Control` nem `maxDuration`: o tempo total é limitado pelo pior timeout individual (≈ 8 s) mais o custo de redirects.

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
  api/search/route.ts   Route Handler: orquestra a busca
  layout.tsx            <html>, metadados, script anti-flash
  page.tsx              Client Component: UI, estado, preferências
  globals.css           tokens, componentes, temas, modo escuro
lib/
  domains.ts            TLDS, slug, score, candidates, check, isPortuguese,
                        formatPrice, bestPrice, USD_BRL
  registrars.ts         REGISTRARS: dados do ranking (ordem = posição)
```

### Pontos de extensão

| Tarefa | Local |
|---|---|
| Nova extensão (peso e preço) | `TLDS` em `lib/domains.ts`; se precisar de servidor RDAP próprio, `rdapUrl()` |
| Prefixos/sufixos | `PREFIXES`, `SUFFIXES` |
| Limite de consultas por busca | `MAX_CHECKS` |
| Corte de qualidade do melhor preço | `bestPrice()` (hoje `score >= 50`) |
| Cotação | `USD_BRL` |
| Registrador no ranking | novo objeto em `lib/registrars.ts` |
| Novo tema | bloco `[data-theme="x"]` em `globals.css` + item em `THEMES` (`page.tsx`) |

## 9. Desenvolvimento

```bash
npm install
npm run dev        # http://localhost:3000 (Turbopack/HMR)
npm run build      # build de produção + checagem de tipos
npm start          # servidor de produção
npx tsc --noEmit   # só checagem de tipos
```

Teste manual rápido da API:

```bash
curl -s "http://localhost:3000/api/search?q=padaria%20do%20joao" | jq '.recommended'
curl -si "http://localhost:3000/api/search?q=a"                  # 422
```

