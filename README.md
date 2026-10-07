# Radiomics Magic Box

Prototipo educativo de extracción radiomics que se ejecuta localmente en el navegador. Admite un caso individual y casos múltiples con imágenes y segmentaciones NRRD o NIfTI; exporta las características a CSV.

## Ejecutar

Desde la raíz del proyecto:

```sh
python3 -m http.server 8000
```

Abrir `http://localhost:8000/browser-spike/`. Consultar [la guía de uso](browser-spike/README.md) para formatos, parámetros y limitaciones.

## Publicar en Cloudflare Pages

La aplicación pública se genera con `python3 scripts/build_pages.py`. El resultado queda en `dist/` e incluye solo la interfaz, sus módulos, imágenes de marca y licencias. No publica los datos de ejemplo, pruebas ni páginas de benchmark.

En Cloudflare Pages, conectar este repositorio de GitHub y configurar:

| Campo | Valor |
| --- | --- |
| Rama de producción | `main` |
| Directorio raíz | raíz del repositorio |
| Comando de build | `python3 scripts/build_pages.py` |
| Directorio de salida | `dist` |

Tras el primer despliegue, añadir `magicbox.learnradiomics.com` en **Custom domains** del proyecto Pages. Si el DNS de `learnradiomics.com` permanece en Hostinger, añadir allí un registro CNAME `magicbox` que apunte al dominio `<proyecto>.pages.dev` asignado por Cloudflare. No es necesario cambiar el alojamiento de WordPress. En WordPress, añadir un enlace o botón a `https://magicbox.learnradiomics.com/`.

Los archivos clínicos se leen y procesan en el navegador; el despliegue sirve únicamente el código estático. El acceso público inicial no requiere base de datos ni autenticación.

## Datos de ejemplo del taller

Los cinco pares en `data_radiomics/` no se incluyen en Git. Las máscaras NRRD binarias se convierten de `unsigned short` a `unsigned char` con `python3 scripts/convert_demo_masks.py`; el script comprueba valores 0/1 y geometría frente a cada CT. `python3 scripts/package_demo.py` crea y verifica `data_radiomics/data_radiomics_demo.zip` con los diez volúmenes. El ZIP tampoco se incluye en Git ni en `dist/`.

La descarga del sitio requiere una función de Cloudflare Pages y un bucket privado de R2:

1. Crear un bucket R2 privado y subir `data_radiomics_demo.zip.part1` y `data_radiomics_demo.zip.part2` a su raíz. El script de empaquetado genera ambas partes, de menos de 300 MB, para permitir la carga desde el panel de Cloudflare. La función las transmite como un único ZIP.
2. En el proyecto Pages, añadir un binding R2 llamado `DEMO_BUCKET` que apunte a ese bucket y configurar el secreto `DEMO_DOWNLOAD_KEY` con la clave del taller. Configurar ambos en el entorno de producción y volver a desplegar.
3. Probar una clave incorrecta (HTTP 403) y la clave correcta (ZIP). No hacer público el bucket ni publicar la clave en el repositorio.

La función `functions/api/demo-download.js` valida la clave en el servidor y transmite el objeto privado. El servidor local `python3 -m http.server` sirve la interfaz, pero no ejecuta esa función; la descarga se prueba en Pages o en un entorno local de Pages Functions.

## Respaldo estable

[`backups/v1.0-stable-2026-10-02.tar.gz`](backups/v1.0-stable-2026-10-02.tar.gz) contiene la versión de caso único previa al modo lote. Ver [`backups/README.md`](backups/README.md) para comprobar su integridad y restaurarla.

## Verificación

Con los cinco casos de ejemplo disponibles localmente:

```sh
node browser-spike/verify-batch.mjs
node browser-spike/verify-nifti.mjs
node browser-spike/verify-large-roi.mjs
node browser-spike/verify-sweep.mjs
node browser-spike/verify-filters.mjs
```

Licencias de componentes adaptados: [`browser-spike/PYRADIOMICS_LICENSE.txt`](browser-spike/PYRADIOMICS_LICENSE.txt) y [`browser-spike/ITK_LICENSE.txt`](browser-spike/ITK_LICENSE.txt).
