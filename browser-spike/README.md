# Prueba de extracción en navegador

Desde la raíz del proyecto, ejecutar `python3 -m http.server 8000` y abrir `http://localhost:8000/browser-spike/`. El modo **Caso único** permite arrastrar una imagen y su segmentación, o seleccionarlas con el explorador de archivos. Se admiten `.nrrd`, `.nii` y `.nii.gz` para ambos archivos, incluso una pareja con formatos distintos.

El modo **Casos múltiples** acepta una carpeta principal con subcarpetas `images/` y `segmentations/`. También reconoce `masks/`, usada por los ejemplos de `data_radiomics/`. Selecciona la carpeta principal en el control de directorio; la página empareja NRRD o NIfTI por el ID del nombre (`AMC-007_chest_ct_image.nrrd` con `AMC-007_chest_ct_segmentation.nii.gz`). Muestra cada pareja con ambos nombres de archivo, faltantes y duplicados. El botón **Ver** de cada caso carga su imagen y máscara en el mismo visor que usa el modo individual. Las parejas válidas se procesan secuencialmente con los mismos parámetros visibles. Cada caso completado produce una fila en el CSV consolidado, con `case_id` y todas sus características. Un caso con error se muestra en la tabla de estado y no detiene los siguientes; no se incluye en el CSV. El botón Cancelar detiene el cálculo actual y conserva las filas ya terminadas.

Al seleccionar ambos archivos, la página compara dimensiones, sistema de coordenadas, direcciones espaciales y origen. Convierte las coordenadas RAS de NIfTI a LPS para comparar con NRRD. Si no coinciden, muestra el motivo y desactiva la extracción individual; en casos múltiples, informa del problema en el visor y en el resultado de ese caso. La vista previa elige el corte axial positivo más cercano al centro de la máscara. Los presets son partes blandas (nivel 40, ancho 400 HU), pulmón (−600/1500 HU) y ósea (300/1500 HU). El slider ajusta la opacidad roja de la máscara. La vista usa todas las etiquetas positivas; la extracción actual requiere la etiqueta 1 y avisa si faltara.

Los parámetros están reunidos en tres secciones: remuestreo, discretización y filtros. Después de calcular, la lista de características permite filtrar por imagen derivada, familia o nombre. El CSV incluye una fila con todas las características calculadas y el ID sugerido desde la imagen, que puede editarse.

Esta fase admite NRRD 3D raw little endian y NIfTI-1 de archivo único (`.nii` y `.nii.gz`), con tipos escalares habituales, transformaciones sform/qform y escalado de intensidad. Requiere geometría 3D alineada con los ejes y etiqueta 1. No admite NIfTI-2, pares `.hdr/.img`, ni orientación oblicua para extraer. Lee los archivos con la API local del navegador; no hay subida. El cálculo corre en un Web Worker. La máscara se remuestrea siempre con vecino más cercano; el interpolador elegido afecta solo a la imagen.

La lectura NIfTI sigue la [especificación oficial NIfTI-1](https://nifti.nimh.nih.gov/nifti-1/documentation/nifti1fields) y su definición de [qform/sform](https://nifti.nimh.nih.gov/nifti-1/documentation/nifti1fields/nifti1fields_pages/qsform.html/document_view.html).

Controles disponibles: normalización (ninguna, z-score, mín–máx 0–1), remuestreo de vóxel X/Y/Z, interpolación de imagen (vecino más cercano o lineal), `binWidth` y filtros de intensidad. Se calculan las 107 características activas de PyRadiomics 3.0.1 para la imagen original: 18 de primer orden, 14 de forma y 75 de textura. Los filtros disponibles son cuadrado, raíz cuadrada, logaritmo, exponencial, gradiente, wavelet coif1 de nivel 1 (ocho bandas) y LoG con sigma configurable en milímetros. `VoxelCount` es una comprobación adicional.

## Verificación

- `node browser-spike/verify.mjs`: 75 comparaciones sin remuestreo y tres opciones de normalización; error relativo máximo 1,49 × 10⁻⁸.
- `node browser-spike/verify-resampling.mjs`: 50 comparaciones con remuestreo a 1 mm, dos interpoladores y combinaciones con normalización; error relativo máximo 1,30 × 10⁻¹⁴.
- `node browser-spike/verify-entropy.mjs`: seis comparaciones de entropía con `binWidth`.
- `node browser-spike/verify-shape-texture.mjs` y `node browser-spike/verify-shape-texture-extended.mjs`: forma y GLCM sin remuestreo.
- `node browser-spike/verify-sweep.mjs`: 107 características × 72 configuraciones válidas de cinco casos, cuatro tamaños de vóxel y cuatro anchos de bin; 7.704 comparaciones sin discrepancias (interpolación lineal, sin normalización).
- `node browser-spike/verify-filters.mjs`: compara los filtros con PyRadiomics sin remuestreo, a 2 mm y, para dos filtros, con z-score; incluye LoG con sigma de 1 y 2 mm.
- `node browser-spike/verify-batch.mjs`: comprueba el emparejamiento de los cinco ejemplos, faltantes, duplicados y el formato CSV.
- `node browser-spike/verify-nifti.mjs`: comprueba NIfTI `.nii` y `.nii.gz`, sform/qform, escala de intensidad, geometría mixta con NRRD y el visor.
- `node browser-spike/verify-large-roi.mjs`: verifica GLCM con más de 160.000 vóxeles y compara los diámetros de forma con el cálculo exhaustivo. El remuestreo completo a 1 mm también se probó con una ROI sintética de 307.200 vóxeles.

Los valores de referencia están en `../results/browser_reference*.csv` y `../results/parameter_sweep/features.csv`. Forma y GLCM con remuestreo a 2 mm también se compararon en cuatro combinaciones con normalización z-score o mín–máx. A 5 mm, dos casos dejan de cumplir las condiciones mínimas de ROI; la página muestra el error en vez de devolver características.

La implementación de `shape` usa la tabla de marching cubes de PyRadiomics 3.0.1 bajo su licencia BSD (`PYRADIOMICS_LICENSE.txt`). Las características de forma basadas en malla se calculan después de recortar la ROI a su caja mínima, igual que PyRadiomics. El filtro LoG adapta la implementación recursiva de ITK 5.4.0 bajo Apache 2.0 (`ITK_LICENSE.txt`).

El filtro `LBP`, otros tipos y niveles wavelet, y la interpolación B-spline todavía no están implementados. El modo de casos múltiples usa el selector de directorio del navegador (`webkitdirectory`), por lo que requiere un navegador compatible. Todo el procesamiento sigue siendo local.
