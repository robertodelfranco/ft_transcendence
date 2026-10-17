import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { FieldErrorCode } from "../i18n/errorCodes";
import { toFieldErrorCode } from "../i18n/errorMessage";

type Validator = (value: string) => FieldErrorCode | null;

// Valores, erro por campo e foco no primeiro inválido. `F` é a união dos nomes dos campos, e a
// ordem das chaves em `validators` é a ordem em que aparecem na tela
export function useAuthForm<F extends string>(validators: Record<F, Validator>) {
  const fields = Object.keys(validators) as F[];
  const [values, setValues] = useState(
    () => Object.fromEntries(fields.map((fields) => [fields, ""])) as Record<F, string>,
  );
  const [errors, setErrors] = useState<Partial<Record<F, FieldErrorCode | null >>>({});
  const inputs = useRef<Partial<Record<F, HTMLInputElement | null >>>({});

  function setError(field: F, code: FieldErrorCode | null) {
    setErrors((current) => ({ ...current, [field]: code }));
  }

  // flushSync: o aria-describedby já aponta para a mensagem quando o leitor de tela anuncia o
  // campo que recebeu o foco
  function show(found: Partial<Record<F, FieldErrorCode>>): boolean {
    flushSync(() => setErrors(found));
    const first = fields.find((field) => found[field]);
    if (first)
      inputs.current[first]?.focus();
    return first !== undefined;
  }

  // No envio: true se tudo passou
  function validateAll(): boolean {
    const found: Partial<Record<F, FieldErrorCode>> = {};
    for (const field of fields) {
      const code = validators[field](values[field]);
      if (code)
        found[field] = code;
    }
    return !show(found);
  }

  // 422 e 409: o code vai para o campo que o backend nomeia. False se nenhum é desta tela
  function showServerErrors(serverFields: Record<string, string>): boolean {
    const found: Partial<Record<F, FieldErrorCode>> = {};
    for (const field of fields) {
      if (serverFields[field])
        found[field] = toFieldErrorCode(serverFields[field]);
    }
    return show(found);
  }

  // As props de um <TextField>
  function field(name: F) {
    return {
      name,
      value: values[name],
      error: errors[name] ?? null,
      ref: (input: HTMLInputElement | null) => {
        inputs.current[name] = input;
      },
      onChange: (value: string) => {
        setValues((current) => ({ ...current, [name]: value }));
        // campo que já mostra erro revalida a cada tecla: o erro some some assim que o valor fica certo
        if (errors[name])
          setError(name, validators[name](value));
      },
      onBlur: () => {
        // vazio só acusa no envio: passar pelo campo com Tab não é erro
        if (values[name])
          setError(name, validators[name](values[name]));
      },
    };
  }
  return { values, field, validateAll, showServerErrors };
}