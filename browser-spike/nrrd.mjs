import {meshShape} from './meshShape.mjs?v=5';
import {textureFeatures} from './texture.mjs';
import {glcmFeatures} from './glcm.mjs?v=5';
import {filteredImage, POINTWISE_FILTERS, waveletImages} from './filters.mjs';
import {laplacianRecursiveGaussian} from './logFilter.mjs';

const TYPES = {
  short: Int16Array, 'signed short': Int16Array, int16: Int16Array,
  'unsigned short': Uint16Array, ushort: Uint16Array, uint16: Uint16Array,
  char: Int8Array, 'unsigned char': Uint8Array,
  float: Float32Array, double: Float64Array
};

export function parseNrrd(buffer) {
  const bytes = new Uint8Array(buffer);
  if (new TextDecoder().decode(bytes.subarray(0, 4)) !== 'NRRD') throw Error('Archivo NRRD inválido');
  let offset = -1;
  for (let i = 0; i < Math.min(bytes.length - 1, 16384); i++) {
    if (bytes[i] === 10 && bytes[i + 1] === 10) { offset = i + 2; break; }
    if (i + 3 < bytes.length && bytes[i] === 13 && bytes[i+1] === 10 && bytes[i+2] === 13 && bytes[i+3] === 10) { offset = i + 4; break; }
  }
  if (offset < 0) throw Error('Encabezado NRRD incompleto');
  const header = new TextDecoder().decode(bytes.subarray(0, offset));
  const fields = {};
  for (const line of header.split(/\r?\n/)) {
    const index = line.indexOf(':');
    if (index > 0 && !line.startsWith('#')) fields[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
  }
  if (fields.encoding !== 'raw') throw Error('Esta prueba admite NRRD raw sin compresión');
  if (fields.endian !== 'little' && !(TYPES[fields.type?.toLowerCase()]?.BYTES_PER_ELEMENT===1 && !fields.endian))
    throw Error('Esta prueba admite little endian');
  if (Number(fields.dimension) !== 3) throw Error('Se requiere un volumen 3D');
  const Type = TYPES[fields.type?.toLowerCase()];
  if (!Type) throw Error(`Tipo NRRD no admitido: ${fields.type}`);
  const sizes = fields.sizes.split(/\s+/).map(Number);
  const count = sizes.reduce((a, b) => a * b, 1);
  if (!sizes.every(Number.isSafeInteger) || count * Type.BYTES_PER_ELEMENT !== bytes.length - offset) throw Error('Tamaño de datos NRRD inesperado');
  // Most NRRDs can be viewed without copying. An unaligned header needs one
  // bulk copy because TypedArray offsets must be multiples of the element size.
  const littleEndianHost = new Uint16Array(new Uint8Array([1, 0]).buffer)[0] === 1;
  if (!littleEndianHost) throw Error('Este navegador requiere conversión de endian no implementada');
  const aligned = offset % Type.BYTES_PER_ELEMENT === 0;
  const values = aligned ? new Type(buffer, offset, count) : new Type(buffer.slice(offset));
  if(fields.space==='right-anterior-superior'){
    const convert=value=>`(${value.split(',').map((part,axis)=>Number(part)*(axis<2?-1:1)).join(',')})`;
    fields['space directions']=(fields['space directions']||'').replace(/\(([^)]+)\)/g,(_,value)=>convert(value));
    fields['space origin']=(fields['space origin']||'').replace(/\(([^)]+)\)/g,(_,value)=>convert(value));
    fields.space='left-posterior-superior';
  }
  return {values, sizes, fields,format:'NRRD'};
}

function triples(text) {
  return [...(text || '').matchAll(/\(([^)]+)\)/g)]
    .map(match => match[1].split(',').map(value => Number(value.trim())));
}

