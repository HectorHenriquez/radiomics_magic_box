// SPDX-License-Identifier: Apache-2.0
// Port of ITK 5.4.0 RecursiveGaussianImageFilter and
// LaplacianRecursiveGaussianImageFilter for the 3D PyRadiomics LoG path.
// Source: https://github.com/InsightSoftwareConsortium/ITK/tree/v5.4.0

const PARAMETERS={
  zero:[[1.3530,1.8151],[-0.3531,0.0902]],
  second:[[-1.3563,5.2318],[0.3446,-2.2355]],
};
const W1=0.6681,L1=-1.3932,W2=2.0787,L2=-1.3732;

function coefficients(sigma,spacing,order) {
  const sd=sigma/spacing;
  const sin1=Math.sin(W1/sd),sin2=Math.sin(W2/sd),cos1=Math.cos(W1/sd),cos2=Math.cos(W2/sd);
  const e1=Math.exp(L1/sd),e2=Math.exp(L2/sd);
  const d4=e1*e1*e2*e2;
  const d3=-2*cos1*e1*e2*e2-2*cos2*e2*e1*e1;
  const d2=4*cos2*cos1*e1*e2+e1*e1+e2*e2;
  const d1=-2*(e2*cos2+e1*cos1);
  const SD=1+d1+d2+d3+d4,DD=d1+2*d2+3*d3+4*d4,ED=d1+4*d2+9*d3+16*d4;
  const compute=([A1,B1],[A2,B2])=>{
    const n0=A1+A2;
    const n1=e2*(B2*sin2-(A2+2*A1)*cos2)+e1*(B1*sin1-(A1+2*A2)*cos1);
    const n2=2*e1*e2*((A1+A2)*cos2*cos1-B1*cos2*sin1-B2*cos1*sin2)+A2*e1*e1+A1*e2*e2;
    const n3=e2*e1*e1*(B2*sin2-A2*cos2)+e1*e2*e2*(B1*sin1-A1*cos1);
    return {n:[n0,n1,n2,n3],SN:n0+n1+n2+n3,DN:n1+2*n2+3*n3,EN:n1+4*n2+9*n3};
  };
  const smooth=compute(...PARAMETERS.zero);
  let raw,scale;
  if(order===0) {
    raw=smooth;scale=1/(2*smooth.SN/SD-smooth.n[0]);
  } else {
    const second=compute(...PARAMETERS.second);
    const beta=-(2*second.SN-SD*second.n[0])/(2*smooth.SN-SD*smooth.n[0]);
    const n=second.n.map((v,k)=>v+beta*smooth.n[k]);
    const SN=second.SN+beta*smooth.SN,DN=second.DN+beta*smooth.DN,EN=second.EN+beta*smooth.EN;
    const alpha=(EN*SD*SD-ED*SN*SD-2*DN*DD*SD+2*DD*DD*SN)/(SD**3);
    raw={n};scale=sigma*sigma/alpha;
  }
  const n=raw.n.map(v=>v*scale);
  const m=[n[1]-d1*n[0],n[2]-d2*n[0],n[3]-d3*n[0],-d4*n[0]];
  const d=[d1,d2,d3,d4];
  const SN=n.reduce((a,b)=>a+b,0),SM=m.reduce((a,b)=>a+b,0);
  const bn=d.map(v=>v*SN/SD),bm=d.map(v=>v*SM/SD);
  return {n,m,d,bn,bm};
}

function filterLine(data,c) {
  const length=data.length,forward=new Float64Array(length),backward=new Float64Array(length);
  const first=data[0],last=data[length-1];
  for(let i=0;i<length;i++) {
    let value=0;
    for(let k=0;k<4;k++)value+=c.n[k]*data[Math.max(0,i-k)];
    for(let k=1;k<=4;k++)value-=i-k>=0?c.d[k-1]*forward[i-k]:c.bn[k-1]*first;
    forward[i]=value;
  }
  for(let i=length-1;i>=0;i--) {
    let value=0;
    for(let k=1;k<=4;k++)value+=c.m[k-1]*data[Math.min(length-1,i+k)];
    for(let k=1;k<=4;k++)value-=i+k<length?c.d[k-1]*backward[i+k]:c.bm[k-1]*last;
    backward[i]=value;
  }
  const out=new Float32Array(length);
  for(let i=0;i<length;i++)out[i]=forward[i]+backward[i];
  return out;
}

