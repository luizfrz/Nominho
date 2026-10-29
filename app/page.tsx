"use client";

import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { bestPrice, formatPrice, isPortuguese, type Currency, type Result } from "@/lib/domains";

interface Data {
  query: string;
  recommended: Result | null;
  results: Result[];
}

const LABEL = { available: "Livre", taken: "Tomado", unknown: "Sem resposta" };
const EXAMPLES = ["padaria do joão", "studio criativo", "meu portfolio", "loja verde"];
const THEMES = [
  { id: "azul", name: "Azul", color: "#1b3dff" },
  { id: "verde", name: "Verde", color: "#0a8f4e" },
  { id: "roxo", name: "Roxo", color: "#6a2cff" },
  { id: "laranja", name: "Laranja", color: "#ff5a1f" },
  { id: "rosa", name: "Rosa", color: "#e6197a" },
  { id: "preto", name: "Preto", color: "#14162b" },
];
const TLDS = [".com", ".com.br", ".io", ".dev", ".app", ".net", ".org", ".co", ".ai", ".xyz", ".site", ".online"];

function buyUrl(d: string) {
  return d.endsWith(".com.br")
    ? `https://registro.br/busca-dominio/?fqdn=${encodeURIComponent(d)}`
    : `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(d)}`;
}

function reason(r: Result) {
  const tld = r.domain.slice(r.domain.indexOf(".") + 1);
  const a = r.exact ? "É exatamente o nome que você digitou" : "Uma variação esperta do seu nome";
  const b =
    tld === "com"
      ? "na extensão que todo mundo conhece"
      : tld === "com.br"
        ? "na extensão feita para o público brasileiro"
        : `na extensão .${tld}`;
  return `${a}, ${b}.`;
}

function Letters({ text }: { text: string }) {
  return (
    <span aria-label={text}>
      {[...text].map((c, i) =>
        c === " " ? (
          " "
        ) : (
          <span key={i} className="ltr" aria-hidden>
            {c}
          </span>
        ),
      )}
    </span>
  );
}

function Name({ domain, fx }: { domain: string; fx?: boolean }) {
  const i = domain.indexOf(".");
  const base = domain.slice(0, i);
  const tld = domain.slice(i);
  return (
    <>
      {fx ? <Letters text={base} /> : base}
      <em>{fx ? <Letters text={tld} /> : tld}</em>
    </>
  );
}

/** Onda de letras: quanto mais perto do mouse, mais a letra sobe, cresce e gira. */
function wave(e: MouseEvent<HTMLElement>) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const { clientX, clientY } = e;
  e.currentTarget.querySelectorAll<HTMLElement>(".ltr").forEach((el) => {
    const r = el.getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    const p = Math.max(0, 1 - Math.hypot(dx, dy) / 150);
    el.style.transform = p ? `translateY(${-p * 24}px) scale(${1 + p * 0.4}) rotate(${(-dx / 14) * p}deg)` : "";
    el.style.color = p > 0.3 ? (el.closest("i") ? "var(--paper)" : "var(--lime)") : "";
  });
}

function resetWave(e: MouseEvent<HTMLElement>) {
  e.currentTarget.querySelectorAll<HTMLElement>(".ltr").forEach((el) => {
    el.style.transform = "";
    el.style.color = "";
  });
}

function Meter({ value }: { value: number }) {
  const on = Math.round(value / 10);
  return (
    <span className="meter" title={`Nota ${value}/100`}>
      {Array.from({ length: 10 }, (_, k) => (
        <i key={k} className={k < on ? "on" : ""} />
      ))}
    </span>
  );
}

