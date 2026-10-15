export const DEFAULT_NEXT = "/lobby";

// o `next` vem da URL, que qualquer um pode forjar. Só aceita caminho interno do próprio site
export function safeNext(raw: string | null): string {
	// "//x" e "/\x" são lidos pelo navegador como outro site; "x" sem barra não é caminho
	if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\"))
		return DEFAULT_NEXT;
	// voltar para o login com sessão abriria um laço de redirecionamentos
	if (/^\/(login|signup)(?:[/?#]|$)/.test(raw))
		return DEFAULT_NEXT;
	return raw;
}