function filterAxis(input,size,axis,c) {
  const output=new Float32Array(input.length),stride=axis===0?1:axis===1?size[0]:size[0]*size[1];
  const length=size[axis];
  const line=new Float64Array(length);
  for(let start=0;start<input.length;start++) {
    if(Math.floor(start/stride)%length!==0)continue;
    for(let i=0;i<length;i++)line[i]=input[start+i*stride];
    const out=filterLine(line,c);
    for(let i=0;i<length;i++)output[start+i*stride]=out[i];
  }
  return output;
}

function spacingOf(image) {
  return [...image.fields['space directions'].matchAll(/\(([^)]+)\)/g)]
    .map((match,axis)=>Math.abs(Number(match[1].split(',')[axis])));
}

export function laplacianRecursiveGaussian(image,mask,sigma) {
  if(!(sigma>0))throw Error('LoG requiere sigma positivo');
  const spacing=spacingOf(image),[sx,sy,sz]=image.sizes,plane=sx*sy;
  if(image.sizes.some((n,axis)=>n<4||n<Math.ceil(sigma/spacing[axis])+1))
    throw Error(`Imagen demasiado pequeña para LoG con sigma ${sigma} mm`);
  const low=[sx,sy,sz],high=[-1,-1,-1];
  for(let index=0;index<mask.values.length;index++)if(mask.values[index]===1) {
    const xyz=[index%sx,Math.floor(index/sx)%sy,Math.floor(index/plane)];
    for(let a=0;a<3;a++){low[a]=Math.min(low[a],xyz[a]);high[a]=Math.max(high[a],xyz[a]);}
  }
  if(high[0]<0)throw Error('Etiqueta 1 ausente');
  // Without resampling PyRadiomics filters the entire CT before cropping.
  // The recursive response decays exponentially; a wide halo reproduces its
  // ROI values while avoiding a full-volume float32 allocation.
  const halo=spacing.map(v=>Math.ceil(16*sigma/v)+8);
  const from=low.map((v,a)=>Math.max(0,v-halo[a]));
  const to=high.map((v,a)=>Math.min(image.sizes[a]-1,v+halo[a]));
  const size=from.map((v,a)=>to[a]-v+1);
  if(size.some(v=>v<4))throw Error('LoG necesita al menos cuatro vóxeles por eje');
  const count=size.reduce((a,b)=>a*b,1);
  const input=new Float32Array(count),croppedMask=new Uint8Array(count);
  for(let z=0;z<size[2];z++)for(let y=0;y<size[1];y++)for(let x=0;x<size[0];x++) {
    const dest=x+size[0]*(y+size[1]*z),source=x+from[0]+sx*(y+from[1]+sy*(z+from[2]));
    input[dest]=image.values[source];croppedMask[dest]=mask.values[source]===1?1:0;
  }
  const result=new Float32Array(count);
  for(let derivative=0;derivative<3;derivative++) {
    let current=filterAxis(input,size,derivative,coefficients(sigma,spacing[derivative],2));
    for(let axis=0;axis<3;axis++)if(axis!==derivative)
      current=filterAxis(current,size,axis,coefficients(sigma,spacing[axis],0));
    const factor=1/spacing[derivative]**2;
    for(let i=0;i<count;i++)result[i]=Math.fround(result[i]+Math.fround(current[i]*factor));
  }
  const fields={...image.fields,'space origin':'(0,0,0)'};
  return {image:{values:result,sizes:size,fields},mask:{values:croppedMask,sizes:size,fields}};
}
