const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

const g = globalThis as unknown as { __nominho_rl?: Map<string, { count: number; reset: number }> };
const hits = (g.__nominho_rl ??= new Map());

/** Janela fixa por chave (IP): no máximo `MAX_PER_WINDOW` buscas por minuto. */
export function rateLimit(key: string): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);

  const h = hits.get(key);
  if (!h || h.reset <= now) {
    hits.set(key, { count: 1, reset: now + WINDOW_MS });
    return { ok: true, retryAfter: 0 };
  }
  if (h.count >= MAX_PER_WINDOW) return { ok: false, retryAfter: Math.ceil((h.reset - now) / 1000) };
  h.count++;
  return { ok: true, retryAfter: 0 };
}
