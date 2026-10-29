// As regras do backend (i18n.md §2.7), conferidas antes do envio: poupa o upload de algo que
// voltaria recusado. Quem decide de verdade é o servidor, pelo conteúdo, com o Pillow
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

// O File.type vem da extensão, não do conteúdo. SVG fica de fora: é texto e pode levar script
const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];

export type AvatarFileError = "avatar_too_large" | "avatar_invalid";

// Na ordem do backend: o tamanho primeiro, o tipo depois. Os dois code já estão no errors.json
export function checkAvatarFile(file: File): AvatarFileError | null {
  if (file.size > MAX_AVATAR_BYTES)
    return "avatar_too_large";
  if (!AVATAR_TYPES.includes(file.type))
    return "avatar_invalid";
  return null;
}