export function checkGeometry(image, mask) {
  const issues = [];
  if (image.sizes.join(',') !== mask.sizes.join(','))
    issues.push(`Dimensiones distintas: imagen ${image.sizes.join('×')}, máscara ${mask.sizes.join('×')}.`);
  if ((image.fields.space || '') !== (mask.fields.space || ''))
    issues.push('El sistema de coordenadas (space) es distinto.');
  const imageDirections=triples(image.fields['space directions']);
  const maskDirections=triples(mask.fields['space directions']);
  const imageOrigin=triples(image.fields['space origin'])[0];
  const maskOrigin=triples(mask.fields['space origin'])[0];
  const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-4+1e-6*Math.max(Math.abs(a),Math.abs(b));
  if(imageDirections.length!==3||maskDirections.length!==3||
    imageDirections.some((vector,axis)=>vector.length!==3||maskDirections[axis]?.length!==3||vector.some((value,component)=>!near(value,maskDirections[axis][component]))))
    issues.push('El tamaño de vóxel o la orientación de los ejes es diferente.');
  if(imageDirections.length===3&&imageDirections.some((vector,axis)=>
    !(Math.abs(vector[axis])>0)||vector.some((value,component)=>component!==axis&&Math.abs(value)>1e-9)))
    issues.push('Este prototipo admite volúmenes con ejes alineados (sin rotación oblicua).');
  if(!imageOrigin||!maskOrigin||imageOrigin.length!==3||maskOrigin.length!==3||
    imageOrigin.some((value,axis)=>!near(value,maskOrigin[axis])))
    issues.push('El origen espacial es diferente.');
  const spacing=imageDirections.length===3?imageDirections.map(vector=>Math.hypot(...vector)):[];
  return {ok:issues.length===0,issues,imageSize:image.sizes,maskSize:mask.sizes,spacing};
}

export function assertGeometry(image,mask) {
  const checked=checkGeometry(image,mask);
  if(!checked.ok)throw Error(`Geometría incompatible: ${checked.issues.join(' ')}`);
}

export function firstOrder(image, mask, label = 1, normalization = 'none', binWidth = 75) {
  assertGeometry(image,mask);
  if (!['none', 'zscore', 'minmax'].includes(normalization)) throw Error('Normalización no admitida');
  let fullSum = 0, fullSquares = 0, fullMin = Infinity, fullMax = -Infinity;
  if (normalization !== 'none') {
    for (const value of image.values) {
      fullSum += value; fullSquares += value * value;
      if (value < fullMin) fullMin = value;
      if (value > fullMax) fullMax = value;
    }
  }
  const fullMean = fullSum / image.values.length;
  // SimpleITK Normalize uses the sample standard deviation (N - 1).
  const fullSd = normalization === 'zscore' ? Math.sqrt((fullSquares - fullSum * fullMean) / (image.values.length - 1)) : 1;
  if (normalization === 'zscore' && !(fullSd > 0)) throw Error('No se puede normalizar una imagen constante');
  if (normalization === 'minmax' && fullMin === fullMax) throw Error('No se puede normalizar una imagen constante');
  const roi = [];
  for (let i = 0; i < image.values.length; i++) if (mask.values[i] === label) {
    const raw = image.values[i];
    roi.push(normalization === 'zscore' ? (raw - fullMean) / fullSd : normalization === 'minmax' ? (raw - fullMin) / (fullMax - fullMin) : raw);
  }
  if (!roi.length) throw Error(`Etiqueta ${label} ausente`);
  return statistics(roi, binWidth, spacingOf(image).reduce((a,b) => a*b, 1));
}

function spacingOf(volume) {
  const vectors = [...volume.fields['space directions'].matchAll(/\(([^)]+)\)/g)]
    .map(match => match[1].split(',').map(Number));
  if (vectors.length !== 3 || vectors.some((vector, axis) => vector.some((value, component) => component !== axis && Math.abs(value) > 1e-9))) {
    throw Error('Esta fase admite ejes alineados con la imagen');
  }
  return vectors.map((vector, axis) => Math.abs(vector[axis]));
}

