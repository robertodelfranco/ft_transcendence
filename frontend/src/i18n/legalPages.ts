// A lista sem os textos: a casca importa daqui para montar as rotas (os textos ficam em legal.ts)
export const LEGAL_PAGES = ["privacy", "terms"] as const;
export type LegalPage = (typeof LEGAL_PAGES)[number];
