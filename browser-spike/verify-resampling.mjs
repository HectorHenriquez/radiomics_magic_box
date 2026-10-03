import fs from 'node:fs';
import {parseNrrd, resampledFirstOrder} from './nrrd.mjs';
let checks = 0, worst = 0;
for (const file of ['results/browser_reference_resampling.csv', 'results/browser_reference_resampling_normalized.csv']) {
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const columns = lines[0].split(',');
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    const [id, setting] = cells;
    const read = path => { const b = fs.readFileSync(path); return parseNrrd(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
    const image = read(`data_radiomics/images/${id}_chest_ct_image.nrrd`);
    const mask = read(`data_radiomics/masks/${id}_chest_ct_segmentation.nrrd`);
    const normalized = file.includes('normalized');
    const values = resampledFirstOrder(image, mask, [1,1,1], normalized ? 'linear' : setting === 'sitkLinear' ? 'linear' : 'nearest', normalized ? setting : 'none');
    for (let i = 2; i < columns.length; i++) {
      const expected = Number(cells[i]), actual = values[columns[i]];
      const relative = Math.abs(actual - expected) / Math.max(1, Math.abs(expected));
      worst = Math.max(worst, relative);
      if (relative > 1e-6) throw Error(`${id} ${setting} ${columns[i]} ${actual} != ${expected}`);
      checks++;
    }
    console.log(`${id} ${setting}: 5/5`);
  }
}
console.log(`${checks} comparaciones; error relativo máximo ${worst}`);
