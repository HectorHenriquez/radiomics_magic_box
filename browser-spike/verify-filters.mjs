import fs from 'node:fs';
import {parseNrrd,resampledFirstOrder,filteredFeatureSets} from './nrrd.mjs';

const id='AMC-007';
const read=path=>{const b=fs.readFileSync(path);return parseNrrd(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const image=read(`data_radiomics/images/${id}_chest_ct_image.nrrd`);
const mask=read(`data_radiomics/masks/${id}_chest_ct_segmentation.nrrd`);
const image041=read('data_radiomics/images/AMC-041_chest_ct_image.nrrd');
const mask041=read('data_radiomics/masks/AMC-041_chest_ct_segmentation.nrrd');
const checks=[
  ['filter_reference_original.csv',()=>filteredFeatureSets(image,mask,75,['square','squareroot','logarithm','exponential'])],
  ['filter_reference_2mm.csv',()=>resampledFirstOrder(image,mask,[2,2,2],'linear','none',75,true,true,['square','squareroot','logarithm','exponential'])],
  ['filter_reference_gradient_original.csv',()=>filteredFeatureSets(image,mask,75,['gradient'])],
  ['filter_reference_gradient_2mm.csv',()=>resampledFirstOrder(image,mask,[2,2,2],'linear','none',75,true,true,['gradient'])],
  ['filter_reference_zscore_2mm.csv',()=>resampledFirstOrder(image,mask,[2,2,2],'linear','zscore',75,true,true,['square','gradient'])],
  ['filter_reference_zscore_original.csv',()=>filteredFeatureSets(image,mask,75,['square','gradient'],'zscore')],
  ['filter_reference_wavelet_original.csv',()=>filteredFeatureSets(image,mask,75,['wavelet'])],
  ['filter_reference_wavelet_2mm.csv',()=>resampledFirstOrder(image,mask,[2,2,2],'linear','none',75,true,true,['wavelet'])],
  ['filter_reference_log_original.csv',()=>filteredFeatureSets(image,mask,75,['log'],'none',[1,2])],
  ['filter_reference_log_2mm.csv',()=>resampledFirstOrder(image,mask,[2,2,2],'linear','none',75,true,true,['log'],[1,2])],
  ['filter_reference_log_amc041_3mm.csv',()=>resampledFirstOrder(image041,mask041,[3,3,3],'linear','none',50,true,true,['log'],[3])],
];
let compared=0,passed=0,worst=0;const mismatches=[];
for(const [file,extract] of checks) {
  const output=extract();
  const lines=fs.readFileSync(`results/${file}`,'utf8').trim().split(/\r?\n/).slice(1);
  for(const line of lines) {
    const comma=line.indexOf(',');
    const key=line.slice(0,comma),expected=Number(line.slice(comma+1)),actual=output[key];
    const relative=Math.abs(actual-expected)/Math.max(1,Math.abs(expected));
    worst=Math.max(worst,relative);compared++;
    if(relative<1e-6)passed++;else mismatches.push({file,key,actual,expected,relative});
  }
}
console.log(JSON.stringify({compared,passed,failures:mismatches.length,worst,mismatches:mismatches.slice(0,10)},null,2));
if(mismatches.length)process.exitCode=1;
