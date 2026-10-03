import {pairFiles,featureCsv,isVolumeFile} from './batch.mjs?v=4';
const $ = selector => document.querySelector(selector);
const imageInput=$('#image'),maskInput=$('#mask'),patientIdInput=$('#patient-id');
const geometryMessage=$('#geometry-message'),previewNote=$('#preview-note');
const run=$('#run'),download=$('#download'),status=$('#status');
const normalization=$('#normalization'),resample=$('#resample'),interpolation=$('#interpolation'),binWidth=$('#bin-width');
const resultSection=$('#result-section'),resultBody=$('#result-body'),resultCount=$('#result-count');
const imageTypeFilter=$('#image-type-filter'),familyFilter=$('#family-filter'),featureSearch=$('#feature-search');
const FAMILY_LABELS={firstorder:'Primer orden',shape:'Forma',glcm:'GLCM',glrlm:'GLRLM',glszm:'GLSZM',gldm:'GLDM',ngtdm:'NGTDM',diagnostic:'Diagnóstico'};
let previewVersion=0,geometryReady=false,busy=false,allFeatures=[];
let mode='single',batchPlan={pairs:[]},batchRows=[],batchBusy=false,batchCancelled=false,activeBatchWorker=null;
let selectedImage=null,selectedMask=null,currentPreview=null,selectedBatchId=null,windowPreset='soft';
const WINDOWS={soft:{level:40,width:400},lung:{level:-600,width:1500},bone:{level:300,width:1500}};

const suggestedId = name => name.replace(/\.(?:nrrd|nii|nii\.gz)$/i,'').replace(/(?:_chest_ct)?_image$/i,'');
const updateRun = () => {run.disabled=busy||!geometryReady;};
const setGeometry = (message,tone='',target=geometryMessage) => {target.className=`geometry ${tone}`;target.textContent=message;};
const resetPreview = () => {
  currentPreview=null;
  for(const [canvas,placeholder] of [['#image-canvas','#image-placeholder'],['#overlay-canvas','#overlay-placeholder']]){
    $(canvas).style.display='none';$(placeholder).hidden=false;
  }
  previewNote.textContent='Se mostrará el corte positivo más cercano al centro de la máscara.';
};
const clearResults = () => {allFeatures=[];resultSection.hidden=true;download.hidden=true;resultBody.replaceChildren();};
const draw = (selector,bytes,width,height) => {
  const canvas=$(selector);canvas.width=width;canvas.height=height;
  canvas.getContext('2d').putImageData(new ImageData(bytes,width,height),0,0);
  canvas.style.display='block';
  $(selector==='#image-canvas'?'#image-placeholder':'#overlay-placeholder').hidden=true;
};
const runWorker = (payload,image,mask,onWorker,onProgress) => new Promise((resolve,reject) => {
  const worker=new Worker('./worker.mjs?v=6',{type:'module'});
  if(onWorker)onWorker(worker,reject);
  worker.onmessage=event=>{
    if(event.data.type==='progress'){onProgress?.(event.data);return;}
    worker.terminate();resolve(event.data);
  };
  worker.onerror=error=>{worker.terminate();reject(Error(error.message||'Error en el trabajador del navegador'));};
  worker.postMessage({...payload,image,mask},[image,mask]);
});
const elapsed=start=>`${Math.floor((performance.now()-start)/1000)} s transcurridos`;
function progressPanel(kind){
  const panel=$(`#${kind}-progress`),bar=$(`#${kind}-progress-bar`),label=$(`#${kind}-progress-label`),count=$(`#${kind}-progress-count`),time=$(`#${kind}-progress-time`);
  return {show(){panel.hidden=false;bar.value=0;},hide(){panel.hidden=true;},update(percent,phase,detail,clock){bar.value=Math.max(0,Math.min(100,Math.round(percent)));label.textContent=phase;count.textContent=detail;time.textContent=clock;}};
}
const singleProgress=progressPanel('single'),batchProgress=progressPanel('batch');

