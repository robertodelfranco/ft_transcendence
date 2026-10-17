import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useAuthForm } from "../auth/useAuthForm";
import {
  normalize, validateEmail, validateNewPassword, validateUsername,
} from "../auth/validation";
import TextField from "../components/TextField";
import { usePageTitle } from "../hooks/usePageTitle";
import { errorMessage } from "../i18n/errorMessage";

interface FormError {
  code: string;
  requestId: string | null;
}

export default function Signup() {
  const { t } = useTranslation("auth");
  const { signup } = useAuth();
  const [params] = useSearchParams();
  usePageTitle("auth:signup.title");

  const form = useAuthForm({
    email: validateEmail,
    username: validateUsername,
    password: validateNewPassword,
  });
  const email = form.field("email");
  const username = form.field("username");
  const password = form.field("password");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<FormError | null>(null);

  const next = params.get("next");
  const loginTo = next ? `/login?${new URLSearchParams({ next })}` : "/login";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!form.validateAll())
      return;

    setSubmitting(true);
    try {
      await signup({
        email: normalize(email.value),
        username: normalize(username.value),
        password: password.value,
      });
      // sem navigate: com a sessão aberta, o PublicOnly manda para o ?next
    } catch (error) {
      setSubmitting(false);
      if (!(error instanceof ApiError)) {
        setFormError({ code: "unknown", requestId: null });
        return;
      }
      if (error.code === "email_taken" || error.code === "username_taken") {
        form.showConflict(error.code === "email_taken" ? "email" : "username", error.code);
        return;
      }
      if (error.fields && form.showServerErrors(error.fields))
        return;
      setFormError({ code: error.code, requestId: error.requestId });
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <h1 className="text-2xl font-bold text-torch">{t("signup.title")}</h1>

      {formError && (
        <p role="alert" className="rounded border border-red-400 px-3 py-2 text-sm text-red-400">
          {errorMessage(t, formError.code, formError.requestId)}
        </p>
      )}

      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TextField {...email} label={t("fields.email")} type="email" autoComplete="email" />
        <TextField {...username} label={t("fields.username")} autoComplete="username" />
        <TextField
          {...password}
          label={t("fields.password")}
          type="password"
          autoComplete="new-password"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-torch px-4 py-2 font-bold text-crypt-950 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-torch disabled:opacity-60"
        >
          {submitting ? t("signup.submitting") : t("signup.submit")}
        </button>
      </form>

      <p className="text-sm">
        {t("signup.haveAccount")}{" "}
        <Link
          to={loginTo}
          className="underline hover:text-torch focus-visible:outline-2 focus-visible:outline-torch"
        >
          {t("signup.toLogin")}
        </Link>
      </p>
    </section>
  );
}
