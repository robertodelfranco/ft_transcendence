import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PLAYER_CHARACTERS, playerCharacter, type CharacterId } from "../../game/src/playerCharacters";

export function CharacterPortrait({ characterId, className }: { characterId: string; className: string }) {
  const { t } = useTranslation("lobby");
  const character = playerCharacter(characterId);
  const [failedSprite, setFailedSprite] = useState<string | null>(null);
  const failed = failedSprite === character.sprite;

  return (
    <span className={`inline-grid shrink-0 place-items-center ${className}`}>
      {failed ? (
        <svg role="img" aria-label={t("characters.previewUnavailable")} viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-6 w-6 text-bone/40">
          <circle cx="12" cy="7" r="4" />
          <path d="M4 22v-3a8 8 0 0 1 16 0v3" />
        </svg>
      ) : (
        <img
          src={character.sprite}
          alt=""
          className="h-full w-full object-contain [image-rendering:pixelated]"
          onError={() => setFailedSprite(character.sprite)}
        />
      )}
    </span>
  );
}

export default function CharacterPicker({ value, disabled, onSelect }: {
  value: string;
  disabled: boolean;
  onSelect: (id: CharacterId) => void;
}) {
  const { t } = useTranslation("lobby");
  const selected = playerCharacter(value).id;

  return (
    <fieldset disabled={disabled} className="min-w-0 rounded-sm border border-torch/30 bg-crypt-900/80 p-4">
      <legend className="px-2 font-bold text-torch">{t("characters.title")}</legend>
      <p className="mb-4 text-sm text-bone/70">{t("characters.description")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {PLAYER_CHARACTERS.map((character) => {
          const active = character.id === selected;
          return (
            <button
              key={character.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(character.id)}
              className={`flex flex-col items-center gap-3 rounded-sm border p-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-torch disabled:cursor-wait disabled:opacity-60 ${active
                ? "border-torch bg-torch/10 ring-1 ring-torch/30"
                : "border-crypt-700 bg-crypt-950/60 hover:border-torch/60 hover:bg-crypt-950"}`}
            >
              <CharacterPortrait characterId={character.id} className="h-20 w-20" />
              <span className={`font-bold ${active ? "text-torch" : "text-bone"}`}>{t(`characters.names.${character.id}`)}</span>
            </button>
          );
        })}
      </div>
      <p role="status" className="mt-3 text-sm text-bone/70">
        {t("characters.current", { name: t(`characters.names.${selected}`) })}
      </p>
    </fieldset>
  );
}
