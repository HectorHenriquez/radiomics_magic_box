"""Warm in-memory benchmark for first-order plus shape in PyRadiomics."""
import json
import statistics
import time
from pathlib import Path

import SimpleITK as sitk
import radiomics
from radiomics import featureextractor

CASES = ('AMC-007', 'AMC-032', 'AMC-041')
FIRST_ORDER = ['Mean', 'Median', 'Minimum', 'Maximum', 'Variance', 'Entropy']
PARAMS = {'imageType': {'Original': {}},
          'setting': {'normalize': False, 'binWidth': 75, 'label': 1, 'additionalInfo': False},
          'featureClass': {'shape': [], 'firstorder': FIRST_ORDER}}
sitk.ProcessObject.SetGlobalDefaultNumberOfThreads(1)
extractor = featureextractor.RadiomicsFeatureExtractor(PARAMS)
rows = []
for case in CASES:
    start = time.perf_counter()
    image = sitk.ReadImage(f'data_radiomics/images/{case}_chest_ct_image.nrrd')
    mask = sitk.ReadImage(f'data_radiomics/masks/{case}_chest_ct_segmentation.nrrd')
    load_ms = (time.perf_counter() - start) * 1000
    extractor.execute(image, mask)
    times = []
    for _ in range(5):
        start = time.perf_counter()
        extractor.execute(image, mask)
        times.append((time.perf_counter() - start) * 1000)
    rows.append({'case': case, 'load_ms': load_ms,
                 'extract_median_ms': statistics.median(times), 'extract_times_ms': times})
result = {'engine': 'PyRadiomics', 'version': radiomics.__version__,
          'settings': PARAMS, 'rows': rows,
          'overall_extract_median_ms': statistics.median(r['extract_median_ms'] for r in rows)}
Path('results/benchmark_python.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result, indent=2))
