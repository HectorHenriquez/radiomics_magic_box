const stem = name => name.replace(/\.nrrd$/i,'');
const caseId = (name,kind) => stem(name).replace(kind==='image'?/(?:_chest_ct)?_image$/i:/(?:_chest_ct)?_(?:segmentation|mask)$/i,'');

export function pairFiles(files) {
  const images=new Map(),masks=new Map(),duplicates=[],ignored=[];
  for(const file of files){
    const path=(file.webkitRelativePath||file.name).replaceAll('\\','/');
    const segments=path.split('/');
    const folder=segments.at(-2)?.toLowerCase();
    const kind=folder==='images'?'image':['segmentations','masks'].includes(folder)?'mask':null;
    if(!kind||!file.name.toLowerCase().endsWith('.nrrd')){ignored.push(path);continue;}
    const id=caseId(file.name,kind),map=kind==='image'?images:masks;
    if(map.has(id))duplicates.push(`${id}: ${kind==='image'?'imagen':'máscara'} duplicada`);
    else map.set(id,file);
  }
  const invalid=new Set(duplicates.map(value=>value.slice(0,value.indexOf(':'))));
  const pairs=[...images].filter(([id])=>masks.has(id)&&!invalid.has(id))
    .map(([id,image])=>({id,image,mask:masks.get(id)})).sort((a,b)=>a.id.localeCompare(b.id));
  const missingMasks=[...images.keys()].filter(id=>!masks.has(id)).sort();
  const missingImages=[...masks.keys()].filter(id=>!images.has(id)).sort();
  return {pairs,missingMasks,missingImages,duplicates,ignored};
}

export function featureCsv(rows) {
  const names=[...new Set(rows.flatMap(row=>Object.keys(row.features)))].sort();
  const cell=value=>`"${String(value??'').replaceAll('"','""')}"`;
  return [['case_id',...names],...rows.map(row=>[row.id,...names.map(name=>row.features[name])])]
    .map(row=>row.map(cell).join(',')).join('\r\n');
}
