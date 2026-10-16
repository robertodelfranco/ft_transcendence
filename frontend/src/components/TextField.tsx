import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { FieldErrorCode } from "../i18n/errorCodes";

interface TextFieldProps {
  name: string;
  label: string;
  type?: "text" | "email" | "password";
  autoComplete: string;
  value: string;
  error: FieldErrorCode | null;
  onChange: (value: string) => void;
  onBlur: () => void;
  ref: (input: HTMLInputElement | null) => void;
}

// Rótulo, cmapo e erro ligados por id: o leitor da tela lê os três juntos
export default function TextField({
  name, label, type = "text", autoComplete, value, error, onChange, onBlur, ref,
}: TextFieldProps) {
  const { t } = useTranslation();
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="id" className="text-sm">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        className="rounded border border-crypt-700 bg-crypt-900 px-3 py-2 text-bone focus-visible:outline-2 focus-visible:outline-torch aria-invalid:border-red-400"
      />
      {error && (
        <p id={errorId} className="text-sm text-red-400">
          {t(`errors:fields.${error}`)}
        </p>
      )}
    </div>
  );
}