function renderPreview(){
  const opacity=Number($('#overlay-opacity').value)/100;
  $('#opacity-value').value=`${Math.round(opacity*100)} %`;
  if(!currentPreview)return;
  const {intensities,overlayFlags,width,height}=currentPreview;
  const {level,width:windowWidth}=WINDOWS[windowPreset],low=level-windowWidth/2;
  const base=new Uint8ClampedArray(intensities.length*4),overlay=new Uint8ClampedArray(base.length);
  for(let index=0;index<intensities.length;index++){
    const gray=Math.max(0,Math.min(255,Math.round((intensities[index]-low)*255/windowWidth)));
    const offset=index*4;
    base[offset]=base[offset+1]=base[offset+2]=gray;base[offset+3]=255;
    if(overlayFlags[index]){
      overlay[offset]=Math.round(gray*(1-opacity)+255*opacity);
      overlay[offset+1]=Math.round(gray*(1-opacity)+63*opacity);
      overlay[offset+2]=Math.round(gray*(1-opacity)+89*opacity);
    }else overlay[offset]=overlay[offset+1]=overlay[offset+2]=gray;
    overlay[offset+3]=255;
  }
  draw('#image-canvas',base,width,height);draw('#overlay-canvas',overlay,width,height);
  previewNote.textContent=`Corte axial ${currentPreview.slice+1} de ${currentPreview.geometry.imageSize[2]} · ventana ${level}/${windowWidth} HU · centro positivo (x ${currentPreview.center[0].toFixed(1)}, y ${currentPreview.center[1].toFixed(1)}, z ${currentPreview.center[2].toFixed(1)}).`;
}
for(const button of document.querySelectorAll('.window-preset'))button.addEventListener('click',()=>{
  windowPreset=button.dataset.preset;
  for(const item of document.querySelectorAll('.window-preset'))item.setAttribute('aria-pressed',String(item===button));
  renderPreview();
});
$('#overlay-opacity').addEventListener('input',renderPreview);

async function previewPair(imageFile,maskFile,source='single',resetResults=true) {
  const version=++previewVersion;
  const target=source==='single'?geometryMessage:$('#preview-geometry');
  if(source==='single'){
    geometryReady=false;updateRun();
    if(resetResults){clearResults();status.textContent='';singleProgress.hide();}
  }
  resetPreview();
  if(!imageFile||!maskFile){
    setGeometry('Selecciona imagen y máscara para revisar la geometría.','',target);
    return;
  }
  setGeometry('Leyendo archivos y comprobando dimensiones, orientación y origen…','',target);
  try {
    const [image,mask]=await Promise.all([imageFile.arrayBuffer(),maskFile.arrayBuffer()]);
    if(version!==previewVersion)return;
    const response=await runWorker({action:'preview',imageName:imageFile.name,maskName:maskFile.name},image,mask);
    if(version!==previewVersion)return;
    if(response.error)throw Error(response.error);
    if(!response.geometry?.ok){
      setGeometry(`Aviso de geometría: ${response.geometry?.issues?.join(' ')||'Los archivos no son compatibles.'}`,'error',target);
      return;
    }
    if(response.intensities){currentPreview=response;renderPreview();}
    const dimensions=response.geometry.imageSize.join('×');
    const spacing=response.geometry.spacing.map(value=>value.toFixed(3)).join('×');
    const details=`Geometría compatible: ${dimensions} vóxeles; tamaño ${spacing} mm. Máscara: ${response.positive||0} vóxeles positivos.`;
    if(response.warning){
      setGeometry(`${details} ${response.warning}`,'warning',target);
    }else if(response.positive!==response.labelOne){
      setGeometry(`${details} La vista muestra todas las etiquetas positivas; la extracción usa la etiqueta 1 (${response.labelOne} vóxeles).`,'warning',target);
    }else setGeometry(details,'ok',target);
    if(source==='single'){geometryReady=Boolean(response.ok);updateRun();}
  }catch(error){
    if(version!==previewVersion)return;
    setGeometry(`No se pudo revisar el caso: ${error.message}`,'error',target);
  }
}

function selectFile(kind,file){
  if(!file)return;
  if(!isVolumeFile(file.name)){
    setGeometry('Formato no admitido. Usa .nrrd, .nii o .nii.gz. Los archivos anteriores se conservaron.','warning');
    return;
  }
  if(kind==='image'){
    selectedImage=file;patientIdInput.value=suggestedId(file.name);
  }else selectedMask=file;
  $(`#${kind}-selected`).textContent=file.name;
  previewPair(selectedImage,selectedMask);
}
for(const [kind,input] of [['image',imageInput],['mask',maskInput]]){
  input.addEventListener('change',()=>selectFile(kind,input.files[0]));
  const zone=$(`#${kind}-drop`);
  zone.addEventListener('dragover',event=>{event.preventDefault();zone.classList.add('drag-over');});
  zone.addEventListener('dragleave',()=>zone.classList.remove('drag-over'));
  zone.addEventListener('drop',event=>{event.preventDefault();zone.classList.remove('drag-over');selectFile(kind,event.dataTransfer.files[0]);});
}
normalization.addEventListener('change',()=>{binWidth.value=normalization.value==='minmax'?'0.05':'75';});
const filterPanel=$('.filter-panel'),filterHint=$('.summary-hint');
function updateFilterHint(){
  const count=document.querySelectorAll('input[name="filter"]:checked').length;
  filterHint.textContent=filterPanel.open?`Selecciona filtros${count?` · ${count} activos`:''}`:
    count?`${count} filtros activos · abrir lista`:'Abrir lista y seleccionar';
}
filterPanel.addEventListener('toggle',updateFilterHint);
for(const input of document.querySelectorAll('input[name="filter"]'))input.addEventListener('change',updateFilterHint);

