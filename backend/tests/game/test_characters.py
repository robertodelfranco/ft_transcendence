import re
from pathlib import Path

from app.game.characters import CharacterId, DEFAULT_CHARACTER


def test_character_catalogs_and_sprite_files_agree():
	root = Path(__file__).resolve().parents[3]
	frontend = root / "frontend" / "game" / "src" / "playerCharacters.ts"
	ids = re.findall(r'id: "([a-z0-9_]+)"', frontend.read_text())
	assert ids == [character.value for character in CharacterId]
	assert DEFAULT_CHARACTER.value == "nemesis"
	for character_id in ids:
		assert (root / "frontend" / "public" / "assets" / "player" / f"{character_id}.png").is_file()
	for url in re.findall(r'(?:sprite|projectileSprite): "([^"]+)"', frontend.read_text()):
		assert (root / "frontend" / "public" / url.lstrip("/")).is_file()
