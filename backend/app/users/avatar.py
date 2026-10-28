"""Avatar enviado → PNG de 256 × 256 que o próprio servidor gerou (i18n.md §2.7, decisão 9).

Python puro com o Pillow: não conhece FastAPI nem banco, e o teste roda sem subir nada.
"""
import io

from PIL import Image, ImageOps, UnidentifiedImageError


MAX_AVATAR_BYTES = 2 * 1024 * 1024 # 2 MiB; o Nginx corta em 3m, acima disto, para o 413 sair no envelope
# o Image.open só lê o cabeçalho: um PNG de poucos KB pode declarar 20000 × 20000. O limite do
# próprio Pillow (179 M pixels) passaria de 600 MB no worker único, que também roda o tick do jogo
MAX_AVATAR_PIXELS = 4096 * 4096
AVATAR_SIZE = (256, 256)
ACCEPTED_FORMATS = ("PNG", "JPEG", "WEBP") # O formato lido no conteúdo, não a extensão nem o Content-Type


class InvalidAvatar(Exception):
	"""Não é PNG, JPEG nem WebP, ou o Pillow não consegue decodificar: 422 `avatar_invalid`."""


def process_avatar(data: bytes) -> bytes:
	try:
		with Image.open(io.BytesIO(data), formats=ACCEPTED_FORMATS) as original:
			if original.width * original.height > MAX_AVATAR_PIXELS:
				raise InvalidAvatar("image has too many pixels")
			# foto de celular vem deitada, com a orientação no EXIF: gira antes de o EXIF sumir
			upright = ImageOps.exif_transpose(original)
			# RGBA junta paleta, CMYK, 16 bits e transparência num modo só; o fit recorta ao centro
			square = ImageOps.fit(upright.convert("RGBA"), AVATAR_SIZE)
	# arquivo truncado é OSError, conversão impossível é ValueError, e a bomba não é OSError
	except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as error:
		raise InvalidAvatar(str(error)) from None
	# sem isto, o perfil de cor do original iria junto: só sai o que o servidor desenhou
	square.info.clear()
	out = io.BytesIO()
	square.save(out, "PNG")
	return out.getvalue()
