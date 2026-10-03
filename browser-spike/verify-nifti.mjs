import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {parseNifti,parseVolume} from './nifti.mjs';
import {parseNrrd,checkGeometry,firstOrder} from './nrrd.mjs';
import {createPreview} from './preview.mjs';

const sizes=[4,4,4],count=64;
function makeNifti(values,{mask=false,origin=[12,24,36],qform=false,scaled=false}={}){
  const buffer=new ArrayBuffer(352+count*2),view=new DataView(buffer);
  view.setInt32(0,348,true);view.setInt16(40,3,true);
  sizes.forEach((size,axis)=>view.setInt16(42+axis*2,size,true));
  view.setInt16(48,1,true);view.setInt16(70,4,true);view.setInt16(72,16,true);
  view.setFloat32(76,1,true);sizes.forEach((_,axis)=>view.setFloat32(80+axis*4,1,true));
  view.setFloat32(108,352,true);view.setUint8(123,2);
  if(scaled){view.setFloat32(112,2,true);view.setFloat32(116,10,true);}
  if(qform){
    view.setInt16(252,1,true);view.setFloat32(264,1,true);
    [-origin[0],-origin[1],origin[2]].forEach((value,axis)=>view.setFloat32(268+axis*4,value,true));
  }else{
    view.setInt16(254,1,true);
    [[-1,0,0,-origin[0]],[0,-1,0,-origin[1]],[0,0,1,origin[2]]].forEach((row,axis)=>
      row.forEach((value,column)=>view.setFloat32(280+axis*16+column*4,value,true)));
  }
  new Uint8Array(buffer,344,3).set([110,43,49]);
  values.forEach((value,index)=>view.setInt16(352+index*2,value,true));
  return buffer;
}
function makeNrrd(values){
  const header=new TextEncoder().encode('NRRD0004\ntype: short\ndimension: 3\nspace: left-posterior-superior\nsizes: 4 4 4\nspace directions: (1,0,0) (0,1,0) (0,0,1)\nspace origin: (12,24,36)\nendian: little\nencoding: raw\n\n');
  const buffer=new ArrayBuffer(header.length+values.length*2),bytes=new Uint8Array(buffer);
  bytes.set(header);values.forEach((value,index)=>new DataView(buffer).setInt16(header.length+index*2,value,true));
  return buffer;
}
const intensities=Array.from({length:count},(_,index)=>index-30);
const labels=Array.from({length:count},(_,index)=>index>=21&&index<=26?1:0);
const image=await parseVolume(makeNifti(intensities),'image.nii');
const mask=await parseVolume(makeNifti(labels,{mask:true}),'mask.nii');
assert.equal(checkGeometry(image,mask).ok,true);
assert.equal(checkGeometry(image,parseNrrd(makeNrrd(labels))).ok,true);
assert.equal(checkGeometry(parseNrrd(makeNrrd(intensities)),mask).ok,true);
assert.equal(checkGeometry(image,parseNifti(makeNifti(labels,{origin:[13,24,36]}))).ok,false);
assert.equal(checkGeometry(image,parseNifti(makeNifti(labels,{qform:true}))).ok,true);
assert.equal(firstOrder(image,mask).VoxelCount,6);
assert.equal(createPreview(image,mask).intensities.length,320*320);
const compressed=gzipSync(Buffer.from(makeNifti(intensities)));
const decoded=await parseVolume(compressed.buffer.slice(compressed.byteOffset,compressed.byteOffset+compressed.byteLength),'image.nii.gz');
assert.deepEqual([...decoded.values],[...image.values]);
assert.equal(parseNifti(makeNifti(intensities,{scaled:true})).values[0],-50);
console.log('NIfTI: .nii, .nii.gz, qform, sform, escala y geometría mixta NRRD correctos.');
