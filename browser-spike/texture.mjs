// Texture matrices use PyRadiomics 3.0.1 defaults: distance 1, 3D, alpha 0,
// symmetric GLCM, and a mean of feature values over valid directions.
const EPS = Number.EPSILON;
const log2 = x => Math.log2(x + EPS);
const directions = [];
for (let z = -1; z <= 1; z++) for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++)
  if (z > 0 || z === 0 && y > 0 || z === 0 && y === 0 && x > 0) directions.push([x,y,z]);
const neighbors = [...directions, ...directions.map(d => d.map(x => -x))];

function matrixFeatures(entries, count, family, nVoxels) {
  const pg = new Map(), pj = new Map();
  let iMean = 0, jMean = 0, entropy = 0;
  const out = {};
  const add = (key, value) => { out[key] = (out[key] || 0) + value; };
  for (const [i,j,n] of entries) {
    pg.set(i, (pg.get(i) || 0) + n); pj.set(j, (pj.get(j) || 0) + n);
    iMean += i*n/count; jMean += j*n/count;
    const i2=i*i,j2=j*j;
    add('LowGray',n/i2); add('HighGray',n*i2);
    add('SmallLow',n/(i2*j2)); add('SmallHigh',n*i2/j2);
    add('LargeLow',n*j2/i2); add('LargeHigh',n*i2*j2);
    entropy -= n/count*log2(n/count);
  }
  let small=0,large=0,grayUniform=0,jUniform=0,grayVariance=0,jVariance=0;
  for (const [i,n] of pg) {grayUniform+=n*n; grayVariance+=n/count*(i-iMean)**2;}
  for (const [j,n] of pj) {small+=n/j**2; large+=n*j*j; jUniform+=n*n; jVariance+=n/count*(j-jMean)**2;}
  if (family === 'glrlm') return {
    ShortRunEmphasis:small/count, LongRunEmphasis:large/count,
    GrayLevelNonUniformity:grayUniform/count, GrayLevelNonUniformityNormalized:grayUniform/count**2,
    RunLengthNonUniformity:jUniform/count, RunLengthNonUniformityNormalized:jUniform/count**2,
    RunPercentage:count/nVoxels, GrayLevelVariance:grayVariance, RunVariance:jVariance,
    RunEntropy:entropy, LowGrayLevelRunEmphasis:out.LowGray/count,
    HighGrayLevelRunEmphasis:out.HighGray/count,
    ShortRunLowGrayLevelEmphasis:out.SmallLow/count,
    ShortRunHighGrayLevelEmphasis:out.SmallHigh/count,
    LongRunLowGrayLevelEmphasis:out.LargeLow/count,
    LongRunHighGrayLevelEmphasis:out.LargeHigh/count,
  };
  const zone = family === 'glszm';
  return {
    [zone?'SmallAreaEmphasis':'SmallDependenceEmphasis']:small/count,
    [zone?'LargeAreaEmphasis':'LargeDependenceEmphasis']:large/count,
    GrayLevelNonUniformity:grayUniform/count,
    ...(zone?{GrayLevelNonUniformityNormalized:grayUniform/count**2}:{}),
    [zone?'SizeZoneNonUniformity':'DependenceNonUniformity']:jUniform/count,
    [zone?'SizeZoneNonUniformityNormalized':'DependenceNonUniformityNormalized']:jUniform/count**2,
    ...(zone?{ZonePercentage:count/nVoxels}:{}),
    GrayLevelVariance:grayVariance,
    [zone?'ZoneVariance':'DependenceVariance']:jVariance,
    [zone?'ZoneEntropy':'DependenceEntropy']:entropy,
    [zone?'LowGrayLevelZoneEmphasis':'LowGrayLevelEmphasis']:out.LowGray/count,
    [zone?'HighGrayLevelZoneEmphasis':'HighGrayLevelEmphasis']:out.HighGray/count,
    [zone?'SmallAreaLowGrayLevelEmphasis':'SmallDependenceLowGrayLevelEmphasis']:out.SmallLow/count,
    [zone?'SmallAreaHighGrayLevelEmphasis':'SmallDependenceHighGrayLevelEmphasis']:out.SmallHigh/count,
    [zone?'LargeAreaLowGrayLevelEmphasis':'LargeDependenceLowGrayLevelEmphasis']:out.LargeLow/count,
    [zone?'LargeAreaHighGrayLevelEmphasis':'LargeDependenceHighGrayLevelEmphasis']:out.LargeHigh/count,
  };
}

