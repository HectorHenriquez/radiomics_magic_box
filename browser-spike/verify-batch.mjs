import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {pairFiles,featureCsv} from './batch.mjs';
import {parseNrrd,firstOrder,shapeTexture} from './nrrd.mjs';

const root=new URL('../data_radiomics/',import.meta.url);
const files=[];
for(const folder of ['images','masks'])for(const name of await readdir(new URL(folder+'/',root)))
  files.push({name,webkitRelativePath:`data_radiomics/${folder}/${name}`});
const plan=pairFiles(files);
assert.equal(plan.pairs.length,5);
assert.deepEqual(plan.pairs.map(pair=>pair.id),['AMC-007','AMC-032','AMC-035','AMC-041','R01-091']);
assert.equal(plan.missingMasks.length,0);
assert.equal(plan.missingImages.length,0);
const namedSegmentations=pairFiles(files.map(file=>({...file,webkitRelativePath:file.webkitRelativePath.replace('/masks/','/segmentations/')})));
assert.equal(namedSegmentations.pairs.length,5);
const mixed=pairFiles(files.map(file=>({...file,name:file.name.replace('.nrrd',file.webkitRelativePath.includes('/images/')?'.nii.gz':'.nii')})));
assert.equal(mixed.pairs.length,5);
const absent=pairFiles(files.filter(file=>!file.name.includes('AMC-007_chest_ct_segmentation')));
assert.deepEqual(absent.missingMasks,['AMC-007']);
const duplicate=pairFiles([...files,files.find(file=>file.name==='AMC-007_chest_ct_image.nrrd')]);
assert.equal(duplicate.pairs.length,4);
assert.equal(duplicate.duplicates.length,1);
const csv=featureCsv([{id:'A',features:{z:2,a:1}},{id:'B',features:{a:3}}]);
assert.equal(csv,'"case_id","a","z"\r\n"A","1","2"\r\n"B","3",""');
const rows=[];
for(const pair of plan.pairs){
  const read=async file=>{
    const buffer=await readFile(new URL(file.webkitRelativePath.replace('data_radiomics/',''),root));
    return parseNrrd(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength));
  };
  const image=await read(pair.image),mask=await read(pair.mask);
  const features={...firstOrder(image,mask,1,'none',75),...shapeTexture(image,mask,'none',75)};
  assert.equal(Object.keys(features).length,108);
  rows.push({id:pair.id,features});
}
assert.equal(featureCsv(rows).split('\r\n').length,6);
console.log('Batch: 5 pares extraídos (108 valores cada uno), faltantes, duplicados y CSV correctos.');
