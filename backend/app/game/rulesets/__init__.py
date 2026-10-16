from app.game.rulesets.base import Ruleset
from app.game.rulesets.coop import CoopRuleset
from app.game.rulesets.pvp import PvpRuleset
from app.game.state import Mode

# sem estado: a Room guarda tudo, o Ruleset só lê e decide
RULESETS: dict[Mode, Ruleset] = {Mode.COOP: CoopRuleset(), Mode.PVP: PvpRuleset()}
