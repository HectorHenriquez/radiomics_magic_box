# Referencia PyRadiomics: tamaño de vóxel y discretización

Se ejecutaron cinco pares NRRD con PyRadiomics 3.0.1 y SimpleITK 2.5.5. Cada caso se procesó con vóxeles isotrópicos de 1, 2, 3 y 5 mm y `binWidth` de 25, 50, 75 y 100: 80 combinaciones solicitadas.

Parámetros fijos: imagen original, sin filtros, sin normalización, interpolación lineal de imagen, vecino más cercano para máscara, etiqueta 1 y las siete clases (`shape`, `firstorder`, `glcm`, `glrlm`, `glszm`, `gldm`, `ngtdm`). Se eligió no normalizar para conservar la escala de intensidad de TC y evaluar `binWidth` en esa escala. Estas referencias no sustituyen la configuración normalizada previa.

## Archivos

- `features.csv`: 80 filas, con estado, error, recuento de vóxeles ROI y hasta 107 características por fila.
- `key_metrics.csv`: selección de medidas útiles para revisar variación.
- `summary.csv`: mediana entre casos válidos por configuración; incluye el número de casos exitosos.
- `parameter_sweep.xlsx`: los tres CSV y errores en hojas separadas.
- `errors.json`: fallos completos.
- `manifest.json`: versiones y parámetros.

## Resultado

Hubo 72 ejecuciones válidas y ocho fallidas. A 5 mm, AMC-032 quedó con un solo vóxel segmentado y AMC-035 con una ROI de una sola dimensión; fallaron para los cuatro valores de `binWidth`. Las otras tres ROI a 5 mm tienen solo 4, 5 y 4 vóxeles, respectivamente. Por eso las texturas a 5 mm requieren interpretación especialmente cauta, aunque el extractor devuelva números.

La mediana de vóxeles de ROI entre casos válidos pasó de 315 (1 mm) a 47 (2 mm), 12 (3 mm) y 4 (5 mm). Esta reducción explica parte de la variación de textura. Por ejemplo, la mediana de `original_glcm_JointEntropy` con `binWidth=25` fue 6,824 a 1 mm, 5,168 a 2 mm, 2,737 a 3 mm y 1,187 a 5 mm; la última cifra usa tres casos en lugar de cinco. A 1 mm, esa mediana bajó de 6,824 a 3,452 cuando `binWidth` aumentó de 25 a 100. Son cambios descriptivos del cálculo, no evidencia de que una configuración sea mejor para modelar.

La implementación actual del navegador se contrastó contra las 72 filas válidas: 23 características × 72 configuraciones = 1656 valores, sin discrepancias a una tolerancia relativa de 10⁻⁶ (`node browser-spike/verify-sweep.mjs`). El error relativo máximo observado fue 3,23 × 10⁻¹⁵. Las 14 características `shape` activas están incluidas. El navegador también reproduce los dos errores de ROI a 5 mm. Esto cubre interpolación lineal sin normalización; las 107 características completas siguen correspondiendo a PyRadiomics.

Reproducir la matriz: `.venv/bin/python sweep_pyradiomics.py`. Regenerar el resumen: `python3 summarize_sweep.py`.