function extractionSettings(){
  const spacing='xyz'.split('').map(axis=>Number($(`#spacing-${axis}`).value));
  const filters=[...document.querySelectorAll('input[name="filter"]:checked')].map(input=>input.value);
  const logSigmas=$('#log-sigmas').value.split(',').map(value=>Number(value.trim()));
  const width=Number(binWidth.value);
  if(!(width>0))throw Error('BinWidth debe ser positivo.');
  if(resample.checked&&spacing.some(value=>!(value>0)))throw Error('El tamaño de vóxel debe ser positivo en los tres ejes.');
  if(filters.includes('log')&&(!logSigmas.length||logSigmas.some(value=>!(value>0))))throw Error('Ingresa uno o más valores sigma positivos, separados por coma.');
  return {action:'extract',normalization:normalization.value,resample:resample.checked,
    spacing,interpolation:interpolation.value,binWidth:width,filters,logSigmas};
}

const batchDirectory=$('#batch-directory'),batchSummary=$('#batch-summary'),batchPairs=$('#batch-pairs');
const batchRun=$('#batch-run'),batchCancel=$('#batch-cancel'),batchDownload=$('#batch-download');
function setMode(next){
  if(batchBusy||busy)return;
  previewVersion++;
  mode=next;
  $('#single-mode').setAttribute('aria-selected',String(mode==='single'));
  $('#batch-mode').setAttribute('aria-selected',String(mode==='batch'));
  for(const selector of ['#single-files','#single-actions'])$(selector).hidden=mode!=='single';
  for(const selector of ['#batch-files','#batch-actions'])$(selector).hidden=mode!=='batch';
  $('#preview-geometry').hidden=mode!=='batch';
  resetPreview();
  if(mode==='single'&&selectedImage&&selectedMask)previewPair(selectedImage,selectedMask,'single',false);
  if(mode==='batch'&&selectedBatchId){
    const pair=batchPlan.pairs.find(item=>item.id===selectedBatchId);
    if(pair)previewPair(pair.image,pair.mask,'batch');
  }
  resultSection.hidden=mode!=='single'||!allFeatures.length;
  $('#batch-result').hidden=mode!=='batch'||!batchPlan.pairs.length;
}
$('#single-mode').addEventListener('click',()=>setMode('single'));
$('#batch-mode').addEventListener('click',()=>setMode('batch'));
function renderBatchPlan(){
  const {pairs,missingMasks,missingImages,duplicates}=batchPlan;
  selectedBatchId=null;previewVersion++;resetPreview();
  batchSummary.className=`geometry ${pairs.length?'ok':'warning'}`;
  batchSummary.textContent=`${pairs.length} pares listos · ${missingMasks.length} sin máscara · ${missingImages.length} sin imagen · ${duplicates.length} duplicados.`;
  batchPairs.replaceChildren();
  for(const pair of pairs){
    const li=document.createElement('li'),button=document.createElement('button');
    button.type='button';button.className='secondary';button.textContent=`Ver ${pair.id}`;
    button.setAttribute('aria-pressed','false');
    button.addEventListener('click',()=>{
      if(batchBusy)return;
      selectedBatchId=pair.id;
      for(const other of batchPairs.querySelectorAll('button'))other.setAttribute('aria-pressed',String(other===button));
      previewPair(pair.image,pair.mask,'batch');
    });
    const files=document.createElement('span');files.className='case-files';
    files.textContent=`Imagen: ${pair.image.name} · Segmentación: ${pair.mask.name}`;
    li.append(button,files);batchPairs.append(li);
  }
  for(const item of [...missingMasks.map(id=>`${id}: falta máscara`),...missingImages.map(id=>`${id}: falta imagen`),...duplicates]){
    const li=document.createElement('li');li.className='error';li.textContent=item;batchPairs.append(li);
  }
  batchRun.disabled=!pairs.length;
  $('#batch-result').hidden=!pairs.length||mode!=='batch';
  $('#batch-result-body').replaceChildren();$('#batch-count').textContent='';
  batchRows=[];batchDownload.hidden=true;$('#batch-status').textContent='';batchProgress.hide();
}
batchDirectory.addEventListener('change',()=>{batchPlan=pairFiles([...batchDirectory.files]);renderBatchPlan();});

