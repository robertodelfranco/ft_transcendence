"""Avatar enviado → PNG de 256 × 256 que o próprio servidor gerou, gravado no MEDIA_DIR (i18n.md §2.7).

Não conhece FastAPI nem banco, e o teste roda sem subir nada: quem troca a URL no banco é a rota.
"""
import asyncio
import io
import secrets
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path, PurePosixPath

from PIL import Image, ImageOps, UnidentifiedImageError


MAX_AVATAR_BYTES = 2 * 1024 * 1024 # 2 MiB; o Nginx corta em 3m, acima disto, para o 413 sair no envelope
# o Image.open só lê o cabeçalho: um PNG de poucos KB pode declarar 20000 × 20000. O limite do
# próprio Pillow (179 M pixels) passaria de 600 MB no worker único, que também roda o tick do jogo
MAX_AVATAR_PIXELS = 4096 * 4096
AVATAR_SIZE = (256, 256)
ACCEPTED_FORMATS = ("PNG", "JPEG", "WEBP") # O formato lido no conteúdo, não a extensão nem o Content-Type
AVATARS_DIR = "avatars" # dentro do MEDIA_DIR
AVATARS_URL = "/media/avatars" # o Nginx serve o MEDIA_DIR em /media/ (infra.md, decisão 13)
# cada avatar aberto ocupa até ~64 MB: 2 de uma vez seguram a memória numa enxurrada de envios e
# deixam núcleo livre para o tick das Rooms, como o pool do Argon2 (auth/security.py)
AVATAR_WORKERS = 2

_avatar_pool = ThreadPoolExecutor(max_workers=AVATAR_WORKERS, thread_name_prefix="avatar")


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


def store_avatar(media_dir: Path, user_id: int, png: bytes) -> str:
	"""Grava com um nome novo a cada envio (decisão 10): o navegador nunca mostra o antigo por cache."""
	folder = media_dir / AVATARS_DIR
	folder.mkdir(parents=True, exist_ok=True)
	name = f"{user_id}-{secrets.token_hex(4)}.png"
	(folder / name).write_bytes(png)
	return f"{AVATARS_URL}/{name}"


def discard_avatar(media_dir: Path, url: str | None) -> None:
	"""Apaga o arquivo de um avatar enviado. O padrão (NULL no banco) e arquivo que já sumiu não são erro."""
	if url is None or not url.startswith(f"{AVATARS_URL}/"):
		return
	# só o último pedaço da URL: nada fora de avatars/ é apagado
	(media_dir / AVATARS_DIR / PurePosixPath(url).name).unlink(missing_ok=True)


def _process_and_store(data: bytes, media_dir: Path, user_id: int) -> str:
	return store_avatar(media_dir, user_id, process_avatar(data))


async def save_avatar(data: bytes, media_dir: Path, user_id: int) -> str:
	"""Regrava e grava no pool, fora do event loop; devolve a URL do arquivo novo."""
	loop = asyncio.get_running_loop()
	return await loop.run_in_executor(_avatar_pool, _process_and_store, data, media_dir, user_id)
