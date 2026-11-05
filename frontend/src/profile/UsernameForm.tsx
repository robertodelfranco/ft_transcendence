import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../api/client";
import { ProfileUpdateCancelled, useAuth } from "../auth/AuthContext";
import { useAuthForm } from "../auth/useAuthForm";
import { normalize, validateUsername } from "../auth/validation";
import ErrorNotice, { toFailure, type Failure } from "../components/ErrorNotice";
import { buttonPrimary } from "../components/styles";
import TextField from "../components/TextField";

// Troca do username (i18n.md §2.7), com a mesma validação do cadastro. O PATCH entra na fila do
// updateProfile, a mesma do idioma: os dois chegam ao servidor na ordem em que foram feitos
export default function UsernameForm() {
  const { t } = useTranslation("profile");
  const { user, updateProfile } = useAuth();
  const form = useAuthForm({ username: validateUsername }, { username: user?.username ?? "" });
  const username = form.field("username");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    setFailure(null);
    if (!form.validateAll())
      return;
    const changed = normalize(username.value);
    // sem mudança, não há o que mandar: o perfil já guarda esse nome
    if (changed === user?.username) {
      setSaved(true);
      return;
    }

    setBusy(true);
    try {
      await updateProfile({ username: changed });
      setSaved(true);
    } catch (error) {
      if (error instanceof ProfileUpdateCancelled)
        return; // a sessão acabou antes de gravar
      if (error instanceof ApiError && error.code === "username_taken") {
        form.showConflict("username", "username_taken");
        return;
      }
      // 422 que nomeia o campo vai para o campo; o resto vira aviso
      if (error instanceof ApiError && error.fields && form.showServerErrors(error.fields))
        return;
      setFailure(toFailure(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3">
      <TextField {...username} label={t("settings.username")} autoComplete="username" />
      <button type="submit" disabled={busy} className={`${buttonPrimary} self-start`}>
        {t("settings.save")}
      </button>
      {/* sempre montada: o leitor de tela anuncia o texto que entra nela */}
      <p role="status" className="text-sm text-green-400">{saved && t("settings.saved")}</p>
      {failure && <ErrorNotice failure={failure} />}
    </form>
  );
}
