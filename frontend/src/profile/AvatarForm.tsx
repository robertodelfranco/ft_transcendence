import { useEffect, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { ProfileUpdateCancelled, useAuth } from "../auth/AuthContext";
import ErrorNotice, { toFailure, type Failure } from "../components/ErrorNotice";
import { buttonPrimary, buttonSecondary } from "../components/styles";
import Avatar from "./Avatar";
import { checkAvatarFile, DEFAULT_AVATAR_URL } from "./avatarFile";

// Os tipos que o seletor de arquivo oferece; quem confere de verdade é o checkAvatarFile
const ACCEPT = "image/png,image/jpeg,image/webp";

// Avatar em /settings (i18n.md §2.7): escolher, conferir, ver a prévia e só então enviar; ou voltar
// ao padrão. O envio entra na fila do perfil, a mesma do username e do idioma
export default function AvatarForm() {
  const { t } = useTranslation("profile");
  const { user, updateAvatar } = useAuth();
  // o arquivo escolhido e a URL blob: da prévia, criada uma vez por arquivo
  const [chosen, setChosen] = useState<{ file: File; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  // a URL blob: segura o arquivo na memória até ser revogada: trocar de arquivo, cancelar, enviar
  // ou sair da tela libera a anterior
  useEffect(() => {
    if (!chosen)
      return;
    return () => URL.revokeObjectURL(chosen.preview);
  }, [chosen]);

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // escolher o mesmo arquivo de novo dispara o change outra vez
    if (!file)
      return;
    setSaved(false);
    const problem = checkAvatarFile(file);
    if (problem) {
      setChosen(null);
      setFailure({ code: problem, requestId: null });
      return;
    }
    setFailure(null);
    setChosen({ file, preview: URL.createObjectURL(file) });
  }

  // o arquivo escolhido vai para o PUT; null volta ao avatar padrão (DELETE)
  async function save(file: File | null) {
    setBusy(true);
    setSaved(false);
    setFailure(null);
    try {
      await updateAvatar(file);
      setChosen(null);
      setSaved(true);
    } catch (error) {
      if (!(error instanceof ProfileUpdateCancelled))
        setFailure(toFailure(error));
    } finally {
      setBusy(false);
    }
  }

  if (!user)
    return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        {chosen
          ? <img src={chosen.preview} alt={t("settings.avatar.preview")}
              className="size-32 shrink-0 rounded-full object-cover" />
          : <Avatar user={user} large />}
        <div className="flex flex-col gap-2">
          {chosen ? (
            <>
              <button type="button" onClick={() => save(chosen.file)} disabled={busy} className={buttonPrimary}>
                {t("settings.avatar.upload")}
              </button>
              <button type="button" onClick={() => setChosen(null)} disabled={busy} className={buttonSecondary}>
                {t("settings.avatar.cancel")}
              </button>
            </>
          ) : (
            <>
              {/* o input nativo fica escondido: o texto do botão dele viria no idioma do navegador,
                  não no da tela. O label faz o papel do botão e recebe o foco visível */}
              <label className={`${buttonSecondary} cursor-pointer text-center has-focus-visible:outline-2 has-focus-visible:outline-torch`}>
                {t("settings.avatar.choose")}
                <input type="file" accept={ACCEPT} onChange={choose} disabled={busy} className="sr-only" />
              </label>
              {user.avatar_url !== DEFAULT_AVATAR_URL && (
                <button type="button" onClick={() => save(null)} disabled={busy} className={buttonSecondary}>
                  {t("settings.avatar.remove")}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <p className="text-sm text-bone/70">{t("settings.avatar.hint")}</p>
      {/* sempre montada: o leitor de tela anuncia o texto que entra nela */}
      <p role="status" className="text-sm text-green-400">{saved && t("settings.avatar.saved")}</p>
      {failure && <ErrorNotice failure={failure} />}
    </div>
  );
}