function statistics(roi, binWidth = 75, voxelVolume = 1) {
  if (!(binWidth > 0)) throw Error('binWidth debe ser positivo');
  let sum = 0, min = Infinity, max = -Infinity;
  for (const value of roi) { sum += value; if (value < min) min = value; if (value > max) max = value; }
  const mean = sum / roi.length;
  let squared = 0, cubed = 0, fourth = 0, energy = 0, absolute = 0;
  for (const value of roi) {
    const deviation = value - mean;
    squared += deviation ** 2; cubed += deviation ** 3; fourth += deviation ** 4;
    energy += value ** 2; absolute += Math.abs(deviation);
  }
  const variance = squared / roi.length;
  const lowBound = min - (min % binWidth + binWidth) % binWidth;
  const counts = new Map();
  for (const value of roi) {
    const bin = Math.floor((value - lowBound) / binWidth);
    counts.set(bin, (counts.get(bin) || 0) + 1);
  }
  let entropy = 0, uniformity = 0;
  for (const count of counts.values()) {
    const probability = count / roi.length;
    entropy -= probability * Math.log2(probability + Number.EPSILON);
    uniformity += probability ** 2;
  }
  roi.sort((a, b) => a - b);
  const middle = Math.floor(roi.length / 2);
  const percentile = p => {
    const position = (roi.length - 1) * p / 100;
    const lower = Math.floor(position), fraction = position - lower;
    return roi[lower] * (1 - fraction) + roi[Math.ceil(position)] * fraction;
  };
  const p10 = percentile(10), p90 = percentile(90);
  let robustCount = 0, robustSum = 0;
  for (const value of roi) if (value >= p10 && value <= p90) {robustCount++; robustSum += value;}
  const robustMean = robustSum / robustCount;
  let robustAbsolute = 0;
  for (const value of roi) if (value >= p10 && value <= p90) robustAbsolute += Math.abs(value - robustMean);
  return {VoxelCount: roi.length,
    original_firstorder_Mean: mean,
    original_firstorder_Median: roi.length % 2 ? roi[middle] : (roi[middle - 1] + roi[middle]) / 2,
    original_firstorder_Minimum: min,
    original_firstorder_Maximum: max,
    original_firstorder_Variance: variance,
    original_firstorder_Entropy: entropy,
    original_firstorder_10Percentile: p10,
    original_firstorder_90Percentile: p90,
    original_firstorder_InterquartileRange: percentile(75) - percentile(25),
    original_firstorder_Range: max - min,
    original_firstorder_MeanAbsoluteDeviation: absolute / roi.length,
    original_firstorder_RobustMeanAbsoluteDeviation: robustAbsolute / robustCount,
    original_firstorder_RootMeanSquared: Math.sqrt(energy / roi.length),
    original_firstorder_Skewness: variance ? (cubed / roi.length) / variance ** 1.5 : 0,
    original_firstorder_Kurtosis: variance ? (fourth / roi.length) / variance ** 2 : 0,
    original_firstorder_Uniformity: uniformity,
    original_firstorder_Energy: energy,
    original_firstorder_TotalEnergy: energy * voxelVolume};
}

function normalizedImageView(image, mode) {
  if (mode === 'none') return image;
  if (!['zscore','minmax'].includes(mode)) throw Error('Normalización no admitida');
  let sum=0,squares=0,min=Infinity,max=-Infinity;
  for (const value of image.values) {sum+=value;squares+=value*value;min=Math.min(min,value);max=Math.max(max,value);}
  const mean=sum/image.values.length;
  const sd=Math.sqrt((squares-sum*mean)/(image.values.length-1));
  if (mode==='zscore' && !(sd>0) || mode==='minmax' && min===max) throw Error('No se puede normalizar una imagen constante');
  const transform = value => mode==='zscore' ? (value-mean)/sd : Math.fround((value-min)/(max-min));
  const values=new Proxy({length:image.values.length},{get(target,key){
    if(key==='length')return target.length;
    if(key===Symbol.iterator)return function*(){for(const value of image.values)yield transform(value);};
    if(typeof key==='string' && /^\d+$/.test(key))return transform(image.values[Number(key)]);
    return undefined;
  }});
  return {...image,values};
}

