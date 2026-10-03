import fs from 'node:fs';
import {parseNrrd, firstOrder} from './nrrd.mjs';
const lines = fs.readFileSync('results/browser_reference_normalization.csv', 'utf8').trim().split(/\r?\n/);
const columns = lines[0].split(',');
let checked = 0, worst = 0;
for (const line of lines.slice(1)) {
  const cells = line.split(',');
  const [id, normalization] = cells;
  const read = path => {
    const buffer = fs.readFileSync(path);
    return parseNrrd(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  };
  const image = read(`data_radiomics/images/${id}_chest_ct_image.nrrd`);
  const mask = read(`data_radiomics/masks/${id}_chest_ct_segmentation.nrrd`);
  const values = firstOrder(image, mask, 1, normalization);
  for (let i = 2; i < columns.length; i++) {
    const actual = values[columns[i]], expected = Number(cells[i]);
    const relative = Math.abs(actual - expected) / Math.max(1, Math.abs(expected));
    worst = Math.max(worst, relative);
    if (relative > 1e-6) throw Error(`${id} ${normalization} ${columns[i]}: ${actual} != ${expected}`);
    checked++;
  }
  console.log(`${id} ${normalization}: 5/5 características coinciden`);
}
console.log(`${checked} comparaciones; error relativo máximo ${worst}`);
