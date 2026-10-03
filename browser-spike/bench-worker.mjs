import {parseNrrd, firstOrder, shapeTexture} from './nrrd.mjs';
const median = values => values.slice().sort((a,b) => a-b)[Math.floor(values.length/2)];
self.onmessage = ({data}) => {
  try {
    const parseStart = performance.now();
    const image = parseNrrd(data.image), mask = parseNrrd(data.mask);
    const parse_ms = performance.now() - parseStart;
    const extract = () => ({...firstOrder(image,mask,1,'none',75),...shapeTexture(image,mask,'none',75,false)});
    extract();
    const times=[];
    for(let i=0;i<5;i++){const start=performance.now();extract();times.push(performance.now()-start);}
    self.postMessage({case:data.case,parse_ms,extract_median_ms:median(times),extract_times_ms:times});
  } catch(error) { self.postMessage({case:data.case,error:error.message}); }
};
