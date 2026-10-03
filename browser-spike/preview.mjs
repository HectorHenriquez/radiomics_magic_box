import {checkGeometry} from './nrrd.mjs';

const OUTPUT_SIZE=320;
const WINDOW_LOW=-160;
const WINDOW_HIGH=240;

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
  const imageRgba=new Uint8ClampedArray(OUTPUT_SIZE*OUTPUT_SIZE*4);
  const overlayRgba=new Uint8ClampedArray(imageRgba.length);
  const grayAt=(x,y)=>{
    const xx=Math.max(0,Math.min(sx-1,x)),yy=Math.max(0,Math.min(sy-1,y));
    const value=image.values[xx+sx*(yy+sy*slice)];
    return Math.max(0,Math.min(255,Math.round((value-WINDOW_LOW)*255/(WINDOW_HIGH-WINDOW_LOW))));
  };
  for(let py=0;py<OUTPUT_SIZE;py++)for(let px=0;px<OUTPUT_SIZE;px++){
    const x=left+(px+0.5)*fieldOfView/OUTPUT_SIZE-0.5;
    const y=top+(py+0.5)*fieldOfView/OUTPUT_SIZE-0.5;
    const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0;
    const topGray=grayAt(x0,y0)*(1-fx)+grayAt(x0+1,y0)*fx;
    const bottomGray=grayAt(x0,y0+1)*(1-fx)+grayAt(x0+1,y0+1)*fx;
    const gray=Math.round(topGray*(1-fy)+bottomGray*fy);
    const maskX=Math.max(0,Math.min(sx-1,Math.round(x)));
    const maskY=Math.max(0,Math.min(sy-1,Math.round(y)));
    const selected=mask.values[maskX+sx*(maskY+sy*slice)]>0;
    const offset=4*(px+OUTPUT_SIZE*py);
    imageRgba[offset]=imageRgba[offset+1]=imageRgba[offset+2]=gray;
    imageRgba[offset+3]=255;
    if(selected) {
      overlayRgba[offset]=Math.round(0.45*gray+0.55*255);
      overlayRgba[offset+1]=Math.round(0.45*gray+0.55*63);
      overlayRgba[offset+2]=Math.round(0.45*gray+0.55*89);
    } else overlayRgba[offset]=overlayRgba[offset+1]=overlayRgba[offset+2]=gray;
    overlayRgba[offset+3]=255;
  }
  return {ok:labelOne>0,geometry,warning:labelOne?null:'Hay vóxeles positivos, pero falta la etiqueta 1 requerida para extraer características.',
    positive,labelOne,slice,center,fieldOfView,width:OUTPUT_SIZE,height:OUTPUT_SIZE,imageRgba,overlayRgba};
}
