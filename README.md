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

## Datos de ejemplo

Los volúmenes en `data_radiomics/` no se incluyen en el repositorio. Las pruebas de comparación que usan esos casos requieren colocarlos localmente en `data_radiomics/images/` y `data_radiomics/masks/` con los nombres descritos en los scripts de verificación. Los notebooks originales del curso y el entorno virtual local tampoco se incluyen.

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