function appendBatchResult(id,state,count){
  const tr=document.createElement('tr');tr.insertCell().textContent=id;
  tr.insertCell().textContent=state;tr.insertCell().textContent=count==null?'—':String(count);
  $('#batch-result-body').append(tr);
}
batchRun.addEventListener('click',async()=>{
  if(batchBusy||!batchPlan.pairs.length)return;
  let settings;
  try{settings=extractionSettings();}catch(error){$('#batch-status').textContent=error.message;return;}
  batchBusy=true;batchCancelled=false;batchRows=[];batchRun.disabled=true;batchDirectory.disabled=true;
  for(const button of batchPairs.querySelectorAll('button'))button.disabled=true;
  batchCancel.hidden=false;batchDownload.hidden=true;
  $('#batch-result-body').replaceChildren();
  const pairs=[...batchPlan.pairs];let failed=0;
  const started=performance.now();
  batchProgress.show();
  const showBatch=(done,fraction,phase)=>{
    const reviewed=done+fraction,remaining=done>0?Math.ceil((performance.now()-started)/done*(pairs.length-reviewed)/1000):null;
    batchProgress.update(100*reviewed/pairs.length,phase,`${done} de ${pairs.length} casos revisados · ${Math.round(100*reviewed/pairs.length)} %`,`${elapsed(started)}${remaining===null?'':` · ~${remaining} s restantes`}`);
  };
  showBatch(0,0,'Preparando casos…');
  for(let index=0;index<pairs.length;index++){
    if(batchCancelled)break;
    const {id,image,mask}=pairs[index];
    $('#batch-status').textContent=`Procesando ${index+1}/${pairs.length}: ${id}…`;
    showBatch(index,0,`Caso ${index+1}/${pairs.length}: leyendo ${id}`);
    try{
      const [imageBuffer,maskBuffer]=await Promise.all([image.arrayBuffer(),mask.arrayBuffer()]);
      if(batchCancelled)break;
      const response=await runWorker({...settings,imageName:image.name,maskName:mask.name},imageBuffer,maskBuffer,(worker,reject)=>{activeBatchWorker={worker,reject};},({fraction,label})=>showBatch(index,fraction,`Caso ${index+1}/${pairs.length}: ${label}`));
      activeBatchWorker=null;
      if(!response.ok)throw Error(response.error);
      batchRows.push({id,features:response.features});
      appendBatchResult(id,'Completo',Object.keys(response.features).length);
    }catch(error){
      activeBatchWorker=null;
      if(batchCancelled)break;
      failed++;appendBatchResult(id,`Error: ${error.message}`,null);
    }
    $('#batch-count').textContent=`${batchRows.length} completos · ${failed} con error · ${index+1}/${pairs.length} revisados`;
    showBatch(index+1,0,`Revisados ${index+1} de ${pairs.length} casos`);
  }
  batchBusy=false;batchRun.disabled=!batchPlan.pairs.length;batchDirectory.disabled=false;batchCancel.hidden=true;
  for(const button of batchPairs.querySelectorAll('button'))button.disabled=false;
  batchDownload.hidden=!batchRows.length;
  $('#batch-status').textContent=batchCancelled?`Lote cancelado: ${batchRows.length} casos completos.`:
    `Lote terminado: ${batchRows.length} casos completos, ${failed} con error.`;
  if(batchCancelled)batchProgress.update($('#batch-progress-bar').value,`Cancelado · ${batchRows.length} casos completos`,$('#batch-progress-count').textContent,elapsed(started));
  else showBatch(pairs.length,0,'Extracción del lote completa');
});
batchCancel.addEventListener('click',()=>{
  batchCancelled=true;
  if(activeBatchWorker){activeBatchWorker.worker.terminate();activeBatchWorker.reject(Error('Cancelado'));activeBatchWorker=null;}
});
batchDownload.addEventListener('click',()=>{
  if(!batchRows.length)return;
  downloadCsv(featureCsv(batchRows),'radiomics_lote.csv');
});

