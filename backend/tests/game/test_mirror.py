from app.game.mirror import MIRROR_FILE, build, render


def test_mirror_file_is_up_to_date():
	# falhou? rode `python -m app.game.mirror` e versione o arquivo
	assert MIRROR_FILE.read_text() == render(build())
