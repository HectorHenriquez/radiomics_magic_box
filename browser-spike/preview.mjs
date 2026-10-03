import {checkGeometry} from './nrrd.mjs?v=5';

const OUTPUT_SIZE=320;

export function createPreview(image,mask) {
  const geometry=checkGeometry(image,mask);
  if(!geometry.ok)return {ok:false,geometry};
  const [sx,sy,sz]=image.sizes,plane=sx*sy;
  let positive=0,labelOne=0,sumX=0,sumY=0,sumZ=0;
  const slices=new Map();
  for(let index=0;index<mask.values.length;index++)if(mask.values[index]>0) {
    const x=index%sx,y=Math.floor(index/sx)%sy,z=Math.floor(index/plane);
    positive++;if(mask.values[index]===1)labelOne++;
    sumX+=x;sumY+=y;sumZ+=z;
    slices.set(z,(slices.get(z)||0)+1);
  }
  if(!positive)return {ok:false,geometry,warning:'La máscara no contiene vóxeles positivos.'};
  const center=[sumX/positive,sumY/positive,sumZ/positive];
  const slice=[...slices.keys()].sort((a,b)=>Math.abs(a-center[2])-Math.abs(b-center[2])||slices.get(b)-slices.get(a))[0];
  let lowX=sx,lowY=sy,highX=-1,highY=-1;
  for(let y=0;y<sy;y++)for(let x=0;x<sx;x++)if(mask.values[x+sx*(y+sy*slice)]>0){
    lowX=Math.min(lowX,x);highX=Math.max(highX,x);
    lowY=Math.min(lowY,y);highY=Math.max(highY,y);
  }
  const lesionWidth=Math.max(highX-lowX+1,highY-lowY+1);
  const fieldOfView=Math.max(64,Math.min(256,Math.ceil(lesionWidth*4)));
  const left=Math.max(0,Math.min(sx-fieldOfView,Math.round((lowX+highX)/2-fieldOfView/2)));
  const top=Math.max(0,Math.min(sy-fieldOfView,Math.round((lowY+highY)/2-fieldOfView/2)));
  const intensities=new Float32Array(OUTPUT_SIZE*OUTPUT_SIZE);
  const overlayFlags=new Uint8Array(intensities.length);
  const valueAt=(x,y)=>{
    const xx=Math.max(0,Math.min(sx-1,x)),yy=Math.max(0,Math.min(sy-1,y));
    return image.values[xx+sx*(yy+sy*slice)];
  };
  for(let py=0;py<OUTPUT_SIZE;py++)for(let px=0;px<OUTPUT_SIZE;px++){
    const x=left+(px+0.5)*fieldOfView/OUTPUT_SIZE-0.5;
    const y=top+(py+0.5)*fieldOfView/OUTPUT_SIZE-0.5;
    const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0;
    const topValue=valueAt(x0,y0)*(1-fx)+valueAt(x0+1,y0)*fx;
    const bottomValue=valueAt(x0,y0+1)*(1-fx)+valueAt(x0+1,y0+1)*fx;
    const maskX=Math.max(0,Math.min(sx-1,Math.round(x)));
    const maskY=Math.max(0,Math.min(sy-1,Math.round(y)));
    const selected=mask.values[maskX+sx*(maskY+sy*slice)]>0;
    const index=px+OUTPUT_SIZE*py;
    intensities[index]=topValue*(1-fy)+bottomValue*fy;
    overlayFlags[index]=selected?1:0;
  }
  return {ok:labelOne>0,geometry,warning:labelOne?null:'Hay vóxeles positivos, pero falta la etiqueta 1 requerida para extraer características.',
    positive,labelOne,slice,center,fieldOfView,width:OUTPUT_SIZE,height:OUTPUT_SIZE,intensities,overlayFlags};
}
