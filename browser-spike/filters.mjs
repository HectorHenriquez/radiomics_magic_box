// Pointwise image types from PyRadiomics 3.0.1 imageoperations.py.
// Coefficients are computed over the whole input image, as in PyRadiomics.
export const POINTWISE_FILTERS = ['square', 'squareroot', 'logarithm', 'exponential', 'gradient'];

const COIF1_LOW=[-0.015655728135791993,-0.07273261951252645,0.3848648468648578,0.8525720202116004,0.3378976624574818,-0.07273261951252645];
const COIF1_HIGH=[0.07273261951252645,0.3378976624574818,-0.8525720202116004,0.3848648468648578,0.07273261951252645,-0.015655728135791993];
const MAX_ABS_CACHE=new WeakMap();

export function waveletImages(image) {
  const [sx,sy,sz]=image.sizes,plane=sx*sy;
  const padded=[sx+(sx%2),sy+(sy%2),sz+(sz%2)];
  const wrap=(coordinate,axis)=>{
    const size=padded[axis],value=((coordinate%size)+size)%size;
    return value===image.sizes[axis]?0:value;
  };
  const bands=[];
  for(const name of ['LLH','LHL','LHH','HLL','HLH','HHL','HHH','LLL']) {
    // pywt.swtn uses axes (x, y, z) in PyRadiomics. Its level-1 SWT
    // convolution uses reversed decomposition taps with offset k-2.
    const taps=name.split('').map(letter=>(letter==='L'?COIF1_LOW:COIF1_HIGH).slice().reverse());
    const cache=new Map();
    const coefficient=index=>{
      if(cache.has(index))return cache.get(index);
      const x=index%sx,y=Math.floor(index/sx)%sy,z=Math.floor(index/plane);
      let sum=0;
      for(let a=0;a<6;a++)for(let b=0;b<6;b++)for(let c=0;c<6;c++){
        const xx=wrap(x+a-2,0),yy=wrap(y+b-2,1),zz=wrap(z+c-2,2);
        sum+=taps[0][a]*taps[1][b]*taps[2][c]*image.values[xx+sx*(yy+sy*zz)];
      }
      cache.set(index,sum);return sum;
    };
    const values=new Proxy({length:image.values.length},{get(target,key){
      if(key==='length')return target.length;
      if(key===Symbol.iterator)return function*(){for(let i=0;i<target.length;i++)yield coefficient(i);};
      if(typeof key==='string'&&/^\d+$/.test(key))return coefficient(Number(key));
      return undefined;
    }});
    bands.push({name:`wavelet-${name}`,image:{...image,values}});
  }
  return bands;
}

export function filteredImage(image, type) {
  if (!POINTWISE_FILTERS.includes(type)) throw Error(`Filtro no admitido: ${type}`);
  if(type==='gradient') {
    const [sx,sy,sz]=image.sizes,plane=sx*sy;
    const spacing=[...image.fields['space directions'].matchAll(/\(([^)]+)\)/g)]
      .map((match,axis)=>Math.abs(Number(match[1].split(',')[axis])));
    const gradient = index => {
      const x=index%sx,y=Math.floor(index/sx)%sy,z=Math.floor(index/plane);
      let squared=0;
      for(const [coordinate,limit,stride,step] of [[x,sx,1,spacing[0]],[y,sy,sx,spacing[1]],[z,sz,plane,spacing[2]]]) {
        const left=image.values[index-(coordinate>0?stride:0)];
        const right=image.values[index+(coordinate<limit-1?stride:0)];
        squared+=((right-left)/(2*step))**2;
      }
      return Math.sqrt(squared);
    };
    const values=new Proxy({length:image.values.length},{get(target,key){
      if(key==='length')return target.length;
      if(key===Symbol.iterator)return function*(){for(let i=0;i<target.length;i++)yield gradient(i);};
      if(typeof key==='string'&&/^\d+$/.test(key))return gradient(Number(key));
      return undefined;
    }});
    return {...image,values};
  }
  let maxAbs=MAX_ABS_CACHE.get(image.values);
  if(maxAbs===undefined) {
    maxAbs=0;
    for(const value of image.values)maxAbs=Math.max(maxAbs,Math.abs(value));
    MAX_ABS_CACHE.set(image.values,maxAbs);
  }
  if (!(maxAbs > 0)) throw Error('El filtro requiere intensidades no nulas');
  const squareScale = 1 / Math.sqrt(maxAbs);
  const logScale = maxAbs / Math.log1p(maxAbs);
  const exponentialScale = Math.log(maxAbs) / maxAbs;
  const transform = value => {
    if (type === 'square') return (squareScale * value) ** 2;
    if (type === 'squareroot') return Math.sign(value) * Math.sqrt(Math.abs(value) * maxAbs);
    if (type === 'logarithm') return Math.sign(value) * Math.log1p(Math.abs(value)) * logScale;
    return Math.exp(exponentialScale * value);
  };
  // The extractor reads intensities only at ROI voxels. A view avoids allocating
  // another full CT volume for each filter.
  const values = new Proxy({length:image.values.length}, {
    get(target, key) {
      if (key === 'length') return target.length;
      if (key === Symbol.iterator) return function* () {
        for (const value of image.values) yield transform(value);
      };
      if (typeof key === 'string' && /^\d+$/.test(key)) return transform(image.values[Number(key)]);
      return undefined;
    },
  });
  return {...image, values};
}
