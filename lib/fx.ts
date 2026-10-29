import { USD_BRL } from "./domains";

const TTL_OK = 60 * 60_000;
const TTL_FAIL = 5 * 60_000;

const g = globalThis as unknown as { __nominho_fx?: { rate: number; exp: number } };

async function fetchRate(): Promise<number | null> {
  const sources: [string, (j: any) => unknown][] = [
    ["https://economia.awesomeapi.com.br/json/last/USD-BRL", (j) => j?.USDBRL?.bid],
    ["https://open.er-api.com/v6/latest/USD", (j) => j?.rates?.BRL],
  ];
  for (const [url, pick] of sources) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000), cache: "no-store" });
      const rate = Number(pick(await res.json()));
      if (res.ok && Number.isFinite(rate) && rate > 2 && rate < 12) return rate;
    } catch {
      /* tenta a próxima fonte */
    }
  }
  return null;
}

/** Cotação USD→BRL ao vivo (cache de 1 h). Se as APIs falharem, usa a última boa ou a constante. */
export async function getUsdBrl(): Promise<number> {
  const c = g.__nominho_fx;
  if (c && c.exp > Date.now()) return c.rate;
  const rate = await fetchRate();
  g.__nominho_fx = { rate: rate ?? c?.rate ?? USD_BRL, exp: Date.now() + (rate ? TTL_OK : TTL_FAIL) };
  return g.__nominho_fx.rate;
}
