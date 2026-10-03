import assert from 'node:assert/strict';
import {glcmFeatures} from './glcm.mjs';
import {shapeDiameters} from './meshShape.mjs';
import {resampledFirstOrder} from './nrrd.mjs';

const size=[64,64,40],count=size.reduce((a,b)=>a*b,1);
const bins=new Map(),selected=[];
for(let index=0;index<count;index++){bins.set(index,index%2+1);selected.push([index,0]);}
const features=glcmFeatures(bins,selected,size);
assert.equal(Number.isFinite(features.original_glcm_Contrast),true);

let seed=123456789;
const random=()=>((seed=1664525*seed+1013904223>>>0)/2**32);
const points=Array.from({length:2400},()=>[
  Math.floor(random()*40),Math.floor(random()*50),Math.floor(random()*60)]);
const expected=[0,0,0,0];
for(let i=0;i<points.length;i++)for(let j=0;j<i;j++){
  const a=points[i],b=points[j];
  const distance=(a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;
  for(let axis=0;axis<3;axis++)if(a[axis]===b[axis])expected[axis]=Math.max(expected[axis],distance);
  expected[3]=Math.max(expected[3],distance);
}
assert.deepEqual(shapeDiameters(points),expected);

const volumeSize=[48,48,32],volumeCount=volumeSize.reduce((a,b)=>a*b,1);
const imageValues=new Int16Array(volumeCount),maskValues=new Uint8Array(volumeCount);
for(let z=0;z<volumeSize[2];z++)for(let y=0;y<volumeSize[1];y++)for(let x=0;x<volumeSize[0];x++){
  const index=x+volumeSize[0]*(y+volumeSize[1]*z);
  imageValues[index]=x+y+z-100;
  maskValues[index]=x>=4&&x<44&&y>=4&&y<44&&z>=4&&z<28?1:0;
}
const fields={space:'left-posterior-superior','space directions':'(2,0,0) (0,2,0) (0,0,2)',
  'space origin':'(0,0,0)'};
const progress=[];
const resampled=resampledFirstOrder({sizes:volumeSize,values:imageValues,fields},
  {sizes:volumeSize,values:maskValues,fields},[1,1,1],'linear','none',75,true,true,[],[1],
  (fraction,label)=>progress.push([fraction,label]));
assert.equal(resampled.VoxelCount,307200);
assert.equal(Object.keys(resampled).length,108);
assert(progress.length>10,'El remuestreo debe informar avances durante el cálculo');
assert(progress.some(([,label])=>label==='GLCM'),'La textura debe informar su fase');
assert(progress.every(([fraction],index)=>fraction>=0&&fraction<=1&&(!index||fraction>=progress[index-1][0])),
  'El avance debe ser monótono y permanecer entre 0 y 1');
console.log(`ROI grande: GLCM con ${count} vóxeles, diámetros exactos con ${points.length} puntos y remuestreo de ${resampled.VoxelCount} vóxeles.`);
