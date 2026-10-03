import {firstOrder, resampledFirstOrder, shapeTexture, filteredFeatureSets} from './nrrd.mjs?v=4';
import {parseVolume} from './nifti.mjs?v=4';
import {createPreview} from './preview.mjs?v=4';
self.onmessage = async ({data}) => {
  try {
    const image = await parseVolume(data.image,data.imageName);
    const mask = await parseVolume(data.mask,data.maskName);
    if(data.action==='preview') {
      const preview=createPreview(image,mask);
      if(preview.intensities)self.postMessage({action:'preview',...preview},[preview.intensities.buffer,preview.overlayFlags.buffer]);
      else self.postMessage({action:'preview',...preview});
      return;
    }
    const features = data.resample
      ? resampledFirstOrder(image, mask, data.spacing, data.interpolation, data.normalization, data.binWidth, true, true, data.filters || [], data.logSigmas || [1])
      : {...firstOrder(image, mask, 1, data.normalization, data.binWidth),
         ...shapeTexture(image, mask, data.normalization, data.binWidth),
         ...((data.filters || []).length ? filteredFeatureSets(image,mask,data.binWidth,data.filters,data.normalization,data.logSigmas || [1]) : {})};
    self.postMessage({ok: true, features});
  } catch (error) {
    self.postMessage({ok: false, error: error.message});
  }
};
