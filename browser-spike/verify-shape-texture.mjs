import fs from 'node:fs';
import {parseNrrd, shapeTexture} from './nrrd.mjs';
const lines = fs.readFileSync('results/browser_reference_shape_texture.csv', 'utf8').trim().split(/\r?\n/);
const columns = lines[0].split(',');
let checks = 0, worst = 0;
for (const line of lines.slice(1)) {
  const cells = line.split(',');
  const [id, normalization, width] = cells;
  const read = path => { const b = fs.readFileSync(path); return parseNrrd(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
  const image = read(`data_radiomics/images/${id}_chest_ct_image.nrrd`);
  const mask = read(`data_radiomics/masks/${id}_chest_ct_segmentation.nrrd`);
  const output = shapeTexture(image, mask, normalization, Number(width));
  for (let i = 3; i < columns.length; i++) {
    const difference = Math.abs(output[columns[i]] - Number(cells[i]));
    worst = Math.max(worst, difference);
    if (difference > 1e-10) throw Error(`${id} ${normalization} ${columns[i]}: ${difference}`);
    checks++;
  }
  console.log(`${id} ${normalization}: 3/3`);
}
console.log(`${checks} comparaciones; diferencia absoluta máxima ${worst}`);