export function filteredFeatureSets(image, mask, binWidth, filters, normalization = 'none', logSigmas = [1]) {
  const result={};
  image=normalizedImageView(image,normalization);
  const [sx,sy,sz]=image.sizes,plane=sx*sy;
  const low=[sx,sy,sz],high=[-1,-1,-1];
  for(let index=0;index<mask.values.length;index++)if(mask.values[index]===1) {
    const xyz=[index%sx,Math.floor(index/sx)%sy,Math.floor(index/plane)];
    for(let axis=0;axis<3;axis++){low[axis]=Math.min(low[axis],xyz[axis]);high[axis]=Math.max(high[axis],xyz[axis]);}
  }
  if(high[0]<0)throw Error('Etiqueta 1 ausente');
  const cropSize=low.map((v,axis)=>high[axis]-v+1);
  const cropCount=cropSize.reduce((a,b)=>a*b,1);
  const sourceIndex=new Int32Array(cropCount),cropMask=new Uint8Array(cropCount);
  for(let z=0;z<cropSize[2];z++)for(let y=0;y<cropSize[1];y++)for(let x=0;x<cropSize[0];x++){
    const dest=x+cropSize[0]*(y+cropSize[1]*z);
    const source=x+low[0]+sx*(y+low[1]+sy*(z+low[2]));
    sourceIndex[dest]=source;cropMask[dest]=mask.values[source]===1?1:0;
  }
  const crop=imageType=>{
    const values=new Proxy({length:cropCount},{get(target,key){
      if(key==='length')return target.length;
      if(typeof key==='string'&&/^\d+$/.test(key))return imageType.values[sourceIndex[Number(key)]];
      return undefined;
    }});
    const fields={...imageType.fields,'space origin':'(0,0,0)'};
    return [{...imageType,values,sizes:cropSize,fields},{values:cropMask,sizes:cropSize,fields}];
  };
  for(const type of filters) {
    if(!POINTWISE_FILTERS.includes(type) && type!=='wavelet' && type!=='log')throw Error(`Filtro no admitido: ${type}`);
    if(type==='log') {
      if(!Array.isArray(logSigmas)||!logSigmas.length||logSigmas.some(sigma=>!(sigma>0)))throw Error('Sigma LoG inválido');
      for(const sigma of logSigmas) {
        const {image:logImage,mask:logMask}=laplacianRecursiveGaussian(image,mask,sigma);
        const features={...firstOrder(logImage,logMask,1,'none',binWidth),
          ...shapeTexture(logImage,logMask,'none',binWidth,true,false)};
        const label=`log-sigma-${Number.isInteger(sigma)?sigma.toFixed(1):sigma}-mm-3D`.replace(/\./g,'-');
        for(const [key,value] of Object.entries(features))
          if(key.startsWith('original_'))result[`${label}_${key.slice('original_'.length)}`]=value;
      }
      continue;
    }
    const images=type==='wavelet'?waveletImages(image):[{name:type,image:filteredImage(image,type)}];
    for(const {name, image:transformed} of images) {
      const [smallImage,smallMask]=crop(transformed);
      const features={...firstOrder(smallImage,smallMask,1,'none',binWidth),
        ...shapeTexture(smallImage,smallMask,'none',binWidth,true,false)};
      for(const [key,value] of Object.entries(features))
        if(key.startsWith('original_'))result[`${name}_${key.slice('original_'.length)}`]=value;
    }
  }
  return result;
}

