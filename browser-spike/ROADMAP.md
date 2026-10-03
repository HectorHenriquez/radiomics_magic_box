# Portabilidad de características PyRadiomics 3.0.1

La referencia sin filtros contiene 107 características activas. Cada familia se incorpora al navegador cuando sus valores coinciden con PyRadiomics en las configuraciones válidas de `results/parameter_sweep/features.csv` y se registran las combinaciones que fallan por ROI insuficiente.

| Familia | Activas en PyRadiomics | Implementadas en navegador | Siguiente trabajo |
|---|---:|---:|---|
| Shape | 14 | 14 | Validar más geometrías y máscaras |
| First order | 18 | 18 | Validar más geometrías y máscaras |
| GLCM | 24 | 24 | Validar otras geometrías y máscaras |
| GLRLM | 16 | 16 | Validar otras geometrías y máscaras |
| GLSZM | 16 | 16 | Validar otras geometrías y máscaras |
| GLDM | 14 | 14 | Validar otras geometrías y máscaras |
| NGTDM | 5 | 5 | Validar otras geometrías y máscaras |

Las 107 características activas de la imagen original están implementadas con los valores por defecto de PyRadiomics 3.0.1: 3D, distancia 1, GLCM simétrica, GLDM con alfa 0 y promedio por dirección. Las 72 configuraciones válidas del barrido coinciden dentro de una tolerancia relativa de 1e-6: 7.704 comparaciones.

La interfaz también ofrece los filtros `Square`, `SquareRoot`, `Logarithm`, `Exponential`, `Gradient`, `Wavelet` (coif1, nivel 1, ocho bandas) y `LoG` con sigma configurable en milímetros. Los filtros se aplican tras la normalización y el remuestreo. En las referencias guardadas de AMC-007, las cinco primeras transformaciones y las ocho bandas wavelet coinciden con PyRadiomics sin remuestreo y a 2 mm; además se verificó `Square` y `Gradient` con z-score a 2 mm. LoG coincide para sigma 1 y 2 mm sin remuestreo y a 2 mm. Otros niveles/tipos wavelet, LBP y B-spline quedan para una siguiente fase.

La familia `shape` está completa respecto a las 14 medidas que PyRadiomics activa por defecto. Las otras tres definiciones (`Compactness1`, `Compactness2`, `SphericalDisproportion`) están marcadas como obsoletas en PyRadiomics y no forman parte de las 107 columnas de referencia.
