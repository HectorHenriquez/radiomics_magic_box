# Versión 1.0 estable · 2026-10-02

`v1.0-stable-2026-10-02.tar.gz` conserva la aplicación de **caso único** antes de incorporar el procesamiento por lotes. Incluye `browser-spike/`, las referencias de validación en `results/` y los scripts Python de la raíz. No incluye las imágenes clínicas (`data_radiomics/`), el entorno virtual ni otros archivos de gran tamaño.

Validación antes de crear la copia:

- `node browser-spike/verify-sweep.mjs`: 7704/7704 comparaciones correctas.
- `node browser-spike/verify-filters.mjs`: 3255/3255 comparaciones correctas.

Verificar integridad desde la raíz del proyecto: `shasum -a 256 -c backups/SHA256SUMS`.

Para restaurar sin sobrescribir el trabajo actual: crear un directorio vacío fuera del proyecto y ejecutar allí `tar -xzf /ruta/al/proyecto/backups/v1.0-stable-2026-10-02.tar.gz`. Servir ese directorio por HTTP local y abrir `browser-spike/index.html`.