export function resampledFirstOrder(image, mask, targetSpacing, interpolation = 'linear', normalization = 'none', binWidth = 75, includeShapeTexture = false, includeGlcm = true, filters = [], logSigmas = [1]) {
  if (!['linear', 'nearest'].includes(interpolation)) throw Error('Interpolación no admitida');
  assertGeometry(image,mask);
  if (targetSpacing.length !== 3 || targetSpacing.some(value => !(value > 0))) throw Error('Tamaño de vóxel inválido');
  const oldSpacing = spacingOf(image);
  const ratio = oldSpacing.map((value, axis) => value / targetSpacing[axis]);
  if (ratio.every(value => Math.abs(value - 1) < 1e-8)) return {
    ...firstOrder(image, mask, 1, normalization, binWidth),
    ...(includeShapeTexture ? shapeTexture(image, mask, normalization, binWidth, includeGlcm) : {}),
    ...(filters.length ? filteredFeatureSets(normalizedImageView(image,normalization),mask,binWidth,filters,'none',logSigmas) : {}),
  };
  if (!['none', 'zscore', 'minmax'].includes(normalization)) throw Error('Normalización no admitida');
  let fullSum = 0, fullSquares = 0, fullMin = Infinity, fullMax = -Infinity;
  if (normalization !== 'none') for (const value of image.values) {
    fullSum += value; fullSquares += value * value;
    fullMin = Math.min(fullMin, value); fullMax = Math.max(fullMax, value);
  }
  const fullMean = fullSum / image.values.length;
  const fullSd = normalization === 'zscore' ? Math.sqrt((fullSquares - fullSum * fullMean) / (image.values.length - 1)) : 1;
  if (normalization === 'zscore' && !(fullSd > 0) || normalization === 'minmax' && fullMin === fullMax) throw Error('No se puede normalizar una imagen constante');
  const size = image.sizes;
  const low = [Infinity, Infinity, Infinity], high = [-1, -1, -1];
  for (let index = 0; index < mask.values.length; index++) if (mask.values[index] === 1) {
    const x = index % size[0], y = Math.floor(index / size[0]) % size[1], z = Math.floor(index / (size[0] * size[1]));
    for (const [axis, coordinate] of [x, y, z].entries()) {
      low[axis] = Math.min(low[axis], coordinate); high[axis] = Math.max(high[axis], coordinate);
    }
  }
  if (high[0] < 0) throw Error('Etiqueta 1 ausente');
  const gridLow = low.map((value, axis) => Math.max(0, Math.floor((value - 0.5) * ratio[axis] - 5)));
  const gridHigh = high.map((value, axis) => Math.min(Math.ceil(size[axis] * ratio[axis]) - 1, Math.ceil((value + 0.5) * ratio[axis] + 5)));
  const gridSize = gridHigh.map((value, axis) => value - gridLow[axis] + 1);
  const gridCount = gridSize[0] * gridSize[1] * gridSize[2];
  const gridImage = includeShapeTexture || filters.length ? new Float64Array(gridCount) : null;
  const gridMask = includeShapeTexture || filters.length ? new Uint8Array(gridCount) : null;
  const sample = (x, y, z) => {
    if (x < 0 || y < 0 || z < 0 || x >= size[0] || y >= size[1] || z >= size[2]) return 0;
    const raw = image.values[x + size[0] * (y + size[1] * z)];
    return normalization === 'zscore' ? (raw - fullMean) / fullSd : normalization === 'minmax' ? Math.fround((raw - fullMin) / (fullMax - fullMin)) : raw;
  };
  const roi = [];
  const outputLow = [Infinity,Infinity,Infinity], outputHigh = [-Infinity,-Infinity,-Infinity];
  for (let nz = gridLow[2]; nz <= gridHigh[2]; nz++) {
    const z = (nz + 0.5) / ratio[2] - 0.5;
    for (let ny = gridLow[1]; ny <= gridHigh[1]; ny++) {
      const y = (ny + 0.5) / ratio[1] - 0.5;
      for (let nx = gridLow[0]; nx <= gridHigh[0]; nx++) {
        const x = (nx + 0.5) / ratio[0] - 0.5;
        const ix = Math.floor(x + 0.5), iy = Math.floor(y + 0.5), iz = Math.floor(z + 0.5);
        const inside = ix >= 0 && iy >= 0 && iz >= 0 && ix < size[0] && iy < size[1] && iz < size[2];
        const inRoi = inside && mask.values[ix + size[0] * (iy + size[1] * iz)] === 1;
        if (!inRoi && !filters.length) continue;
        let value;
        if (interpolation === 'nearest') value = inside ? sample(ix, iy, iz) : 0;
        else {
          const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
          const dx = x - fx, dy = y - fy, dz = z - fz;
          value = 0;
          for (let k = 0; k <= 1; k++) for (let j = 0; j <= 1; j++) for (let i = 0; i <= 1; i++) {
            value += sample(fx + i, fy + j, fz + k) * (i ? dx : 1-dx) * (j ? dy : 1-dy) * (k ? dz : 1-dz);
          }
          // PyRadiomics asks SimpleITK to preserve the source's integer pixel type.
          if (normalization === 'none' && (image.values instanceof Int16Array || image.values instanceof Uint16Array)) value = Math.trunc(value);
          if (normalization === 'minmax') value = Math.fround(value);
        }
        if (filters.length && gridImage) {
          const outputIndex = (nx - gridLow[0]) + gridSize[0] * ((ny - gridLow[1]) + gridSize[1] * (nz - gridLow[2]));
          gridImage[outputIndex] = value;
        }
        if (!inRoi) continue;
        roi.push(value);
        for (const [axis, coordinate] of [nx,ny,nz].entries()) {
          outputLow[axis] = Math.min(outputLow[axis], coordinate);
          outputHigh[axis] = Math.max(outputHigh[axis], coordinate);
        }
        if (gridMask) {
          const outputIndex = (nx - gridLow[0]) + gridSize[0] * ((ny - gridLow[1]) + gridSize[1] * (nz - gridLow[2]));
          gridImage[outputIndex] = value;
          gridMask[outputIndex] = 1;
        }
      }
    }
  }
  if (!roi.length) throw Error('La máscara quedó vacía tras el remuestreo');
  if (roi.length === 1) throw Error('La máscara tiene un solo vóxel tras el remuestreo');
  if (outputLow.filter((value, axis) => outputHigh[axis] > value).length < 2) {
    throw Error('La ROI tiene menos de dos dimensiones tras el remuestreo');
  }
  const first = statistics(roi, binWidth, targetSpacing.reduce((a,b) => a*b, 1));
  if (!includeShapeTexture && !filters.length) return first;
  const fields = {
    space: image.fields.space,
    'space directions': `(${targetSpacing[0]},0,0) (0,${targetSpacing[1]},0) (0,0,${targetSpacing[2]})`,
    'space origin': '(0,0,0)',
  };
  const resampledImage={values:gridImage,sizes:gridSize,fields};
  const resampledMask={values:gridMask,sizes:gridSize,fields};
  return {...first,
    ...(includeShapeTexture ? shapeTexture(resampledImage,resampledMask,'none',binWidth,includeGlcm) : {}),
    ...(filters.length ? filteredFeatureSets(resampledImage,resampledMask,binWidth,filters,'none',logSigmas) : {})};
}

