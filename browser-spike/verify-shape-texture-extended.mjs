import fs from 'node:fs';
import {parseNrrd, shapeTexture} from './nrrd.mjs';
const lines = fs.readFileSync('results/browser_reference_shape_texture_extended.csv', 'utf8').trim().split(/\r?\n/);
const columns = lines[0].split(',');
let checks = 0, worst = 0;
for (const line of lines.slice(1)) {
  const cells = line.split(','); const id = cells[0];
  const read = path => { const b = fs.readFileSync(path); return parseNrrd(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
  const output = shapeTexture(read(`data_radiomics/images/${id}_chest_ct_image.nrrd`), read(`data_radiomics/masks/${id}_chest_ct_segmentation.nrrd`));
  for (let i = 1; i < columns.length; i++) {
    const difference = Math.abs(output[columns[i]] - Number(cells[i]));
    worst = Math.max(worst, difference);
    if (difference > 1e-10) throw Error(`${id} ${columns[i]}: ${difference}`);
    checks++;
  }
}
console.log(`${checks} comparaciones; diferencia absoluta máxima ${worst}`);
