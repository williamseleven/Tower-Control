# Torre de Despacho — Tablero automático

Este repositorio genera y publica solo el tablero de despachos cada ~20 minutos,
descargando el CSV de operaciones, procesándolo y publicando el resultado en
GitHub Pages.

## Qué hace

Cada 20 minutos, GitHub Actions:
1. Descarga el CSV desde `https://vtex.brandlive.net/upload/queries/ops-om-ar.csv`
2. Filtra las órdenes de los **últimos 15 días**
3. Aplica todos los mapeos (courier, servicio, MeliFlex, HOP, etc.), deduplica,
   excluye envíos Meli (me2) y calcula alertas de promesa
4. Comprime los datos y arma `index.html`
5. Lo publica en GitHub Pages (un link fijo que siempre muestra la última versión)

---

## Archivos del repo

| Archivo | Qué es |
|---|---|
| `generar_tablero.py` | El script que descarga, procesa y arma el HTML |
| `dashboard.html` | Plantilla visual del tablero (con marcadores `__DATA__` / `__JS__`) |
| `dashboard.js` | Lógica del tablero (filtros, gráficos, export) |
| `requirements.txt` | Librerías de Python que necesita |
| `.github/workflows/actualizar.yml` | El "reloj": corre cada 20 min y publica |

---

## Puesta en marcha (una sola vez)

### 1. Crear el repositorio
Creá un repo nuevo en GitHub (privado o público) y subí **todos** estos archivos,
respetando la carpeta `.github/workflows/`.

### 2. Activar GitHub Pages
- Andá a **Settings → Pages**
- En **Source**, elegí **GitHub Actions**
- Guardá

### 3. Activar los permisos de Actions
- Andá a **Settings → Actions → General**
- En **Workflow permissions**, elegí **Read and write permissions**
- Guardá

### 4. Primera ejecución manual
- Andá a la pestaña **Actions**
- Elegí el workflow **"Actualizar Torre de Despacho"**
- Botón **Run workflow** (esto lo dispara ahora sin esperar los 20 min)
- Cuando termine (tarda 1–3 min), tu tablero queda publicado en:
  `https://TU-USUARIO.github.io/TU-REPO/`

Listo. A partir de ahí se actualiza solo cada ~20 minutos.

---

## Cosas a tener en cuenta

- **El "cada 20 minutos" es aproximado.** El scheduler de GitHub Actions no es
  exacto: en horarios de mucha demanda puede demorar y correr cada 25–40 min.
  Para un tablero operativo suele estar bien.
- **Si el link del CSV pasa a requerir usuario/clave**, hay que agregar
  autenticación en `generar_tablero.py` (buscá la sección de descarga). Hoy el
  link es público.
- **Repo privado + Pages:** en cuentas gratuitas, Pages sobre repo privado puede
  requerir plan pago, o el sitio queda público aunque el repo sea privado.
  Si esto importa, usá repo público (el código no expone datos sensibles) o
  consultá tu plan.
- **Zona horaria:** el corte se muestra en hora de Buenos Aires. El cron del
  workflow está en UTC pero eso no afecta el contenido, solo cuándo corre.

---

## Ajustes rápidos

Editá `generar_tablero.py`, arriba de todo:

- `DAYS_WINDOW = 15` → cambia la ventana de días
- `CSV_URL = ...` → si cambia la fuente de datos
- `HOLIDAY = datetime.date(2026, 7, 9)` (más abajo) → feriado para las alertas

Para cambiar la frecuencia, editá el `cron` en `.github/workflows/actualizar.yml`.
Ejemplos: `*/30 * * * *` (cada 30 min), `0 * * * *` (cada hora en punto).