export function shapeTexture(image, mask, normalization = 'none', binWidth = 75, includeGlcm = true, includeShape = true) {
  assertGeometry(image,mask);
  if (!(binWidth > 0)) throw Error('binWidth debe ser positivo');
  const spacing = spacingOf(image);
  const size = image.sizes;
  let fullSum = 0, fullSquares = 0, fullMin = Infinity, fullMax = -Infinity;
  if (normalization !== 'none') for (const value of image.values) {
    fullSum += value; fullSquares += value * value;
    fullMin = Math.min(fullMin, value); fullMax = Math.max(fullMax, value);
  }
  const fullMean = fullSum / image.values.length;
  const fullSd = normalization === 'zscore' ? Math.sqrt((fullSquares - fullSum * fullMean) / (image.values.length - 1)) : 1;
  if (normalization === 'zscore' && !(fullSd > 0) || normalization === 'minmax' && fullMin === fullMax) throw Error('No se puede normalizar una imagen constante');
  const selected = [];
  let min = Infinity;
  for (let index = 0; index < mask.values.length; index++) if (mask.values[index] === 1) {
    const raw = image.values[index];
    const value = normalization === 'zscore' ? (raw - fullMean) / fullSd : normalization === 'minmax' ? Math.fround((raw - fullMin) / (fullMax - fullMin)) : raw;
    selected.push([index, value]); min = Math.min(min, value);
  }
  if (!selected.length) throw Error('Etiqueta 1 ausente');
  const lowBound = Math.floor(min / binWidth) * binWidth;
  const bins = new Map(selected.map(([index, value]) => [index, Math.floor((value - lowBound) / binWidth) + 1]));
  const coordinates = selected.map(([index]) => [
    (index % size[0]) * spacing[0],
    (Math.floor(index / size[0]) % size[1]) * spacing[1],
    Math.floor(index / (size[0] * size[1])) * spacing[2],
  ]);
  const center = [0,0,0];
  for (const point of coordinates) for (let axis = 0; axis < 3; axis++) center[axis] += point[axis] / coordinates.length;
  const covariance = [[0,0,0],[0,0,0],[0,0,0]];
  for (const point of coordinates) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    covariance[i][j] += (point[i] - center[i]) * (point[j] - center[j]) / coordinates.length;
  }
  // Jacobi diagonalization of the symmetric 3×3 covariance matrix.
  for (let iteration = 0; iteration < 32; iteration++) {
    let p = 0, q = 1;
    for (const [i,j] of [[0,1],[0,2],[1,2]]) if (Math.abs(covariance[i][j]) > Math.abs(covariance[p][q])) [p,q] = [i,j];
    if (Math.abs(covariance[p][q]) < 1e-12) break;
    const angle = 0.5 * Math.atan2(2 * covariance[p][q], covariance[q][q] - covariance[p][p]);
    const c = Math.cos(angle), s = Math.sin(angle);
    const app = covariance[p][p], aqq = covariance[q][q], apq = covariance[p][q];
    covariance[p][p] = c*c*app - 2*s*c*apq + s*s*aqq;
    covariance[q][q] = s*s*app + 2*s*c*apq + c*c*aqq;
    covariance[p][q] = covariance[q][p] = 0;
    for (let k = 0; k < 3; k++) if (k !== p && k !== q) {
      const akp = covariance[k][p], akq = covariance[k][q];
      covariance[k][p] = covariance[p][k] = c*akp - s*akq;
      covariance[k][q] = covariance[q][k] = s*akp + c*akq;
    }
  }
  const eigen = [covariance[0][0],covariance[1][1],covariance[2][2]].map(value => Math.max(0,value)).sort((a,b) => a-b);
  return {
    ...(includeShape ? {
      ...meshShape(mask, selected.map(([index]) => index), spacing),
      original_shape_VoxelVolume: selected.length * spacing[0] * spacing[1] * spacing[2],
      original_shape_MajorAxisLength: 4 * Math.sqrt(eigen[2]),
      original_shape_MinorAxisLength: 4 * Math.sqrt(eigen[1]),
      original_shape_LeastAxisLength: 4 * Math.sqrt(eigen[0]),
      original_shape_Elongation: Math.sqrt(eigen[1] / eigen[2]),
      original_shape_Flatness: Math.sqrt(eigen[0] / eigen[2]),
    } : {}),
    ...(includeGlcm ? textureFeatures(bins, selected, size) : {}),
    ...(includeGlcm ? glcmFeatures(bins, selected, size) : {}),
  };
}
