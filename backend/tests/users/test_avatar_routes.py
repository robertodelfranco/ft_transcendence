# backend/tests/users/test_avatar_routes.py
# PUT e DELETE /api/users/me/avatar (i18n.md §2.7) contra o Postgres, com o MEDIA_DIR numa pasta temporária.
import io
import re

import pytest
from PIL import Image

from app.auth.models import User
from app.auth.security import create_access_token
from app.core.config import Settings
from app.users.avatar import MAX_AVATAR_BYTES


pytestmark = pytest.mark.anyio

URL = "/api/users/me/avatar"
DEFAULT = "/media/avatars/default.png"


@pytest.fixture
def settings(tmp_path):
	# substitui a do conftest: o app grava os avatares aqui, e não em /media
	return Settings(app_env="test", media_dir=tmp_path)


@pytest.fixture
async def caio(db_session, app):
	user = User(email="caio@example.com", username="caio")
	db_session.add(user)
	await db_session.flush()
	secret = app.state.settings.jwt_secret.get_secret_value()
	return user, {"Authorization": f"Bearer {create_access_token(user.id, secret, 900)}"}


def png() -> bytes:
	buffer = io.BytesIO()
	Image.new("RGB", (400, 300), "red").save(buffer, "PNG")
	return buffer.getvalue()


async def upload(client, auth, data: bytes):
	return await client.put(URL, headers=auth, files={"file": ("foto.png", data, "image/png")})


def stored(tmp_path) -> list[str]:
	folder = tmp_path / "avatars"
	return sorted(path.name for path in folder.iterdir()) if folder.exists() else []


async def test_upload_stores_a_new_png_and_points_the_user_to_it(client, db_session, caio, tmp_path):
	user, auth = caio
	response = await upload(client, auth, png())
	assert response.status_code == 200
	url = response.json()["avatar_url"]
	assert re.fullmatch(rf"/media/avatars/{user.id}-[0-9a-f]{{8}}\.png", url)
	assert stored(tmp_path) == [url.rsplit("/", 1)[1]]
	await db_session.refresh(user)
	assert user.avatar_url == url


async def test_a_new_upload_removes_the_old_file(client, caio, tmp_path):
	_, auth = caio
	first = (await upload(client, auth, png())).json()["avatar_url"]
	second = (await upload(client, auth, png())).json()["avatar_url"]
	assert first != second # nome novo: o navegador não mostra o antigo por cache
	assert stored(tmp_path) == [second.rsplit("/", 1)[1]]


async def test_the_type_comes_from_the_content_not_the_name(client, caio, tmp_path):
	_, auth = caio
	response = await upload(client, auth, b"<script>alert(1)</script>") # chega como foto.png
	assert (response.status_code, response.json()["error"]["code"]) == (422, "avatar_invalid")
	assert stored(tmp_path) == []


async def test_above_2_mib_is_413_before_decoding(client, caio, tmp_path):
	_, auth = caio
	response = await upload(client, auth, b"\0" * (MAX_AVATAR_BYTES + 1))
	assert (response.status_code, response.json()["error"]["code"]) == (413, "avatar_too_large")
	assert stored(tmp_path) == []


async def test_without_the_file_field_is_422(client, caio):
	_, auth = caio
	response = await client.put(URL, headers=auth)
	error = response.json()["error"]
	assert (response.status_code, error["code"], error["fields"]) == (422, "validation_error", {"file": "required"})


# refresh: a trava da linha (FOR UPDATE); commit: a troca da URL. O PNG já está gravado nos dois
@pytest.mark.parametrize("step", ["refresh", "commit"])
async def test_a_database_failure_leaves_no_file_behind(client, db_session, caio, tmp_path, monkeypatch, step):
	_, auth = caio

	async def broken(*args, **kwargs):
		raise RuntimeError("database went away")

	monkeypatch.setattr(db_session, step, broken)
	response = await upload(client, auth, png())
	assert response.status_code == 500
	assert stored(tmp_path) == []


async def test_the_eleventh_upload_in_a_minute_is_429(client, caio):
	_, auth = caio
	codes = [(await upload(client, auth, b"x")).status_code for _ in range(11)]
	assert codes == [422] * 10 + [429] # conta o pedido, não o sucesso


async def test_delete_goes_back_to_the_default(client, db_session, caio, tmp_path):
	user, auth = caio
	await upload(client, auth, png())
	response = await client.delete(URL, headers=auth)
	assert (response.status_code, response.json()["avatar_url"]) == (200, DEFAULT)
	assert stored(tmp_path) == []
	await db_session.refresh(user)
	assert user.avatar_url is None # o banco guarda NULL; a URL do padrão vem do serializador


async def test_delete_without_an_avatar_is_not_an_error(client, caio):
	_, auth = caio
	response = await client.delete(URL, headers=auth)
	assert (response.status_code, response.json()["avatar_url"]) == (200, DEFAULT)


async def test_avatar_routes_need_a_session(client):
	assert (await client.put(URL, files={"file": ("foto.png", png(), "image/png")})).status_code == 401
	assert (await client.delete(URL)).status_code == 401
	
