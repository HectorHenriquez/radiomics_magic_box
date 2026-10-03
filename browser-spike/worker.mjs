import {firstOrder, resampledFirstOrder, shapeTexture, filteredFeatureSets} from './nrrd.mjs?v=6';
import {parseVolume} from './nifti.mjs?v=5';
import {createPreview} from './preview.mjs?v=5';
self.onmessage = async ({data}) => {
  try {
    const report=(fraction,label)=>{if(data.action==='extract')self.postMessage({type:'progress',fraction,label});};
    report(0.01,'Leyendo imagen y máscara');
    const image = await parseVolume(data.image,data.imageName);
    const mask = await parseVolume(data.mask,data.maskName);
    if(data.action==='preview') {
      const preview=createPreview(image,mask);
      if(preview.intensities)self.postMessage({action:'preview',...preview},[preview.intensities.buffer,preview.overlayFlags.buffer]);
      else self.postMessage({action:'preview',...preview});
      return;
    }
    report(.08,'Imagen y máscara leídas');
    const filters=data.filters || [];
    const features = data.resample
      ? resampledFirstOrder(image, mask, data.spacing, data.interpolation, data.normalization, data.binWidth, true, true, filters, data.logSigmas || [1],(fraction,label)=>report(.08+.9*fraction,label))
      : (()=>{
        report(.1,'Primer orden');
        const first=firstOrder(image, mask, 1, data.normalization, data.binWidth);
        report(.18,'Primer orden completo');
        const shape=shapeTexture(image, mask, data.normalization, data.binWidth,true,true,(fraction,label)=>report(.18+.58*fraction,label));
        const derived=filters.length?filteredFeatureSets(image,mask,data.binWidth,filters,data.normalization,data.logSigmas || [1],(fraction,label)=>report(.76+.22*fraction,label)):{};
        return {...first,...shape,...derived};
      })();
    report(1,'Extracción completa');
    self.postMessage({ok: true, features});
  } catch (error) {
    self.postMessage({ok: false, error: error.message});
  }
};
