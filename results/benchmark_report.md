# Velocidad: PyRadiomics frente a JavaScript en Chrome

Medición en la máquina de desarrollo, con tres casos NRRD, imagen original sin filtros, sin normalización ni remuestreo, `binWidth=75`, etiqueta 1. Se calcularon las **seis características de primer orden actualmente implementadas** y las **14 `shape` activas**. La variante JavaScript omitió GLCM para igualar el conjunto de PyRadiomics. Se ejecutó una ronda de calentamiento y cinco rondas medidas sobre imágenes ya cargadas; la tabla usa la mediana de las cinco.

| Caso | PyRadiomics, cálculo | Chrome Web Worker, cálculo | Ventaja JS | Python, carga + cálculo | Chrome, lectura local HTTP + parseo + cálculo |
|---|---:|---:|---:|---:|---:|
| AMC-007 | 2276 ms | 469 ms | 4,86× | 2338 ms | 793 ms |
| AMC-032 | 1985 ms | 470 ms | 4,22× | 2035 ms | 817 ms |
| AMC-041 | 2871 ms | 582 ms | 4,94× | 2929 ms | 1009 ms |

PyRadiomics 3.0.1 se midió con SimpleITK en un hilo y objetos de imagen ya cargados para el cálculo. JavaScript se midió en Chrome 152, dentro de un Web Worker, con NRRD ya parseados para el cálculo. La lectura del navegador se hizo por `fetch` desde `127.0.0.1` con caché desactivada; la aplicación normal usa archivos seleccionados localmente, por lo que esa etapa no es idéntica a abrir archivos con SimpleITK. El parseo NRRD optimizado tardó 64–74 ms; la transferencia local por HTTP, 250–362 ms. En Python, la lectura de ambos NRRD tardó 50–63 ms.

Los resultados son una medición puntual de tres casos y esta selección de 20 características. No predicen el rendimiento de las 107 características completas, otros navegadores, otros tamaños de ROI ni muchas extracciones consecutivas. Los datos crudos están en `benchmark_python.json` y `benchmark_browser.json`. Repetir Python: `.venv/bin/python bench_python.py`. Repetir Chrome: abrir `http://127.0.0.1:8000/browser-spike/bench.html` con el servidor local del proyecto activo.
