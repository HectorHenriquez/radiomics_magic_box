import fs from 'node:fs';
import {parseNrrd, firstOrder, resampledFirstOrder} from './nrrd.mjs';
const lines = fs.readFileSync('results/browser_reference_entropy.csv', 'utf8').trim().split(/\r?\n/);
let checks = 0;
for (const line of lines.slice(1)) {
  const [id, method, resample, width, target] = line.split(',');
  const read = path => { const b = fs.readFileSync(path); return parseNrrd(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
  const image = read(`data_radiomics/images/${id}_chest_ct_image.nrrd`);
  const mask = read(`data_radiomics/masks/${id}_chest_ct_segmentation.nrrd`);
  const output = resample === 'True'
    ? resampledFirstOrder(image, mask, [1,1,1], 'linear', method, Number(width))
    : firstOrder(image, mask, 1, method, Number(width));
  const difference = Math.abs(output.original_firstorder_Entropy - Number(target));
  if (difference > 1e-10) throw Error(`${id} ${method} remuestreo=${resample}: ${difference}`);
  checks++;
}
console.log(`${checks} valores de entropía coinciden con PyRadiomics`);
