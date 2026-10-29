import { NextRequest, NextResponse } from "next/server";
import { TLDS, candidates, check, score, slug, type Result } from "@/lib/domains";

export async function GET(req: NextRequest) {
  const kw = slug(req.nextUrl.searchParams.get("q") ?? "");
  if (kw.length < 2) {
    return NextResponse.json({ error: "Digite ao menos 2 letras ou números." }, { status: 422 });
  }

  const cands = candidates(kw);
  const results: Result[] = await Promise.all(
    cands.map(async (c) => ({
      domain: c.domain,
      status: await check(c.domain, c.tld),
      score: score(c.base, c.tld, kw),
      price: TLDS[c.tld][1],
      exact: c.base === kw,
    })),
  );
  results.sort((a, b) => b.score - a.score);

  return NextResponse.json({
    query: kw,
    recommended: results.find((r) => r.status === "available") ?? null,
    results,
  });
}
