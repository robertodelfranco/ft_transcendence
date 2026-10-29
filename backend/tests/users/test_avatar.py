# backend/tests/users/test_avatar.py
# O avatar regravado (i18n.md §2.7): Python puro, sem banco nem rede.

import io
import re

import pytest
from PIL import Image, ImageCms

from app.users.avatar import AVATAR_SIZE, InvalidAvatar, discard_avatar, process_avatar, store_avatar


ORIENTATION, GPS = 0x0112, 0x8825 # tags do EXIF


def encode(image: Image.Image, fmt: str, **options) -> bytes:
	buffer = io.BytesIO()
	image.save(buffer, fmt, **options)
	return buffer.getvalue()


def decode(data: bytes) -> Image.Image:
	return Image.open(io.BytesIO(data))


@pytest.mark.parametrize("fmt", ["PNG", "JPEG", "WEBP"])
def test_accepted_formats_become_a_256_png(fmt):
	avatar = decode(process_avatar(encode(Image.new("RGB", (400, 300), "red"), fmt)))
	assert (avatar.format, avatar.size) == ("PNG", AVATAR_SIZE)


@pytest.mark.parametrize("mode", ["P", "LA", "I;16", "CMYK"])
def test_every_color_mode_ends_up_rgba(mode):
	fmt = "JPEG" if mode == "CMYK" else "PNG"
	assert decode(process_avatar(encode(Image.new(mode, (64, 64)), fmt))).mode == "RGBA"


@pytest.mark.parametrize("data", [
	encode(Image.new("RGB", (64, 64)), "GIF"), # imagem válida, mas fora da lista
	b"<script>alert(1)</script>", # texto com nome de .png
	b"",
	encode(Image.new("RGB", (400, 300)), "PNG")[:60], # cortado ao meio
], ids=["gif", "script", "empty", "truncated"])
def test_anything_else_is_invalid(data):
	with pytest.raises(InvalidAvatar):
		process_avatar(data)


def test_huge_dimensions_are_refused_before_decoding():
	# PNG de 1 bit e uma cor só: poucos KB no arquivo, 20 milhões de pixels depois de aberto
	with pytest.raises(InvalidAvatar):
		process_avatar(encode(Image.new("1", (5000, 4000)), "PNG"))


def test_metadata_does_not_survive():
	exif = Image.Exif()
	exif[GPS] = {1: "S", 2: (23.0, 33.0, 0.0)} # latitude 23° 33' S
	icc = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
	photo = encode(Image.new("RGB", (400, 300)), "JPEG", exif=exif.tobytes(), icc_profile=icc)
	avatar = decode(process_avatar(photo))
	assert avatar.info == {}
	assert not avatar.getexif()


def test_a_sideways_phone_photo_is_turned_upright():
	# gravada deitada, com orientação 6: a metade branca da esquerda tem que ir para o topo
	photo = Image.new("RGB", (400, 300), "blue")
	photo.paste("white", (0, 0, 200, 300))
	exif = Image.Exif()
	exif[ORIENTATION] = 6
	avatar = decode(process_avatar(encode(photo, "JPEG", exif=exif.tobytes())))
	assert min(avatar.getpixel((128, 10))[:3]) > 240 # branco em cima
	red, green, blue, _ = avatar.getpixel((128, 245))
	assert blue > 200 and red < 40 # azul embaixo


def test_a_12_megapixel_phone_photo_is_accepted():
	# 4000 × 3000 passa do limite de bytes lido como pixels, mas não do limite de pixels
	avatar = decode(process_avatar(encode(Image.new("RGB", (4000, 3000)), "JPEG")))
	assert avatar.size == AVATAR_SIZE


def test_each_upload_gets_a_new_name(tmp_path):
	first, second = store_avatar(tmp_path, 7, b"png"), store_avatar(tmp_path, 7, b"png")
	assert first != second
	assert re.fullmatch(r"/media/avatars/7-[0-9a-f]{8}\.png", first)
	assert (tmp_path / "avatars" / first.rsplit("/", 1)[1]).read_bytes() == b"png"


def test_discard_removes_only_uploaded_avatars(tmp_path):
	url = store_avatar(tmp_path, 7, b"png")
	discard_avatar(tmp_path, url)
	assert not any((tmp_path / "avatars").iterdir())
	discard_avatar(tmp_path, url) # já apagado: não é erro
	discard_avatar(tmp_path, None) # o avatar padrão (NULL no banco)
	discard_avatar(tmp_path, "/media/avatars/default.png") # nunca existe no volume
	