function downloadCsv(csv,name){
  const url=URL.createObjectURL(new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

const featureParts = name => {
  if(name==='VoxelCount')return {imageType:'diagnostic',family:'diagnostic'};
  const underscore=name.indexOf('_');
  const imageType=name.slice(0,underscore);
  return {imageType,family:name.slice(underscore+1).split('_')[0]};
};
const imageTypeLabel = value => {
  if(value==='original')return 'Original';
  if(value==='diagnostic')return 'Diagnóstico';
  if(value.startsWith('wavelet-'))return value.replace('wavelet-','Wavelet ');
  const sigma=value.match(/^log-sigma-(.+)-mm-3D$/);
  if(sigma)return `LoG σ ${sigma[1].replaceAll('-','.')} mm`;
  return value;
};
function populateSelect(select,values,labels) {
  select.replaceChildren(new Option('Todas','all'));
  for(const value of values)select.add(new Option(labels(value),value));
}
function renderResults() {
  const type=imageTypeFilter.value,family=familyFilter.value,query=featureSearch.value.trim().toLowerCase();
  const fragment=document.createDocumentFragment();let shown=0;
  for(const [name,value,parts] of allFeatures) {
    if(type!=='all'&&parts.imageType!==type||family!=='all'&&parts.family!==family||query&&!name.toLowerCase().includes(query))continue;
    const row=document.createElement('tr');
    row.insertCell().textContent=name;
    row.insertCell().textContent=String(value);
    fragment.append(row);shown++;
  }
  resultBody.replaceChildren(fragment);
  resultCount.textContent=`${shown} de ${allFeatures.length} valores`;
}
for(const control of [imageTypeFilter,familyFilter,featureSearch])control.addEventListener(control===featureSearch?'input':'change',renderResults);

run.addEventListener('click',async()=>{
  if(!geometryReady||!selectedImage||!selectedMask)return;
  const version=previewVersion;
  let settings;
  try{settings=extractionSettings();}catch(error){status.textContent=error.message;return;}
  busy=true;updateRun();clearResults();status.textContent='Leyendo archivos locales…';
  const started=performance.now();singleProgress.show();
  const showSingle=(fraction,label)=>singleProgress.update(fraction*100,label,`${Math.round(fraction*100)} % · avance por etapas`,elapsed(started));
  showSingle(0,'Leyendo archivos locales…');
  try{
    const [image,mask]=await Promise.all([selectedImage.arrayBuffer(),selectedMask.arrayBuffer()]);
    if(version!==previewVersion)return;
    status.textContent='Calculando características en segundo plano…';
    const response=await runWorker({...settings,imageName:selectedImage.name,maskName:selectedMask.name},image,mask,null,({fraction,label})=>showSingle(fraction,label));
    if(version!==previewVersion)return;
    if(!response.ok)throw Error(response.error);
    allFeatures=Object.entries(response.features).map(([name,value])=>[name,value,featureParts(name)]);
    const imageTypes=[...new Set(allFeatures.map(([, ,parts])=>parts.imageType))]
      .sort((a,b)=>a==='original'?-1:b==='original'?1:a==='diagnostic'?1:b==='diagnostic'?-1:a.localeCompare(b));
    const familyOrder=['firstorder','shape','glcm','glrlm','glszm','gldm','ngtdm','diagnostic'];
    const families=[...new Set(allFeatures.map(([, ,parts])=>parts.family))]
      .sort((a,b)=>familyOrder.indexOf(a)-familyOrder.indexOf(b));
    populateSelect(imageTypeFilter,imageTypes,imageTypeLabel);
    populateSelect(familyFilter,families,value=>FAMILY_LABELS[value]||value);
    featureSearch.value='';renderResults();
    resultSection.hidden=false;download.hidden=false;
    status.textContent=`Cálculo completo: ${allFeatures.length} valores.`;
    showSingle(1,'Extracción completa');
  }catch(error){if(version===previewVersion){status.textContent=`Error: ${error.message}`;singleProgress.update($('#single-progress-bar').value,'Extracción interrumpida',$('#single-progress-count').textContent,elapsed(started));}}
  finally{busy=false;updateRun();}
});

download.addEventListener('click',()=>{
  if(!allFeatures.length)return;
  const patientId=patientIdInput.value.trim()||suggestedId(selectedImage.name);
  const cell=value=>`"${String(value).replaceAll('"','""')}"`;
  const names=allFeatures.map(([name])=>name);
  const csv=[['patient_id',...names].map(cell).join(','),
    [patientId,...allFeatures.map(([,value])=>value)].map(cell).join(',')].join('\n');
  downloadCsv(csv,`${patientId.replace(/[^a-zA-Z0-9._-]/g,'_')}_radiomics.csv`);
});
