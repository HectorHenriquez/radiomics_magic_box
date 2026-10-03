import {parseNrrd, firstOrder, resampledFirstOrder, shapeTexture, filteredFeatureSets} from './nrrd.mjs';
import {createPreview} from './preview.mjs';
self.onmessage = ({data}) => {
  try {
    const image = parseNrrd(data.image);
    const mask = parseNrrd(data.mask);
    if(data.action==='preview') {
      const preview=createPreview(image,mask);
      if(preview.imageRgba)self.postMessage({action:'preview',...preview},[preview.imageRgba.buffer,preview.overlayRgba.buffer]);
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
