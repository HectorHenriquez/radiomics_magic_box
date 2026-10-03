"""Create compact summaries from the PyRadiomics parameter sweep CSV."""
import csv
import statistics
from collections import defaultdict
from pathlib import Path

root = Path('results/parameter_sweep')
with (root / 'features.csv').open(newline='') as f:
    rows = list(csv.DictReader(f))
metrics = ('roi_voxels', 'original_glcm_Contrast', 'original_glcm_JointEntropy',
           'original_glrlm_RunEntropy', 'original_glszm_ZoneEntropy',
           'original_gldm_DependenceEntropy', 'original_ngtdm_Coarseness')
summary = []
for voxel in (1, 2, 3, 5):
    for width in (25, 50, 75, 100):
        group = [r for r in rows if int(r['voxel_mm']) == voxel and int(r['binWidth']) == width]
        ok = [r for r in group if r['status'] == 'ok']
        item = {'voxel_mm': voxel, 'binWidth': width, 'cases_ok': len(ok), 'cases_error': len(group)-len(ok)}
        for key in metrics:
            item['median_' + key] = statistics.median(float(r[key]) for r in ok) if ok else ''
        summary.append(item)
with (root / 'summary.csv').open('w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=summary[0].keys())
    writer.writeheader(); writer.writerows(summary)
print('Wrote 16 configuration summaries')
