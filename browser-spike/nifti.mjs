// NIfTI-1 single-file volumes. Affines are converted from RAS to the LPS
// coordinates used by the NRRD examples and the extraction engine.
const TYPES={2:[Uint8Array,1],4:[Int16Array,2],8:[Int32Array,4],16:[Float32Array,4],64:[Float64Array,8],256:[Int8Array,1],512:[Uint16Array,2],768:[Uint32Array,4]};
const tuple=values=>`(${values.join(',')})`;
const finite=value=>Number.isFinite(value);

export function parseNifti(buffer){
  if(buffer.byteLength<352)throw Error('Archivo NIfTI incompleto');
  const view=new DataView(buffer);
  const little=view.getInt32(0,true)===348;
  if(!little&&view.getInt32(0,false)!==348)throw Error('Se requiere NIfTI-1 (.nii o .nii.gz)');
  const magic=String.fromCharCode(...new Uint8Array(buffer,344,3));
  if(magic!=='n+1')throw Error('Se requiere NIfTI de archivo único (.nii o .nii.gz)');
  const int16=offset=>view.getInt16(offset,little),float=offset=>view.getFloat32(offset,little);
  if(int16(40)!==3||Array.from({length:4},(_,axis)=>int16(48+axis*2)).some(value=>value>1))
    throw Error('Se requiere un volumen NIfTI 3D');
  const sizes=[int16(42),int16(44),int16(46)];
  if(sizes.some(value=>value<1))throw Error('Dimensiones NIfTI inválidas');
  const datatype=int16(70),spec=TYPES[datatype];
  if(!spec||int16(72)!==spec[1]*8)throw Error(`Tipo NIfTI no admitido: ${datatype}`);
  const count=sizes.reduce((a,b)=>a*b,1),offset=Math.round(float(108));
  if(!Number.isSafeInteger(count)||offset<352||offset+count*spec[1]>buffer.byteLength)
    throw Error('Tamaño de datos NIfTI inesperado');
  const unit=view.getUint8(123)&7;
  const unitScale=unit===1?1000:unit===3?0.001:1;
  const pixdim=Array.from({length:4},(_,axis)=>float(76+axis*4));
  const qform=int16(252),sform=int16(254);
  let directions,origin;
  if(sform>0){
    const rows=[280,296,312].map(base=>Array.from({length:4},(_,axis)=>float(base+axis*4)));
    directions=[0,1,2].map(axis=>rows.map((row,component)=>row[axis]*(component<2?-1:1)*unitScale));
    origin=rows.map((row,component)=>row[3]*(component<2?-1:1)*unitScale);
  }else if(qform>0){
    const [b,c,d]=[float(256),float(260),float(264)];
    const a=Math.sqrt(Math.max(0,1-b*b-c*c-d*d));
    const rotation=[
      [a*a+b*b-c*c-d*d,2*(b*c-a*d),2*(b*d+a*c)],
      [2*(b*c+a*d),a*a+c*c-b*b-d*d,2*(c*d-a*b)],
      [2*(b*d-a*c),2*(c*d+a*b),a*a+d*d-c*c-b*b],
    ];
    directions=[0,1,2].map(axis=>rotation.map((row,component)=>row[axis]*Math.abs(pixdim[axis+1])*(axis===2&&pixdim[0]<0?-1:1)*(component<2?-1:1)*unitScale));
    origin=[float(268),float(272),float(276)].map((value,component)=>value*(component<2?-1:1)*unitScale);
  }else throw Error('NIfTI sin qform ni sform: no se puede comprobar la geometría espacial');
  if([...directions.flat(),...origin].some(value=>!finite(value)))throw Error('Geometría NIfTI inválida');
  const [Type,bytes]=spec;
  let values;
  if(little&&offset%bytes===0)values=new Type(buffer,offset,count);
  else{
    values=new Type(count);
    const readers={1:datatype===256?'getInt8':'getUint8',2:datatype===4?'getInt16':'getUint16',4:datatype===16?'getFloat32':datatype===8?'getInt32':'getUint32',8:'getFloat64'};
    for(let index=0;index<count;index++)values[index]=view[readers[bytes]](offset+index*bytes,little);
  }
  const slope=float(112),intercept=float(116);
  if(finite(slope)&&slope!==0){
    const scaled=new Float64Array(count);
    for(let index=0;index<count;index++)scaled[index]=values[index]*slope+(finite(intercept)?intercept:0);
    values=scaled;
  }
  return {values,sizes,fields:{space:'left-posterior-superior',
    'space directions':directions.map(tuple).join(' '),'space origin':tuple(origin)},format:'NIfTI'};
}

export async function parseVolume(buffer,name=''){
  const lower=name.toLowerCase();
  if(lower.endsWith('.nii.gz')||new Uint8Array(buffer,0,Math.min(2,buffer.byteLength))[0]===31&&new Uint8Array(buffer,0,Math.min(2,buffer.byteLength))[1]===139){
    if(typeof DecompressionStream==='undefined')throw Error('Este navegador no admite descompresión gzip');
    const stream=new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
    buffer=await new Response(stream).arrayBuffer();
  }
  if(new TextDecoder().decode(new Uint8Array(buffer,0,Math.min(4,buffer.byteLength)))==='NRRD'){
    const {parseNrrd}=await import('./nrrd.mjs?v=4');return parseNrrd(buffer);
  }
  return parseNifti(buffer);
}