export function textureFeatures(bins, selected, size) {
  const [sx,sy,sz]=size, plane=sx*sy;
  const coord = idx => [idx%sx, Math.floor(idx/sx)%sy, Math.floor(idx/plane)];
  const at = (x,y,z) => x>=0&&y>=0&&z>=0&&x<sx&&y<sy&&z<sz ? x+sx*(y+sy*z) : -1;
  const result = {};
  // Each maximal run begins where the preceding voxel has another level or is outside the ROI.
  const runSums = {}, runCounts = {};
  for (const d of directions) {
    if (!selected.some(([idx]) => {const [x,y,z]=coord(idx);return bins.has(at(x+d[0],y+d[1],z+d[2]));})) continue;
    const matrix=new Map();let count=0;
    for (const [idx] of selected) {
      const [x,y,z]=coord(idx), gray=bins.get(idx);
      const prev=at(x-d[0],y-d[1],z-d[2]);
      if (bins.get(prev)===gray) continue;
      let length=0,xx=x,yy=y,zz=z;
      while (bins.get(at(xx,yy,zz))===gray) {length++;xx+=d[0];yy+=d[1];zz+=d[2];}
      const key=`${gray},${length}`;matrix.set(key,(matrix.get(key)||0)+1);count++;
    }
    if (!count) continue;
    const values=matrixFeatures([...matrix].map(([key,n])=>[...key.split(',').map(Number),n]),count,'glrlm',selected.length);
    for (const [key,value] of Object.entries(values)) {runSums[key]=(runSums[key]||0)+value;runCounts[key]=(runCounts[key]||0)+1;}
  }
  for (const key in runSums) result[`original_glrlm_${key}`]=runSums[key]/runCounts[key];

  // 26-connected components of equal discretized level are size zones.
  const seen=new Set(), zoneMatrix=new Map();let zones=0;
  for (const [idx] of selected) {
    if (seen.has(idx)) continue;
    const gray=bins.get(idx), stack=[idx];seen.add(idx);let area=0;
    while (stack.length) {
      const current=stack.pop();area++;
      const [x,y,z]=coord(current);
      for (const [dx,dy,dz] of neighbors) {
        const next=at(x+dx,y+dy,z+dz);
        if (!seen.has(next)&&bins.get(next)===gray) {seen.add(next);stack.push(next);}
      }
    }
    const key=`${gray},${area}`;zoneMatrix.set(key,(zoneMatrix.get(key)||0)+1);zones++;
  }
  const zoneValues=matrixFeatures([...zoneMatrix].map(([key,n])=>[...key.split(',').map(Number),n]),zones,'glszm',selected.length);
  for (const [key,value] of Object.entries(zoneValues)) result[`original_glszm_${key}`]=value;

  // GLDM includes the center voxel, so the dependence size is at least one.
  const depMatrix=new Map();
  const ngtdm=new Map();
  for (const [idx] of selected) {
    const gray=bins.get(idx),[x,y,z]=coord(idx);let dep=1, n=0, sum=0;
    for (const [dx,dy,dz] of neighbors) {
      const other=bins.get(at(x+dx,y+dy,z+dz));
      if (other===undefined) continue;
      n++;sum+=other;if (other===gray) dep++;
    }
    const key=`${gray},${dep}`;depMatrix.set(key,(depMatrix.get(key)||0)+1);
    const item=ngtdm.get(gray)||{n:0,s:0};item.n++;item.s+=n?Math.abs(gray-sum/n):0;ngtdm.set(gray,item);
  }
  const depValues=matrixFeatures([...depMatrix].map(([key,n])=>[...key.split(',').map(Number),n]),selected.length,'gldm',selected.length);
  for (const [key,value] of Object.entries(depValues)) result[`original_gldm_${key}`]=value;
  const levels=[...ngtdm].map(([i,{n,s}])=>({i,p:n/selected.length,s}));
  let weighted=0,sumS=0,pairContrast=0,busyDenom=0,complexity=0,strengthNum=0;
  for (const a of levels) {weighted+=a.p*a.s;sumS+=a.s;
    for (const b of levels) {
      const diff=Math.abs(a.i-b.i);
      pairContrast+=a.p*b.p*diff**2;
      busyDenom+=Math.abs(a.i*a.p-b.i*b.p);
      complexity+=diff*(a.p*a.s+b.p*b.s)/(a.p+b.p);
      strengthNum+=(a.p+b.p)*diff**2;
    }
  }
  Object.assign(result,{
    original_ngtdm_Coarseness:weighted?1/weighted:1e6,
    original_ngtdm_Contrast:levels.length>1?pairContrast*sumS/selected.length/(levels.length*(levels.length-1)):0,
    original_ngtdm_Busyness:busyDenom?weighted/busyDenom:0,
    original_ngtdm_Complexity:complexity/selected.length,
    original_ngtdm_Strength:sumS?strengthNum/sumS:0,
  });
  return result;
}
