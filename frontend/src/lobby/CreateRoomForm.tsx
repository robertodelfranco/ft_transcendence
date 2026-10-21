import { useEffect, useId, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { apiFetch } from "../api/client";
import type { CreateMatchInput, MapCatalog, Mode, RoomInfo } from "../api/types";
import ErrorNotice, { toFailure, type Failure } from "../components/ErrorNotice";
import { buttonPrimary, fieldClass } from "../components/styles";
import { DEFAULT_OPTIONS, MIN_PLAYERS, MODES, mapName } from "./roomOptions";
import RoomOptionsSummary from "./RoomOptionsSummary";

interface Choice {
  mode: Mode;
  map: string; // "" quando o Mode não tem Map (o pvp, por enquanto)
  maxPlayers: number;
}

// O default de um Mode: o primeiro Map da lista (matches-api.md §2.2), com o máximo de vagas dele
function defaultChoice(catalog: MapCatalog, mode: Mode): Choice {
  const first = catalog[mode][0];
  return { mode, map: first?.name ?? "", maxPlayers: first?.max_players ?? 0 };
}

// Parte 1 da F7.7: Mode, Map e vagas; as opções aparecem com os defaults, só para leitura.
// Criar sem mexer em nada usa os defaults (plano §5, "pronto quando" da F7.7)
export default function CreateRoomForm() {
  const { t } = useTranslation("lobby");
  const navigate = useNavigate();
  const id = useId();
  const [catalog, setCatalog] = useState<MapCatalog | null>(null);
  const [choice, setChoice] = useState<Choice>({ mode: "coop", map: "", maxPlayers: 0 });
  const { mode, map, maxPlayers } = choice;
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

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

  // Trocar de Map volta ao máximo de vagas dele
  function selectMap(name: string) {
    const info = catalog?.[mode].find((candidate) => candidate.name === name);
    if (info)
      setChoice({ mode, map: name, maxPlayers: info.max_players });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!map)
      return;
    setFailure(null);
    setSubmitting(true);
    // só o que o formulário escolhe: sem options, o servidor aplica os defaults
    const body: CreateMatchInput = { mode, map, max_players: maxPlayers };
    try {
      const room = await apiFetch<RoomInfo>("/api/matches", {
        method: "POST",
        body: JSON.stringify(body),
      });
      navigate(`/lobby/${room.match_id}`);
    } catch (error) {
      setSubmitting(false);
      setFailure(toFailure(error));
    }
  }

  const maps = catalog?.[mode] ?? [];
  const mapInfo = maps.find((candidate) => candidate.name === map);
  const seats: number[] = [];
  for (let count = MIN_PLAYERS[mode]; count <= (mapInfo?.max_players ?? 0); count += 1)
    seats.push(count);

  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-4">
      <h2 id={`${id}-heading`} className="text-xl font-bold">{t("create.heading")}</h2>

      {failure && <ErrorNotice failure={failure} />}

      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          {t("create.mode")}
          <select
            value={mode}
            disabled={!catalog}
            onChange={(e) => catalog && setChoice(defaultChoice(catalog, e.target.value as Mode))}
            className={fieldClass}
          >
            {MODES.map((option) => (
              <option key={option} value={option}>{t(`game:modes.${option}`)}</option>
            ))}
          </select>
        </label>

        {catalog && maps.length === 0 ? (
          <p className="text-sm text-bone/70">{t("create.noMaps")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-sm">
              {t("create.map")}
              <select
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
            <label className="flex flex-col gap-1 text-sm">
              {t("create.maxPlayers")}
              <select
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
          </div>
        )}

        <fieldset className="flex flex-col gap-2 rounded border border-crypt-700 p-3">
          <legend className="px-1 text-sm">{t("create.defaults")}</legend>
          <RoomOptionsSummary options={DEFAULT_OPTIONS[mode]} />
        </fieldset>

        <button type="submit" disabled={!map || submitting} className={buttonPrimary}>
          {submitting ? t("create.submitting") : t("create.submit")}
        </button>
      </form>
    </section>
  );
}
