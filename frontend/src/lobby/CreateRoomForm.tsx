import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { ApiError, apiFetch } from "../api/client";
import type { CreateMatchInput, MapCatalog, Mode, RoomInfo } from "../api/types";
import ErrorNotice, { toFailure, type Failure } from "../components/ErrorNotice";
import { buttonPrimary, buttonSecondary, fieldClass } from "../components/styles";
import {
  DEFAULT_OPTIONS, MODE_CHOICES, draftToOptions, hasErrors, mapName, seatOptions, serverMode, serverOptionErrors, toDraft, validateDraft,
  type ModeChoice, type OptionErrors, type OptionsDraft,
} from "./roomOptions";
import RoomOptionsFields from "./RoomOptionsFields";

interface Choice {
  mode: ModeChoice;
  map: string; // "" quando o Mode não tem Map
  maxPlayers: number;
}

// O máximo de vagas que a escolha permite no Map: no Solo, uma
function mostSeats(mode: ModeChoice, mapMax = 0): number {
  return seatOptions(mode, mapMax).at(-1) ?? 0;
}

// O default de uma escolha: o primeiro Map do Mode (matches-api.md §2.2), com o máximo de vagas
function defaultChoice(catalog: MapCatalog, mode: ModeChoice): Choice {
  const first = catalog[serverMode(mode)][0];
  return { mode, map: first?.name ?? "", maxPlayers: mostSeats(mode, first?.max_players) };
}

// Mode, Map, vagas e as RoomOptions, que começam nos defaults do Mode. Criar sem mexer em nada
// usa os defaults (plano §5, "pronto quando" da F7.7)
export default function CreateRoomForm() {
  const { t } = useTranslation("lobby");
  const navigate = useNavigate();
  const id = useId();
  const [catalog, setCatalog] = useState<MapCatalog | null>(null);
  const [choice, setChoice] = useState<Choice>({ mode: "coop", map: "", maxPlayers: 0 });
  const { mode, map, maxPlayers } = choice;
  const apiMode = serverMode(mode); // o Solo vai ao servidor como coop
  const [draft, setDraft] = useState<OptionsDraft>(() => toDraft(DEFAULT_OPTIONS.coop));
  const [edited, setEdited] = useState(false); // alguém mexeu nas opções desde o último default
  const [optionErrors, setOptionErrors] = useState<OptionErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<MapCatalog>("/api/maps")
      .then((loaded) => {
        if (cancelled)
          return;
        setCatalog(loaded);
        setChoice(defaultChoice(loaded, "coop"));
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setFailure(toFailure(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function resetOptions(forMode: Mode) {
    setDraft(toDraft(DEFAULT_OPTIONS[forMode]));
    setEdited(false);
    setOptionErrors({});
  }

  // Trocar de Mode volta tudo ao default dele: Map, vagas e opções
  function selectMode(next: ModeChoice) {
    if (!catalog)
      return;
    setChoice(defaultChoice(catalog, next));
    resetOptions(serverMode(next));
  }

  // Trocar de Map volta ao máximo de vagas dele
  function selectMap(name: string) {
    const info = catalog?.[apiMode].find((candidate) => candidate.name === name);
    if (info)
      setChoice({ mode, map: name, maxPlayers: mostSeats(mode, info.max_players) });
  }

  // Depois de um envio com erro, a validação acompanha a digitação: o aviso some quando o valor passa
  function editOptions(next: OptionsDraft) {
    setDraft(next);
    setEdited(true);
    if (hasErrors(optionErrors))
      setOptionErrors(validateDraft(apiMode, next));
  }

  // Erro no envio leva o foco ao primeiro campo inválido da tela, como no login. flushSync: o
  // querySelector lê o DOM, e o aria-invalid novo só entra nele depois do render
  function showOptionErrors(errors: OptionErrors) {
    flushSync(() => setOptionErrors(errors));
    formRef.current?.querySelector<HTMLInputElement>("[aria-invalid='true']")?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!map)
      return;
    setFailure(null);
    const errors = validateDraft(apiMode, draft);
    showOptionErrors(errors);
    if (hasErrors(errors))
      return;
    setSubmitting(true);
    // Sem mexer nas opções, o corpo vai sem `options` e quem aplica os defaults é o servidor
    const body: CreateMatchInput = { mode: apiMode, map, max_players: maxPlayers };
    if (edited)
      body.options = draftToOptions(apiMode, draft);
    try {
      const room = await apiFetch<RoomInfo>("/api/matches", {
        method: "POST",
        body: JSON.stringify(body),
      });
      navigate(`/lobby/${room.match_id}`);
    } catch (error) {
      setSubmitting(false);
      // um 422 com campo do formulário aparece no campo; o resto, no aviso geral
      const fromServer = error instanceof ApiError && error.fields
        ? serverOptionErrors(apiMode, error.fields)
        : {};
      if (hasErrors(fromServer))
        showOptionErrors(fromServer);
      else
        setFailure(toFailure(error));
    }
  }

  const maps = catalog?.[apiMode] ?? [];
  const mapInfo = maps.find((candidate) => candidate.name === map);
  const seats = seatOptions(mode, mapInfo?.max_players ?? 0);

  return (
    <section aria-labelledby={`${id}-heading`} className="dungeon-panel dungeon-create flex min-w-0 flex-col gap-5">
      <h2 id={`${id}-heading`} className="text-xl font-bold">{t("create.heading")}</h2>

      {failure && <ErrorNotice failure={failure} />}

      <form ref={formRef} noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          {t("create.mode")}
          <select
            name="mode"
            value={mode}
            disabled={!catalog}
            onChange={(e) => selectMode(e.target.value as ModeChoice)}
            className={fieldClass}
          >
            {MODE_CHOICES.map((option) => (
              <option key={option} value={option}>{t(`game:modes.${option}`)}</option>
            ))}
          </select>
        </label>

        {catalog && maps.length === 0 ? (
          <p className="text-sm text-bone/70">{t("create.noMaps")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              {t("create.map")}
              <select
                name="map"
                value={map}
                disabled={!catalog}
                onChange={(e) => selectMap(e.target.value)}
                className={fieldClass}
              >
                {maps.map((option) => (
                  <option key={option.name} value={option.name}>{mapName(t, option.name)}</option>
                ))}
              </select>
            </label>
            {/* o Solo tem uma vaga só: não há o que escolher */}
            {mode !== "solo" && (
              <label className="flex flex-col gap-1 text-sm">
                {t("create.maxPlayers")}
                <select
                  name="max_players"
                  value={maxPlayers}
                  disabled={!catalog}
                  onChange={(e) => setChoice({ ...choice, maxPlayers: Number(e.target.value) })}
                  className={fieldClass}
                >
                  {seats.map((count) => (
                    <option key={count} value={count}>{count}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

        <fieldset className="flex flex-col gap-4 rounded border border-crypt-700 p-3">
          <legend className="px-1 text-sm">{t("create.options")}</legend>
          <RoomOptionsFields mode={apiMode} draft={draft} errors={optionErrors} onChange={editOptions} />
          <button
            type="button"
            disabled={!edited}
            onClick={() => resetOptions(apiMode)}
            className={`${buttonSecondary} self-start text-sm`}
          >
            {t("create.reset")}
          </button>
        </fieldset>

        <button type="submit" disabled={!map || submitting} className={buttonPrimary}>
          {submitting ? t("create.submitting") : t("create.submit")}
        </button>
      </form>
    </section>
  );
}
