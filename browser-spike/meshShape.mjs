// Mesh calculation follows the marching-cubes conventions of PyRadiomics 3.0.1.
// Copyright 2017 Harvard Medical School; see PYRADIOMICS_LICENSE.txt.
import {TRI_TABLE} from './meshTables.mjs';

const CORNERS = [[0,0,0],[0,0,1],[0,1,1],[0,1,0],[1,0,0],[1,0,1],[1,1,1],[1,1,0]];
const VERTICES = [[0,0,0.5],[0,0.5,1],[0,1,0.5],[0,0.5,0],
                  [1,0,0.5],[1,0.5,1],[1,1,0.5],[1,0.5,0],
                  [0.5,0,0],[0.5,0,1],[0.5,1,1],[0.5,1,0]];

export function meshShape(mask, selectedIndices, spacing) {
  const [sx,sy,sz] = mask.sizes;
  const [dx,dy,dz] = spacing;
  const low = [Infinity,Infinity,Infinity], high = [-Infinity,-Infinity,-Infinity];
  for (const index of selectedIndices) {
    const x = index % sx, y = Math.floor(index/sx)%sy, z = Math.floor(index/(sx*sy));
    for (const [axis,coordinate] of [x,y,z].entries()) {
      low[axis] = Math.min(low[axis],coordinate); high[axis] = Math.max(high[axis],coordinate);
    }
  }
  const inside = (x,y,z) => x>=0&&y>=0&&z>=0&&x<sx&&y<sy&&z<sz&&mask.values[x+sx*(y+sy*z)]===1;
  let area=0, signedSixVolume=0;
  const points=[];
  for (let z=low[2]-1; z<=high[2]; z++) for(let y=low[1]-1; y<=high[1]; y++) for(let x=low[0]-1; x<=high[0]; x++) {
    let cube=0;
    for(let corner=0;corner<8;corner++) {
      const [oz,oy,ox]=CORNERS[corner];
      if(inside(x+ox,y+oy,z+oz)) cube|=1<<corner;
    }
    let sign=1;
    if(cube&0x80){cube^=0xff;sign=-1;}
    for(const [bit,edge] of [[6,6],[4,7],[3,11]]) if(cube&(1<<bit)) {
      const [vz,vy,vx]=VERTICES[edge];points.push([(z-low[2]+1+vz)*dz,(y-low[1]+1+vy)*dy,(x-low[0]+1+vx)*dx]);
    }
    for(let i=0;i<TRI_TABLE[cube].length;i+=3){
      const triangle=TRI_TABLE[cube].slice(i,i+3).map(edge=>{
        const [vz,vy,vx]=VERTICES[edge];return[(z-low[2]+1+vz)*dz,(y-low[1]+1+vy)*dy,(x-low[0]+1+vx)*dx];
      });
      const [a,b,c]=triangle;
      const cross=[a[1]*b[2]-b[1]*a[2],a[2]*b[0]-b[2]*a[0],a[0]*b[1]-b[0]*a[1]];
      signedSixVolume+=sign*(cross[0]*c[0]+cross[1]*c[1]+cross[2]*c[2]);
      const u=a.map((v,j)=>v-c[j]),v=b.map((w,j)=>w-c[j]);
      const surfaceCross=[u[1]*v[2]-v[1]*u[2],u[2]*v[0]-v[2]*u[0],u[0]*v[1]-v[0]*u[1]];
      area+=0.5*Math.hypot(...surfaceCross);
    }
  }
  const diameterSq=[0,0,0,0];
  for(let i=0;i<points.length;i++)for(let j=0;j<i;j++){
    const a=points[i],b=points[j];
    const distance=(a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;
    if(a[0]===b[0])diameterSq[0]=Math.max(diameterSq[0],distance);
    if(a[1]===b[1])diameterSq[1]=Math.max(diameterSq[1],distance);
    if(a[2]===b[2])diameterSq[2]=Math.max(diameterSq[2],distance);
    diameterSq[3]=Math.max(diameterSq[3],distance);
  }
  const volume=signedSixVolume/6;
  return {
    original_shape_MeshVolume:volume,
    original_shape_SurfaceArea:area,
    original_shape_SurfaceVolumeRatio:area/volume,
    original_shape_Sphericity:Math.cbrt(36*Math.PI*volume**2)/area,
    original_shape_Maximum2DDiameterSlice:Math.sqrt(diameterSq[0]),
    original_shape_Maximum2DDiameterColumn:Math.sqrt(diameterSq[1]),
    original_shape_Maximum2DDiameterRow:Math.sqrt(diameterSq[2]),
    original_shape_Maximum3DDiameter:Math.sqrt(diameterSq[3]),
  };
}
