import { TLDS, candidates, score, slug, type Result } from "./domains";
import { getUsdBrl } from "./fx";
import { pool } from "./pool";
import { checkDomain } from "./rdap";

const CONCURRENCY = 10;

export interface SearchHandlers {
  onMeta: (m: { query: string; total: number; rate: number }) => void;
  onResult: (r: Result) => void;
}

/** Consulta direto do navegador (RDAP + câmbio), entregando cada resultado assim que termina. */
export async function searchDomains(term: string, signal: AbortSignal, h: SearchHandlers): Promise<void> {
  const kw = slug(term);
  if (kw.length < 2) throw new Error("Digite ao menos 2 letras ou números.");

  const cands = candidates(kw);
  const rate = await getUsdBrl();
  if (signal.aborted) return;
  h.onMeta({ query: kw, total: cands.length, rate });

  await pool(cands, CONCURRENCY, async (c) => {
    if (signal.aborted) return;
    const status = await checkDomain(c.domain);
    if (signal.aborted) return;
    h.onResult({
      domain: c.domain,
      status,
      score: score(c.base, c.tld, kw),
      price: TLDS[c.tld][1],
      exact: c.base === kw,
    });
  });
}
