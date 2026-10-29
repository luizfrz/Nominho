import assert from "node:assert/strict";
import { test } from "node:test";
import { bestPrice, candidates, formatPrice, isPortuguese, score, slug, type Result } from "../lib/domains.ts";
import { pool } from "../lib/pool.ts";
import { pickService } from "../lib/rdap.ts";

const r = (domain: string, status: Result["status"], score: number, price: number): Result => ({
  domain, status, score, price, exact: true,
});

test("slug remove acentos, espaços e símbolos", () => {
  assert.equal(slug("Padaria do João!"), "padariadojoao");
  assert.equal(slug("Açaí & Cia."), "acaicia");
  assert.equal(slug("a".repeat(80)).length, 40);
});

test("score segue a fórmula documentada", () => {
  assert.equal(score("padariadojoao", "com", "padariadojoao"), 74); // 40 + 14 + 20
  assert.equal(score("padariadojoao", "com.br", "padariadojoao"), 70); // 36 + 14 + 20
  assert.equal(score("abc", "com", "abc"), 90); // 40 + 30 + 20
  assert.equal(score("abc1", "com", "abc1"), 82); // −8 por dígito
  assert.equal(score("getabc", "com", "abc"), 40 + 28 + 8);
});

test("score fica sempre entre 0 e 100", () => {
  for (const b of ["a", "abcdefghijklmnopqrstuvwxyz0123456789"]) {
    for (const t of ["com", "xyz", "online"]) {
      const s = score(b, t, b);
      assert.ok(s >= 0 && s <= 100, `${b}.${t} = ${s}`);
    }
  }
});

test("candidates respeita o limite e começa pelo melhor", () => {
  const c = candidates("padaria");
  assert.equal(c.length, 60);
  assert.equal(c[0].domain, "padaria.com");
  assert.equal(new Set(c.map((x) => x.domain)).size, c.length);
  assert.ok(c.every((x) => x.base === "padaria" || ["com", "com.br", "io", "app", "dev"].includes(x.tld)));
});

test("bestPrice: mais barato entre os livres com nota >= 50", () => {
  const list = [
    r("a.com", "available", 74, 12),
    r("b.xyz", "available", 40, 3), // barato, mas abaixo do corte
    r("c.com.br", "available", 70, 8),
    r("d.io", "taken", 64, 1), // tomado nunca entra
  ];
  assert.equal(bestPrice(list)?.domain, "c.com.br");
});

test("bestPrice: empate no preço vence a maior nota; sem nota boa usa o mais barato", () => {
  assert.equal(bestPrice([r("a.com", "available", 60, 10), r("b.net", "available", 80, 10)])?.domain, "b.net");
  assert.equal(bestPrice([r("a.xyz", "available", 30, 5), r("b.site", "available", 20, 3)])?.domain, "b.site");
  assert.equal(bestPrice([r("a.com", "taken", 90, 1)]), null);
  assert.equal(bestPrice([]), null);
});

test("isPortuguese", () => {
  for (const t of ["padaria do joão", "studio criativo", "meu portfolio", "construção", "casa verde"]) {
    assert.equal(isPortuguese(t), true, t);
  }
  for (const t of ["coffee shop", "zeta", "hello world", "a"]) {
    assert.equal(isPortuguese(t), false, t);
  }
});

test("formatPrice usa a cotação informada", () => {
  assert.match(formatPrice(10, "BRL", 5), /R\$\s?50/);
  assert.match(formatPrice(10, "USD"), /\$10/);
});

test("pickService encontra o servidor pela extensão e normaliza a barra final", () => {
  const bs = {
    services: [
      [["com", "net"], ["https://rdap.verisign.com/com/v1/"]],
      [["br"], ["http://old.example/", "https://rdap.registro.br"]],
    ] as [string[], string[]][],
  };
  assert.equal(pickService(bs, "com"), "https://rdap.verisign.com/com/v1/");
  assert.equal(pickService(bs, "br"), "https://rdap.registro.br/");
  assert.equal(pickService(bs, "zzz"), null); // sem RDAP → o chamador trata como "unknown"
});

test("pool respeita o limite de concorrência e preserva a ordem", async () => {
  let running = 0;
  let peak = 0;
  const out = await pool([1, 2, 3, 4, 5, 6, 7, 8], 3, async (n) => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((res) => setTimeout(res, 10));
    running--;
    return n * 2;
  });
  assert.deepEqual(out, [2, 4, 6, 8, 10, 12, 14, 16]);
  assert.equal(peak, 3);
});
