# DILSE → landmarks: estado

**Estado: bloqueado por la red del entorno. No se ha descargado ningún vídeo ni generado landmarks.**

Fecha: 2026-09-28

## Comprobación de acceso (paso 1)

```
$ curl -sS -o /dev/null -w "%{http_code}" https://fundacioncnse-dilse.org/
curl: (56) CONNECT tunnel failed, response 403
000
```

Detalle (`curl -v`): el proxy de salida del entorno responde `HTTP/1.1 403 Forbidden`
al `CONNECT fundacioncnse-dilse.org:443`. También falla `https://www.fundacioncnse-dilse.org/`
(mismo error, `000`) y `http://fundacioncnse-dilse.org/` devuelve `403`.

El estado del proxy (`$HTTPS_PROXY/__agentproxy/status`) registra:

```
"kind": "connect_rejected",
"detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
"host": "fundacioncnse-dilse.org:443"
```

Es decir, la política de red del entorno cloud no permite ese dominio; no es un fallo del servidor del DILSE.

## Cómo desbloquearlo

En la configuración del entorno (menú del entorno cloud → *Edit* → *Network access*),
añadir `fundacioncnse-dilse.org` (y `www.fundacioncnse-dilse.org`, más el dominio/CDN donde
estén alojados los vídeos si es distinto) a los dominios permitidos, o usar un nivel de acceso
más amplio. Ver https://code.claude.com/docs/en/claude-code-on-the-web. Después, relanzar esta
misma tarea en una sesión nueva.

## Alcance previsto (para la próxima ejecución)

- Signos objetivo: **348 ids únicos** en `content/curriculum/*.json` (campo `signs`).
- Buscados: 0 · encontrados: 0 · descargados: 0 · con manos detectadas: 0.
- No se ha escrito `dilse/manifest.csv` ni `scripts/dilse_download.py`: sin acceso a la web
  no se pueden conocer los patrones de URL de búsqueda, ficha y vídeo, y no se ha querido
  inventarlos.

## Segundo intento — 2026-09-28 14:06 UTC

Tras el cambio de la red del entorno a *Custom* con `fundacioncnse-dilse.org` permitido,
se relanzó la tarea. El acceso **sigue bloqueado** en esta sesión:

```
$ curl -sS -o /dev/null -w "%{http_code}" https://fundacioncnse-dilse.org/
curl: (56) CONNECT tunnel failed, response 403
000
```

Comprobaciones adicionales (14:06:50 UTC):

| URL | Resultado |
|---|---|
| `https://fundacioncnse-dilse.org/` | `000` — CONNECT 403 |
| `https://www.fundacioncnse-dilse.org/` | `000` — CONNECT 403 |
| `http://fundacioncnse-dilse.org/` | `403` |
| `https://www.cnse.es/` | `000` — CONNECT 403 |
| `https://example.com/` | `000` — CONNECT 403 |

`$HTTPS_PROXY/__agentproxy/status` → `recentRelayFailures`:
`"kind": "connect_rejected", "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)", "host": "fundacioncnse-dilse.org:443"`
(y lo mismo para `www.fundacioncnse-dilse.org:443`, `www.cnse.es:443` y `example.com:443`).

Como hasta `example.com` se rechaza, lo más probable es que **esta sesión se creara con la
política de red anterior** (el cambio de *Network access* se aplica a las sesiones nuevas),
o que la lista *Custom* no se haya guardado. Qué comprobar antes del próximo intento:

1. En *Edit* del entorno → *Network access* = *Custom*, que la lista contenga
   `fundacioncnse-dilse.org` **y** `www.fundacioncnse-dilse.org` (o `*.fundacioncnse-dilse.org`),
   y guardar.
2. Lanzar la tarea en una **sesión nueva** (no reanudar esta).
3. Si los vídeos se sirvieran desde otro dominio/CDN, el script lo anotará aquí; habrá que
   añadirlo también a la lista.

Resultado de este intento: buscados 0 · encontrados 0 · descargados 0 · con manos detectadas 0.
No se han creado `dilse/manifest.csv`, `scripts/dilse_download.py` ni landmarks, por la misma
razón que antes (no se pueden conocer los patrones de URL reales sin acceso a la web).

## Atribución y licencia

Los vídeos de referencia proceden del **Diccionario de la Lengua de Signos Española (DILSE),
Fundación CNSE, CC BY-NC-SA 3.0** (https://fundacioncnse-dilse.org). Los landmarks derivados
que se generen heredarán esa licencia (uso no comercial, compartir igual, con atribución).
