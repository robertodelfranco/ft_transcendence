import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useAuthForm } from "../auth/useAuthForm";
import { normalize, validateEmail, validateLoginPassword } from "../auth/validation";
import TextField from "../components/TextField";
import { usePageTitle } from "../hooks/usePageTitle";
import { errorMessage } from "../i18n/errorMessage";

interface FormError {
  code: string;
  requestId: string | null;
}

export default function Login() {
  const { t } = useTranslation("auth");
  const { login } = useAuth();
  const [params] = useSearchParams();
  usePageTitle("auth:login.title");

  const form = useAuthForm({ email: validateEmail, password: validateLoginPassword });
  const email = form.field("email");
  const password = form.field("password");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<FormError | null>(() => {
    const code = params.get("error");
    return code ? { code, requestId: null } : null;
  });

  // o ?next segue para o cadastro, para quem cria conta também voltar aonde ia
  const next = params.get("next");
  const signupTo = next ? `/signup?${new URLSearchParams({ next })}` : "/signup";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!form.validateAll())
      return;

    setSubmitting(true);
    try {
      await login(normalize(email.value), password.value);
      // sem navigate: com a sessão aberta, o PublicOnly manda para o ?next
    } catch (error) {
      setSubmitting(false);
      if (!(error instanceof ApiError)) {
        setFormError({ code: "unknown", requestId: null });
        return;
      }
      if (error.fields && form.showServerErrors(error.fields))
        return;
      setFormError({ code: error.code, requestId: error.requestId });
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <h1 className="text-2xl font-bold text-torch">{t("login.title")}</h1>

      {formError && (
        <p role="alert" className="rounded border border-red-400 px-3 py-2 text-sm text-red-400">
          {errorMessage(t, formError.code, formError.requestId)}
        </p>
      )}

      {/* noValidate: sem os balões nativos do navegador, que não passam pelo i18n */}
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TextField {...email} label={t("fields.email")} type="email" autoComplete="email" />
        <TextField
          {...password}
          label={t("fields.password")}
          type="password"
          autoComplete="current-password"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-torch px-4 py-2 font-bold text-crypt-950 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-torch disabled:opacity-60"
        >
          {submitting ? t("login.submitting") : t("login.submit")} 
        </button>
      </form>

      <p className="text-sm">
        {t("login.noAccount")}{" "}
        <Link to={signupTo} className="underline hover:text-torch focus-visible:outline-2 focus-visible:outline-torch">
          {t("login.toSignup")}
        </Link>
      </p>
    </section>
  )
}