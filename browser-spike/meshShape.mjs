// Mesh calculation follows the marching-cubes conventions of PyRadiomics 3.0.1.
// Copyright 2017 Harvard Medical School; see PYRADIOMICS_LICENSE.txt.
import {TRI_TABLE} from './meshTables.mjs';

const CORNERS = [[0,0,0],[0,0,1],[0,1,1],[0,1,0],[1,0,0],[1,0,1],[1,1,1],[1,1,0]];
const VERTICES = [[0,0,0.5],[0,0.5,1],[0,1,0.5],[0,0.5,0],
                  [1,0,0.5],[1,0.5,1],[1,1,0.5],[1,0.5,0],
                  [0.5,0,0],[0.5,0,1],[0.5,1,1],[0.5,1,0]];

const distanceSq=(a,b)=>(a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;
function planeDiameter(points,axis){
  const u=(axis+1)%3,v=(axis+2)%3;
  const sorted=points.map(point=>[point[u],point[v]])
    .sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const unique=sorted.filter((point,index)=>!index||point[0]!==sorted[index-1][0]||point[1]!==sorted[index-1][1]);
  if(unique.length<2)return 0;
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const lower=[],upper=[];
  for(const point of unique){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),point)<=0)lower.pop();lower.push(point);}
  for(let index=unique.length-1;index>=0;index--){
    const point=unique[index];
    while(upper.length>1&&cross(upper.at(-2),upper.at(-1),point)<=0)upper.pop();
    upper.push(point);
  }
  const hull=lower.slice(0,-1).concat(upper.slice(0,-1));
  if(hull.length===2)return (hull[0][0]-hull[1][0])**2+(hull[0][1]-hull[1][1])**2;
  let best=0,j=1;
  for(let i=0;i<hull.length;i++){
    const next=(i+1)%hull.length;
    while(cross(hull[i],hull[next],hull[(j+1)%hull.length])>cross(hull[i],hull[next],hull[j]))j=(j+1)%hull.length;
    best=Math.max(best,(hull[i][0]-hull[j][0])**2+(hull[i][1]-hull[j][1])**2,
      (hull[next][0]-hull[j][0])**2+(hull[next][1]-hull[j][1])**2);
  }
  return best;
}

function spatialDiameter(points){
  const build=items=>{
    const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
    for(const point of items)for(let axis=0;axis<3;axis++){
      low[axis]=Math.min(low[axis],point[axis]);high[axis]=Math.max(high[axis],point[axis]);
    }
    const node={low,high,count:items.length};
    if(items.length<=24){node.items=items;return node;}
    const axis=[0,1,2].sort((a,b)=>(high[b]-low[b])-(high[a]-low[a]))[0];
    items.sort((a,b)=>a[axis]-b[axis]);
    const middle=items.length>>1;
    node.left=build(items.slice(0,middle));node.right=build(items.slice(middle));
    return node;
  };
  const bound=(a,b)=>a.low.reduce((sum,_,axis)=>sum+Math.max(
    (a.high[axis]-b.low[axis])**2,(b.high[axis]-a.low[axis])**2),0);
  const extremes=[];
  for(let axis=0;axis<3;axis++){
    let low=points[0],high=points[0];
    for(const point of points){if(point[axis]<low[axis])low=point;if(point[axis]>high[axis])high=point;}
    extremes.push(low,high);
  }
  let best=0;
  for(const a of extremes)for(const b of extremes)best=Math.max(best,distanceSq(a,b));
  const visit=(a,b)=>{
    if(bound(a,b)<best-1e-9*Math.max(1,best))return;
    if(a.items&&b.items){
      for(let i=0;i<a.items.length;i++)for(let j=(a===b?i+1:0);j<b.items.length;j++)
        best=Math.max(best,distanceSq(a.items[i],b.items[j]));
      return;
    }
    let pairs;
    if(a===b)pairs=[[a.left,a.left],[a.left,a.right],[a.right,a.right]];
    else if(!a.items&&(b.items||a.count>=b.count))pairs=[[a.left,b],[a.right,b]];
    else pairs=[[a,b.left],[a,b.right]];
    pairs.sort((x,y)=>bound(y[0],y[1])-bound(x[0],x[1]));
    for(const [left,right] of pairs)visit(left,right);
  };
  const root=build(points.slice());visit(root,root);
  return best;
}

export function shapeDiameters(points){
  const result=[0,0,0,0];
  if(points.length<=2048){
    for(let i=0;i<points.length;i++)for(let j=0;j<i;j++){
      const a=points[i],b=points[j],distance=distanceSq(a,b);
      for(let axis=0;axis<3;axis++)if(a[axis]===b[axis])result[axis]=Math.max(result[axis],distance);
      result[3]=Math.max(result[3],distance);
    }
    return result;
  }
  for(let axis=0;axis<3;axis++){
    const groups=new Map();
    for(const point of points){const key=point[axis];if(!groups.has(key))groups.set(key,[]);groups.get(key).push(point);}
    for(const group of groups.values())result[axis]=Math.max(result[axis],planeDiameter(group,axis));
  }
  result[3]=spatialDiameter(points);
  return result;
}

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
  const diameterSq=shapeDiameters(points);
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
