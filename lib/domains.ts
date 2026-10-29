export type Status = "available" | "taken" | "unknown";

export interface Result {
  domain: string;
  status: Status;
  score: number;
  price: number;
  exact: boolean;
}

// tld => [peso de qualidade, preço aproximado/ano em USD]
export const TLDS: Record<string, [number, number]> = {
  com: [40, 12], "com.br": [36, 8], io: [30, 40], dev: [28, 13],
  app: [27, 14], net: [26, 14], org: [25, 11], co: [24, 28],
  ai: [24, 75], xyz: [10, 3], site: [8, 3], online: [8, 4],
};
const MAIN_TLDS = ["com", "com.br", "io", "app", "dev"];
const PREFIXES = ["get", "my", "try", "use", "go", "the"];
const SUFFIXES = ["app", "hub", "lab", "hq", "now", "online", "br", "pro"];
const MAX_CHECKS = 60;

export function slug(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);
}

export function score(base: string, tld: string, kw: string): number {
  let s = TLDS[tld][0];
  s += Math.max(0, 30 - Math.max(0, base.length - 5) * 2); // curto é melhor
  s += base === kw ? 20 : 8; // nome exato vale mais
  if (/\d/.test(base)) s -= 8;
  return Math.max(0, Math.min(100, s));
}

export function candidates(kw: string) {
  const bases = [kw, ...PREFIXES.map((p) => p + kw), ...SUFFIXES.map((x) => kw + x)];
  const list: { domain: string; base: string; tld: string }[] = [];
  for (const base of bases) {
    for (const tld of Object.keys(TLDS)) {
      if (base !== kw && !MAIN_TLDS.includes(tld)) continue;
      list.push({ domain: `${base}.${tld}`, base, tld });
    }
  }
  return list
    .sort((a, b) => score(b.base, b.tld, kw) - score(a.base, a.tld, kw))
    .slice(0, MAX_CHECKS);
}

function rdapUrl(domain: string, tld: string): string {
  if (tld === "com.br") return `https://rdap.registro.br/domain/${domain}`;
  if (tld === "com" || tld === "net") return `https://rdap.verisign.com/${tld}/v1/domain/${domain}`;
  return `https://rdap.org/domain/${domain}`;
}

export async function check(domain: string, tld: string): Promise<Status> {
  try {
    const res = await fetch(rdapUrl(domain, tld), {
      headers: { Accept: "application/rdap+json" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (res.status === 404) return "available";
    if (res.status === 200) return "taken";
    return "unknown";
  } catch {
    return "unknown";
  }
}

// ---------- idioma, moeda e melhor preço ----------
export type Currency = "BRL" | "USD";

/** Cotação fixa e aproximada, só para estimativa. */
export const USD_BRL = 5.5;

const PT_WORDS = new Set([
  "de", "do", "da", "dos", "das", "meu", "minha", "meus", "minhas", "para", "pra", "com", "sem",
  "nosso", "nossa", "seu", "sua", "uma", "por", "bom", "boa", "loja", "padaria", "casa", "verde",
  "azul", "vermelho", "amarelo", "vida", "mundo", "clube", "negocios", "servicos", "estudio",
  "criativo", "criativa", "barbearia", "oficina", "advocacia", "clinica", "academia", "mercado",
  "feira", "doce", "doces", "bolo", "pizzaria", "cafe", "joao", "maria", "brasil", "brasileiro",
  "brasileira", "tudo", "melhor", "campo", "terra", "sol", "lua", "mar", "praia", "festa",
]);

/** Detecta se o texto digitado parece português (acentos, palavras comuns, terminações típicas). */
export function isPortuguese(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (t.length < 2) return false;
  if (/[áàâãéêíóôõúç]/.test(t)) return true;
  const plain = t.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const words = plain.split(/[^a-z0-9]+/).filter(Boolean);
  if (words.some((w) => PT_WORDS.has(w))) return true;
  return words.some((w) => w.length >= 5 && /(cao|coes|inho|inha|aria|eiro|eira|dade|mente)$/.test(w));
}

export function formatPrice(usd: number, cur: Currency): string {
  return cur === "BRL"
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(usd * USD_BRL)
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(usd);
}

/** Regra do melhor preço: entre os livres de boa qualidade (nota ≥ 50), o mais barato; empate vai para a maior nota. */
export function bestPrice(results: Result[]): Result | null {
  const free = results.filter((r) => r.status === "available");
  const good = free.filter((r) => r.score >= 50);
  const pool = good.length ? good : free;
  return [...pool].sort((a, b) => a.price - b.price || b.score - a.score)[0] ?? null;
}
