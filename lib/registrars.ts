export interface Registrar {
  name: string;
  url: string;
  bestFor: string;
  pros: string[];
  cons: string[];
}

/** Ranking editorial (ordem = posição). Não traz preços: eles mudam toda hora. */
export const REGISTRARS: Registrar[] = [
  {
    name: "Registro.br",
    url: "https://registro.br",
    bestFor: "Domínios .com.br",
    pros: ["Órgão oficial dos domínios .br", "Preço em reais, pagamento por Pix ou boleto", "Sem taxas escondidas"],
    cons: ["Só registra extensões .br", "Exige CPF ou CNPJ"],
  },
  {
    name: "Cloudflare Registrar",
    url: "https://www.cloudflare.com/products/registrar/",
    bestFor: "Menor custo na renovação",
    pros: ["Vende ao preço de custo, sem margem", "Privacidade do titular grátis", "Integra com DNS e proteção da Cloudflare"],
    cons: ["Não registra .com.br", "Lista de extensões limitada"],
  },
  {
    name: "Namecheap",
    url: "https://www.namecheap.com",
    bestFor: "Quem quer variedade e facilidade",
    pros: ["Centenas de extensões", "Privacidade do titular grátis", "Painel simples"],
    cons: ["Renovação costuma custar mais que o 1º ano", "Cobra em dólar"],
  },
  {
    name: "Porkbun",
    url: "https://porkbun.com",
    bestFor: "Bom preço sem enrolação",
    pros: ["Preços competitivos", "Privacidade e certificado SSL grátis", "Poucos empurrões de venda"],
    cons: ["Site e suporte em inglês", "Cobra em dólar"],
  },
  {
    name: "NameSilo",
    url: "https://www.namesilo.com",
    bestFor: "Preço baixo e checkout limpo",
    pros: ["Preços baixos e claros", "Privacidade do titular grátis", "Quase nenhuma oferta extra no checkout"],
    cons: ["Visual simples e datado", "Site e suporte em inglês"],
  },
  {
    name: "Hostinger",
    url: "https://www.hostinger.com.br",
    bestFor: "Domínio + hospedagem juntos",
    pros: ["Site e suporte em português", "Cobrança em reais", "Combina bem com hospedagem"],
    cons: ["Promoção no 1º ano, renovação mais cara", "Menos foco só em domínios"],
  },
  {
    name: "Locaweb",
    url: "https://www.locaweb.com.br",
    bestFor: "Registrar .com.br com suporte nacional",
    pros: ["Empresa brasileira, suporte em português", "Cobrança em reais, com Pix e boleto", "Registra .com.br e outras extensões"],
    cons: ["Costuma custar mais que registradores internacionais", "Muitos produtos extras para vender"],
  },
  {
    name: "HostGator Brasil",
    url: "https://www.hostgator.com.br",
    bestFor: "Domínio + hospedagem em reais",
    pros: ["Site e suporte em português", "Cobrança em reais", "Combina bem com hospedagem"],
    cons: ["Promoções de 1º ano, renovação mais cara", "Menos foco só em domínios"],
  },
  {
    name: "Squarespace Domains",
    url: "https://domains.squarespace.com",
    bestFor: "Interface limpa (ex-Google Domains)",
    pros: ["Assumiu os domínios do antigo Google Domains", "Painel bonito e fácil", "Privacidade do titular grátis"],
    cons: ["Mais caro que Cloudflare ou Porkbun", "Não registra .com.br; cobra em dólar"],
  },
  {
    name: "Gandi",
    url: "https://www.gandi.net",
    bestFor: "Quem valoriza reputação e privacidade",
    pros: ["Registrador europeu com boa reputação", "Privacidade do titular grátis", "Sem pressão de venda"],
    cons: ["Preços acima da média", "Não registra .com.br; cobra em dólar ou euro"],
  },
  {
    name: "IONOS",
    url: "https://www.ionos.com",
    bestFor: "Preço de entrada baixo",
    pros: ["Grande empresa europeia", "Primeiro ano costuma ser bem barato", "Boa integração com hospedagem"],
    cons: ["Renovação mais cara", "Checkout com muitas ofertas extras"],
  },
  {
    name: "GoDaddy",
    url: "https://www.godaddy.com",
    bestFor: "Quem quer uma marca conhecida",
    pros: ["Maior registrador do mundo", "Atendimento em português", "Muitos serviços extras"],
    cons: ["Muitas ofertas extras no checkout", "Renovação costuma ser cara"],
  },
];
