import type { Status } from "./domains";

const BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const BOOTSTRAP_TTL = 24 * 60 * 60_000;
const BOOTSTRAP_RETRY = 60_000;
const TIMEOUT_MS = 4000;
const RETRIES = 2;
const CACHE_MAX = 5000;
const TTL: Record<"available" | "taken", number> = { available: 2 * 60_000, taken: 30 * 60_000 };

/** Usado só se o bootstrap da IANA estiver inacessível. */
const FALLBACK: Record<string, string> = {
  br: "https://rdap.registro.br/",
  com: "https://rdap.verisign.com/com/v1/",
  net: "https://rdap.verisign.com/net/v1/",
};

export interface Bootstrap {
  services: [string[], string[]][];
}

interface State {
  bootstrap?: { at: number; data: Bootstrap | null };
  bootstrapPromise?: Promise<Bootstrap | null>;
  cache: Map<string, { status: Status; exp: number }>;
}
// sobrevive ao hot reload do Next em desenvolvimento (e vive no navegador)
const g = globalThis as unknown as { __nominho_rdap?: State };
const state: State = (g.__nominho_rdap ??= { cache: new Map() });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Procura no bootstrap (RFC 9224) o servidor RDAP responsável pela extensão (último rótulo). */
export function pickService(bs: Bootstrap, tld: string): string | null {
  for (const [tlds, urls] of bs.services) {
    if (!tlds.includes(tld)) continue;
    const url = urls.find((u) => u.startsWith("https://")) ?? urls[0];
    if (!url) return null;
    return url.endsWith("/") ? url : url + "/";
  }
  return null;
}

async function getBootstrap(): Promise<Bootstrap | null> {
  const s = state.bootstrap;
  if (s && Date.now() - s.at < (s.data ? BOOTSTRAP_TTL : BOOTSTRAP_RETRY)) return s.data;
  if (state.bootstrapPromise) return state.bootstrapPromise;

  state.bootstrapPromise = (async () => {
    try {
      const res = await fetch(BOOTSTRAP_URL, { signal: AbortSignal.timeout(5000), cache: "no-store" });
      const json = (await res.json()) as Bootstrap;
      if (!res.ok || !Array.isArray(json.services)) throw new Error("bootstrap inválido");
      state.bootstrap = { at: Date.now(), data: json };
      return json;
    } catch {
      state.bootstrap = { at: Date.now(), data: s?.data ?? null }; // mantém o antigo, se houver
      return state.bootstrap.data;
    } finally {
      state.bootstrapPromise = undefined;
    }
  })();
  return state.bootstrapPromise;
}

async function serviceFor(tld: string): Promise<string | null> {
  const bs = await getBootstrap();
  return bs ? pickService(bs, tld) : (FALLBACK[tld] ?? null);
}

function retryDelay(res: Response | null, attempt: number): number {
  const ra = Number(res?.headers.get("retry-after"));
  if (Number.isFinite(ra) && ra > 0) return Math.min(ra * 1000, 3000);
  return 300 * 2 ** attempt + Math.random() * 100; // backoff exponencial com jitter
}

/** 404 = não registrado, 200 = registrado. 429/5xx/erro de rede são repetidos com backoff. */
async function rdapStatus(base: string, domain: string): Promise<Status> {
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetch(`${base}domain/${encodeURIComponent(domain)}`, {
        headers: { Accept: "application/rdap+json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      void res.body?.cancel();
      if (res.status === 404) return "available";
      if (res.status === 200) return "taken";
      if (res.status !== 429 && res.status < 500) return "unknown";
    } catch {
      /* timeout ou rede: tenta de novo */
    }
    if (attempt < RETRIES) await sleep(retryDelay(res, attempt));
  }
  return "unknown";
}

/** Apoio quando não há RDAP: se existem servidores de nome (DNS sobre HTTPS), o domínio certamente está registrado. */
async function hasNameservers(domain: string): Promise<boolean> {
  try {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=NS`, {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    });
    const j = (await res.json()) as { Status?: number; Answer?: { type: number }[] };
    return j.Status === 0 && !!j.Answer?.some((a) => a.type === 2);
  } catch {
    return false;
  }
}

async function lookup(domain: string): Promise<Status> {
  const tld = domain.slice(domain.lastIndexOf(".") + 1);
  const base = await serviceFor(tld);
  const status: Status = base ? await rdapStatus(base, domain) : "unknown";
  // nunca afirmamos "livre" sem um 404 do servidor autoritativo; sem resposta, o DNS só pode confirmar "tomado"
  if (status === "unknown" && (await hasNameservers(domain))) return "taken";
  return status;
}

/** Disponibilidade de um domínio, com cache curto em memória. */
export async function checkDomain(domain: string): Promise<Status> {
  const hit = state.cache.get(domain);
  if (hit && hit.exp > Date.now()) return hit.status;

  const status = await lookup(domain);
  if (status !== "unknown") {
    state.cache.delete(domain);
    state.cache.set(domain, { status, exp: Date.now() + TTL[status] });
    if (state.cache.size > CACHE_MAX) state.cache.delete(state.cache.keys().next().value as string);
  }
  return status;
}