export default function Home() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [onlyFree, setOnlyFree] = useState(true);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [cur, setCur] = useState<Currency>("USD");
  const [browserPt, setBrowserPt] = useState(false);
  const [theme, setTheme] = useState("azul");
  const [sort, setSort] = useState<"score" | "price">("score");

  useEffect(() => setTheme(document.documentElement.dataset.theme || "azul"), []);

  function pickTheme(id: string) {
    setTheme(id);
    document.documentElement.dataset.theme = id;
    try {
      localStorage.setItem("theme", id);
    } catch {}
  }

  useEffect(() => setBrowserPt(navigator.language.toLowerCase().startsWith("pt")), []);

  // texto em português → R$; sem pistas no texto, vale o idioma do navegador
  const typedPt = isPortuguese(q);
  const liveCur: Currency = q.trim().length < 2 ? (browserPt ? "BRL" : "USD") : typedPt || browserPt ? "BRL" : "USD";

  async function search(term: string) {
    setCur(isPortuguese(term) || browserPt ? "BRL" : "USD");
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      const json = await res.json();
      if (json.error) {
        setError(json.error);
        setData(null);
      } else setData(json);
    } catch {
      setError("Não foi possível consultar agora. Tente novamente.");
    }
    setLoading(false);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    search(q);
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const freeCount = data?.results.filter((r) => r.status === "available").length ?? 0;
  const list = (data?.results.filter((r) => !onlyFree || r.status === "available") ?? []).sort((a, b) =>
    sort === "price" ? a.price - b.price || b.score - a.score : b.score - a.score,
  );
  const best = data ? bestPrice(data.results) : null;
  const rec = data?.recommended;

  return (
    <>
      <div className="ticker" aria-hidden>
        <div>
          {[...TLDS, ...TLDS].map((t, i) => (
            <span key={i}>
              {t}
              <b>●</b>
            </span>
          ))}
        </div>
      </div>

      <section className="hero">
        <nav className="nav">
          <span className="logo hov">
            <Letters text="domínio" />
            <i>.</i>
          </span>
          <div className="nav-r">
            <div className="themes" role="group" aria-label="Tema de cor">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={theme === t.id ? "sw on" : "sw"}
                  style={{ background: t.color }}
                  title={`Tema ${t.name}`}
                  aria-label={`Tema ${t.name}`}
                  aria-pressed={theme === t.id}
                  onClick={() => pickTheme(t.id)}
                />
              ))}
            </div>
            <span className="pill">consulta ao vivo · RDAP</span>
          </div>
        </nav>

        <div className="hero-in">
          <p className="kicker">Busca de domínios</p>
          <h1 onMouseMove={wave} onMouseLeave={resetWave}>
            <Letters text="Seu nome," />
            <br />
            <i>
              <Letters text="seu endereço." />
            </i>
          </h1>
          <p className="lead">
            Digite a ideia do projeto. Conferimos nos registros oficiais o que está livre e apontamos o melhor domínio.
          </p>

          <p className="free">
            <b>GRÁTIS</b> Aqui você tem indicações e recomendações de graça, sem nenhum custo.
          </p>

          <div className="bar-wrap">
            <div className="addr">
              <div className="addr-top">
                <i /><i /><i />
                <small>{liveCur === "BRL" ? (typedPt ? "🇧🇷 português detectado · preços em R$" : "🇧🇷 preços em R$") : "🌎 preços em US$"}</small>
              </div>
              <form className="addr-row" onSubmit={submit}>
                <span className="proto">https://</span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="seunome"
                  aria-label="Nome do projeto"
                  minLength={2}
                  required
                  autoFocus
                  spellCheck={false}
                />
                <button className="go" disabled={loading}>
                  {loading ? "BUSCANDO…" : "VERIFICAR ↵"}
                </button>
              </form>
            </div>
          </div>

          <div className="chips">
            <span>tente:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                className="chip"
                onClick={() => {
                  setQ(ex);
                  search(ex);
                }}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      </section>

      <main>
        {error && <div className="error">⚠ {error}</div>}

        {loading && (
          <div className="skels">
            <div className="skel big" />
            <div className="skel" />
            <div className="skel" />
            <div className="skel" />
          </div>
        )}

        {!data && !loading && !error && (
          <section className="rules">
            <h2 className="sec-title">
              <span>Regras de ouro</span>
              <span>3 dicas</span>
            </h2>
            <div className="rule">
              <span className="n">01</span>
              <div>
                <b>Curto vence.</b>
                <span>Até 10 letras: fácil de lembrar, ditar e digitar no celular.</span>
              </div>
            </div>
            <div className="rule">
              <span className="n">02</span>
              <div>
                <b>.com e .com.br passam confiança.</b>
                <span>São as extensões que o público reconhece sem pensar.</span>
              </div>
            </div>
            <div className="rule">
              <span className="n">03</span>
              <div>
                <b>Sem números nem hífens.</b>
                <span>Quando você dita o endereço, eles viram confusão.</span>
              </div>
            </div>
          </section>
        )}

        {data && !loading && (
          <>
            {rec ? (
              <section className="ticket">
                <div className="t-main">
                  <span className="t-label">★ Recomendado</span>
                  <div className="t-name hov">
                    <Name domain={rec.domain} fx />
                    <span className="cursor" />
                  </div>
                  <p className="t-why">{reason(rec)}</p>
                  <div className="facts">
                    <span className="fact">~{formatPrice(rec.price, cur)}/ano</span>
                    <span className="fact">{rec.domain.indexOf(".")} caracteres</span>
                    {rec.exact && <span className="fact">nome exato</span>}
                  </div>
                  <div className="actions">
                    <a className="btn primary" target="_blank" rel="noopener noreferrer" href={buyUrl(rec.domain)}>
                      REGISTRAR →
                    </a>
                    <button className="btn" onClick={() => copy(rec.domain)}>
                      {copied ? "✓ COPIADO" : "COPIAR NOME"}
                    </button>
                  </div>
                </div>
                <div className="t-stub">
                  <small>Nota</small>
                  <span className="big">{rec.score}</span>
                  <Meter value={rec.score} />
                </div>
              </section>
            ) : (
              <div className="empty">Nada livre para essa ideia. Tente outra palavra, mais específica.</div>
            )}

            {best && (
              <aside className="deal">
                <span className="deal-tag">💰 Melhor preço</span>
                <div className="deal-name"><Name domain={best.domain} /></div>
                <p>
                  {rec && best.domain === rec.domain
                    ? "Sua recomendação também é a opção mais barata. Aproveite!"
                    : `Por ${formatPrice(best.price, cur)}/ano${rec ? `, ${formatPrice(Math.max(0, rec.price - best.price), cur)} a menos que a recomendada` : ""}.`}
                </p>
                <a className="reg" target="_blank" rel="noopener noreferrer" href={buyUrl(best.domain)}>REGISTRAR</a>
              </aside>
            )}

            <div className="ledger-head">
              <h2 className="hov">
                <Letters text="Todas as " />
                <i>
                  <Letters text="opções" />
                </i>
                <br />
                <span style={{ font: "600 .8rem var(--mono)", letterSpacing: 0 }}>
                  {freeCount} livres de {data.results.length} consultadas
                </span>
              </h2>
              <div className="controls">
                <div className="toggle" role="group" aria-label="Ordenar">
                  <button className={sort === "score" ? "on" : ""} onClick={() => setSort("score")}>MELHOR NOTA</button>
                  <button className={sort === "price" ? "on" : ""} onClick={() => setSort("price")}>MENOR PREÇO</button>
                </div>
                <div className="toggle" role="group" aria-label="Filtro">
                  <button className={onlyFree ? "on" : ""} onClick={() => setOnlyFree(true)}>LIVRES</button>
                  <button className={!onlyFree ? "on" : ""} onClick={() => setOnlyFree(false)}>TODOS</button>
                </div>
              </div>
            </div>

            {list.length === 0 ? (
              <div className="empty">Nada para mostrar com esse filtro.</div>
            ) : (
              <>
                <div className="cols">
                  <span>#</span><span>Domínio</span><span>Nota</span><span>Preço</span><span>Status</span><span />
                </div>
                <ul className="list">
                  {list.map((r, i) => (
                    <li key={r.domain} className={`row ${r.status}`} style={{ animationDelay: `${Math.min(i, 14) * 30}ms` }}>
                      <span className="i">{String(i + 1).padStart(2, "0")}</span>
                      <span className="d"><Name domain={r.domain} />{best?.domain === r.domain && <span className="best">melhor preço</span>}</span>
                      <Meter value={r.score} />
                      <span className="price">{formatPrice(r.price, cur)}/ano</span>
                      <span className={`stamp ${r.status}`}>{LABEL[r.status]}</span>
                      {r.status === "available" ? (
                        <a className="reg" target="_blank" rel="noopener noreferrer" href={buyUrl(r.domain)}>REGISTRAR</a>
                      ) : (
                        <span />
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <footer>* “Sem resposta” = o registro não respondeu a tempo. Preços são estimativas anuais{cur === "BRL" ? " (US$ 1 ≈ R$ 5,50)" : ""}; confirme o valor final no site de registro. A regra do melhor preço escolhe o mais barato entre os livres com nota 50 ou mais.</footer>
          </>
        )}
      </main>
    </>
  );
}
