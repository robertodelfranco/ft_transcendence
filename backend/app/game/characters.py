"""IDs dos visuais de Player aceitos pelo servidor; não alteram as regras."""
from enum import StrEnum


class CharacterId(StrEnum):
	NEMESIS = "nemesis"
	SUCUBUS = "sucubus"
	OIL = "oil"


DEFAULT_CHARACTER = CharacterId.NEMESIS
