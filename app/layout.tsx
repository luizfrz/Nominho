import "./globals.css";

export const metadata = {
  title: "Nominho – busca de domínios grátis",
  description: "Encontre o melhor domínio disponível para o seu projeto.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("theme");if(t)document.documentElement.dataset.theme=t;if(localStorage.getItem("mode")==="dark")document.documentElement.dataset.dark="1"}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
