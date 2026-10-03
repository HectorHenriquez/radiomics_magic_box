import fs from 'node:fs';
import {parseNrrd, resampledFirstOrder} from './nrrd.mjs';
const lines = fs.readFileSync('results/parameter_sweep/features.csv', 'utf8').trim().split(/\r?\n/);
const columns = lines[0].split(',');
const names = [
  ...columns.filter(name => name.startsWith('original_firstorder_')),
  ...columns.filter(name => name.startsWith('original_shape_')),
  ...columns.filter(name => name.startsWith('original_glcm_')),
  ...columns.filter(name => /original_(glrlm|glszm|gldm|ngtdm)_/.test(name)),
];
let compared = 0, passes = 0, worst = 0;
const mismatches = [];
for (const id of ['AMC-007','AMC-032','AMC-035','AMC-041','R01-091']) {
  const read = path => { const b = fs.readFileSync(path); return parseNrrd(b.buffer.slice(b.byteOffset, b.byteOffset+b.byteLength)); };
  const image = read(`data_radiomics/images/${id}_chest_ct_image.nrrd`);
  const mask = read(`data_radiomics/masks/${id}_chest_ct_segmentation.nrrd`);
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    if (cells[0] !== id || cells[3] !== 'ok') continue;
    const voxel = Number(cells[1]), binWidth = Number(cells[2]);
    const output = resampledFirstOrder(image, mask, [voxel,voxel,voxel], 'linear', 'none', binWidth, true);
    for (const name of names) {
      const expected = Number(cells[columns.indexOf(name)]), actual = output[name];
      const relative = Math.abs(actual-expected) / Math.max(1,Math.abs(expected));
      worst = Math.max(worst,relative);
      if (relative < 1e-6) passes++;
      else mismatches.push({id,voxel,binWidth,name,actual,expected,relative});
      compared++;
    }
  }
}
console.log(JSON.stringify({compared,passes,failures:mismatches.length,worst,mismatches:mismatches.slice(0,15)},null,2));
if (mismatches.length) process.exitCode = 1;
