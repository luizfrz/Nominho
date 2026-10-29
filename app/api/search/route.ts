import { NextRequest, NextResponse } from "next/server";
import { TLDS, candidates, score, slug, type Result } from "@/lib/domains";
import { getUsdBrl } from "@/lib/fx";
import { pool } from "@/lib/pool";
import { checkDomain } from "@/lib/rdap";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const CONCURRENCY = 10;

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

export async function GET(req: NextRequest) {
  const kw = slug(req.nextUrl.searchParams.get("q") ?? "");
  if (kw.length < 2) {
    return NextResponse.json({ error: "Digite ao menos 2 letras ou números." }, { status: 422 });
  }

  const limit = rateLimit(clientIp(req));
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Muitas buscas seguidas. Tente de novo em ${limit.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const cands = candidates(kw);
  const rate = await getUsdBrl();
  const toResult = async (c: (typeof cands)[number]): Promise<Result> => ({
    domain: c.domain,
    status: await checkDomain(c.domain),
    score: score(c.base, c.tld, kw),
    price: TLDS[c.tld][1],
    exact: c.base === kw,
  });

  // streaming (NDJSON): um resultado por linha, conforme cada consulta termina
  if (req.nextUrl.searchParams.get("stream") === "1") {
    const enc = new TextEncoder();
    const body = new ReadableStream({
      async start(ctrl) {
        const send = (o: unknown) => {
          try {
            ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
          } catch {
            /* cliente desconectou */
          }
        };
        send({ type: "meta", query: kw, total: cands.length, rate });
        await pool(cands, CONCURRENCY, async (c) => {
          if (req.signal.aborted) return;
          send({ type: "result", result: await toResult(c) });
        });
        send({ type: "done" });
        try {
          ctrl.close();
        } catch {}
      },
    });
    return new Response(body, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
    });
  }

  const results = await pool(cands, CONCURRENCY, toResult);
  results.sort((a, b) => b.score - a.score);
  return NextResponse.json({
    query: kw,
    rate,
    recommended: results.find((r) => r.status === "available") ?? null,
    results,
  });
}
