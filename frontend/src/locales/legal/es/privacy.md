Última actualización: 4 de noviembre de 2026.

Esta política explica qué datos guarda Catacombs 42 sobre ti, para qué sirven, cuánto tiempo se guardan y cómo pedir que se borren.

## Quiénes somos

Catacombs 42 es un proyecto académico de cinco estudiantes de 42, hecho para ft_transcendence, el proyecto final del tronco común de la escuela. El sitio no tiene fines comerciales, no muestra anuncios y no vende ni cede datos a nadie. Todo lo que se describe aquí se queda en el servidor que ejecuta el juego.

## Datos de la cuenta

Al crear tu cuenta, guardamos:

- **correo electrónico**, para que puedas iniciar sesión y para identificar la cuenta. Solo tú ves tu correo;
- **nombre de usuario**, que ven los demás jugadores;
- **contraseña**, guardada solo como hash Argon2id, un resumen del que no se puede recuperar la contraseña. La contraseña en sí nunca se guarda. Las cuentas creadas con el inicio de sesión de 42 no tienen contraseña;
- **idioma preferido**: portugués, inglés o español;
- **avatar**, si subes uno. El servidor vuelve a dibujar la imagen como PNG de 256 × 256 píxeles y descarta los metadatos del archivo original, como la ubicación y el modelo de la cámara. Al cambiar o quitar el avatar, el archivo anterior se borra;
- **fecha de creación de la cuenta** y **fecha de la última conexión**.

Por cada sesión abierta, es decir, cada navegador en el que iniciaste sesión, guardamos también cuándo empezó y la identificación del navegador (el User-Agent, que indica el navegador y el sistema operativo), para investigar problemas de inicio de sesión.

## Juego y amigos

Mientras se juega una partida, no se guarda nada: el estado del juego vive solo en la memoria del servidor. Cuando termina, guardamos el resultado: modo, mapa, opciones de la sala, hora de inicio y de fin, quién jugó y, para cada jugador, victoria o derrota, bajas, muertes, daño causado y recibido, llaves recogidas, pociones usadas, XP y Elo. Las partidas interrumpidas no aparecen en el historial de nadie.

A partir de las partidas calculamos tus estadísticas, tu XP, nivel, Elo y logros. Tu nombre de usuario, avatar, estadísticas, historial de partidas, logros y posición en la clasificación son visibles para otras personas en el sitio.

Cuando agregas a alguien a tus amigos, guardamos ese vínculo. La amistad es unidireccional: la otra persona no necesita aceptar. Quien te agregó a sus amigos ve si estás en línea en ese momento. Por ahora no hay opción para ocultar ese estado.

## Inicio de sesión con 42

Si inicias sesión con 42, el sitio recibe de la intra tu identificador de 42, tu correo y tu login. El identificador vincula tu cuenta de 42 con la cuenta del juego; el correo crea o encuentra esa cuenta (si ya existe una cuenta con el mismo correo, las dos pasan a ser una sola); y el login se convierte en la sugerencia de nombre de usuario. La foto de la intra no se convierte en avatar. El token que entrega 42 se usa solo durante el inicio de sesión y se descarta enseguida: el sitio no guarda ningún acceso a tu cuenta de 42.

## Cookies y almacenamiento local

El sitio usa dos cookies, ambas necesarias para iniciar sesión, y guarda un dato en tu navegador:

- `refresh_token` mantiene tu sesión iniciada. La página no puede leerla (HttpOnly), solo viaja por HTTPS y solo se envía a las rutas de inicio de sesión del propio sitio. Dura 7 días y se cambia por una nueva cada vez que se usa; cerrar sesión la borra. En el servidor, guardamos solo un hash de ella;
- `oauth_state` existe solo mientras inicias sesión con 42, durante 10 minutos como máximo, para confirmar que la respuesta de 42 corresponde al inicio de sesión que empezaste;
- `localStorage["lang"]` guarda el idioma que elegiste, para que el sitio se abra en él la próxima vez. Ese valor se queda solo en tu navegador.

La clave de acceso de corta duración (15 minutos) se guarda solo en la memoria de la página y desaparece al cerrarla. No usamos cookies de terceros, anuncios ni herramientas de analítica, y la página no carga scripts de otros sitios.

## Registros y métricas

Para mantener el sitio en funcionamiento y protegerlo de abusos, el servidor registra:

- **registro de acceso**: en cada solicitud, la dirección IP, la fecha y la hora, la dirección a la que se accedió y la identificación del navegador;
- **límite de intentos**: los intentos de inicio de sesión y de registro se cuentan por dirección IP, para frenar a quien intenta adivinar contraseñas. El conteo vive solo en la memoria del servidor, y cada intento se olvida al cabo de un minuto;
- **métricas**: cifras sobre el funcionamiento del servidor, como la cantidad de solicitudes, de partidas en curso y de conexiones, el tiempo de procesamiento y el uso de CPU y memoria. Las métricas no contienen ningún dato personal y se guardan durante 7 días.

Los registros se quedan solo en el servidor y se descartan cada vez que se reinstala o se actualiza.

## Cuánto tiempo guardamos los datos y cómo pedir su eliminación

Los datos de la cuenta, de las partidas y de las amistades se guardan mientras exista la cuenta. El sitio no tiene un botón para eliminar la cuenta: para hacerlo, escribe a **catacombs42@student.42.fr** desde el correo de la cuenta. En un plazo de 15 días, borramos tu correo, tu contraseña, tu avatar, tus sesiones, el vínculo con 42 y tus amistades, y cambiamos tu nombre de usuario por un nombre anónimo. Las partidas en las que participaste siguen en el historial de los demás jugadores, sin nada que te identifique.

Si esta política cambia, la fecha al principio de la página cambia también.
