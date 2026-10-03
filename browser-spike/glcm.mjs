const EPS=Number.EPSILON;
const entropy = values => {let h=0;for(const p of values) if(p) h-=p*Math.log2(p+EPS);return h;};

function mcc(edges, px, levels, allLevelCount) {
  if (allLevelCount<2) return 1;
  if (levels.length<2) return 0;
  const n=levels.length;
  const pos=new Map(levels.map((i,k)=>[i,k]));
  const a=Array.from({length:n},()=>new Float64Array(n));
  for(const [i,j,p] of edges)a[pos.get(i)][pos.get(j)]=p/Math.sqrt(px.get(i)*px.get(j));
  // Jacobi diagonalization of the symmetric normalized co-occurrence matrix.
  // Its squared eigenvalues are those of PyRadiomics' Q matrix.
  for(let sweep=0;sweep<50;sweep++) {
    let maximum=0;
    for(let p=0;p<n-1;p++)for(let q=p+1;q<n;q++) {
      const off=a[p][q];maximum=Math.max(maximum,Math.abs(off));
      if(Math.abs(off)<1e-14)continue;
      const tau=(a[q][q]-a[p][p])/(2*off);
      const t=(tau>=0?1:-1)/(Math.abs(tau)+Math.sqrt(1+tau*tau));
      const c=1/Math.sqrt(1+t*t),s=t*c;
      a[p][p]-=t*off;a[q][q]+=t*off;a[p][q]=a[q][p]=0;
      for(let k=0;k<n;k++)if(k!==p&&k!==q) {
        const akp=a[k][p],akq=a[k][q];
        a[k][p]=a[p][k]=c*akp-s*akq;
        a[k][q]=a[q][k]=s*akp+c*akq;
      }
    }
    if(maximum<1e-13)break;
  }
  const eigen=a.map((row,k)=>Math.abs(row[k])).sort((x,y)=>y-x);
  return eigen[1];
}

function oneDirection(pairs,total,ng) {
  const edges=[];const px=new Map(),py=new Map(),ps=new Map(),pd=new Map();
  let ux=0,uy=0,energy=0,hxy=0,max=0,ac=0,contrast=0;
  for(const [key,n] of pairs) {
    const [i,j]=key.split(',').map(Number),p=n/total;
    edges.push([i,j,p]);px.set(i,(px.get(i)||0)+p);py.set(j,(py.get(j)||0)+p);
    ps.set(i+j,(ps.get(i+j)||0)+p);pd.set(Math.abs(i-j),(pd.get(Math.abs(i-j))||0)+p);
    ux+=i*p;uy+=j*p;energy+=p*p;hxy-=p*Math.log2(p+EPS);max=Math.max(max,p);
    ac+=i*j*p;contrast+=(i-j)**2*p;
  }
  let shade=0,prominence=0,tendency=0,cov=0,varx=0,vary=0,hxy1=0;
  for(const [i,j,p] of edges) {
    const delta=i+j-ux-uy;
    shade+=p*delta**3;prominence+=p*delta**4;tendency+=p*delta**2;
    cov+=p*(i-ux)*(j-uy);varx+=p*(i-ux)**2;vary+=p*(j-uy)**2;
    hxy1-=p*Math.log2(px.get(i)*py.get(j)+EPS);
  }
  const hx=entropy(px.values()),hy=entropy(py.values());
  let hxy2=0;for(const a of px.values())for(const b of py.values()) hxy2-=a*b*Math.log2(a*b+EPS);
  let diffavg=0,diffvar=0,idm=0,idmn=0,id=0,idn=0,iv=0,sumavg=0;
  for(const [k,p] of pd) diffavg+=k*p;
  for(const [k,p] of pd) {
    diffvar+=p*(k-diffavg)**2;idm+=p/(1+k*k);idmn+=p/(1+k*k/ng**2);
    id+=p/(1+k);idn+=p/(1+k/ng);if(k)iv+=p/k**2;
  }
  for(const [k,p] of ps)sumavg+=k*p;
  const levels=[...px.keys()].sort((a,b)=>a-b);
  return {
    Autocorrelation:ac,JointAverage:ux,ClusterProminence:prominence,ClusterShade:shade,
    ClusterTendency:tendency,Contrast:contrast,Correlation:varx*vary?cov/(Math.sqrt(varx*vary)+EPS):1,
    DifferenceAverage:diffavg,DifferenceEntropy:entropy(pd.values()),DifferenceVariance:diffvar,
    JointEnergy:energy,JointEntropy:hxy,Imc1:Math.max(hx,hy)?(hxy-hxy1)/Math.max(hx,hy):0,
    Imc2:hxy2===hxy?0:Math.sqrt(Math.max(0,1-Math.exp(-2*(hxy2-hxy)))),
    Idm:idm,MCC:mcc(edges,px,levels,ng),Idmn:idmn,Id:id,Idn:idn,InverseVariance:iv,
    MaximumProbability:max,SumAverage:sumavg,SumEntropy:entropy(ps.values()),SumSquares:varx,
  };
}

export function glcmFeatures(bins, selected, size) {
  const directions=[];
  for(let z=-1;z<=1;z++)for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)
    if(z>0||z===0&&y>0||z===0&&y===0&&x>0) directions.push([x,y,z]);
  const [sx,sy,sz]=size,plane=sx*sy;
  const ng=Math.max(...bins.values());
  const sums={};let valid=0;
  for(const [dx,dy,dz] of directions) {
    const pairs=new Map();let total=0;
    for(const [idx] of selected) {
      const x=idx%sx,y=Math.floor(idx/sx)%sy,z=Math.floor(idx/plane);
      const xx=x+dx,yy=y+dy,zz=z+dz;
      if(xx<0||yy<0||zz<0||xx>=sx||yy>=sy||zz>=sz)continue;
      const other=xx+sx*(yy+sy*zz);
      if(!bins.has(other))continue;
      const i=bins.get(idx),j=bins.get(other);
      for(const key of [`${i},${j}`,`${j},${i}`])pairs.set(key,(pairs.get(key)||0)+1);
      total+=2;
    }
    if(!total)continue;
    const values=oneDirection(pairs,total,ng);valid++;
    for(const [key,value] of Object.entries(values))sums[key]=(sums[key]||0)+value;
  }
  if(!valid)throw Error('ROI sin pares de vóxeles vecinos');
  return Object.fromEntries(Object.entries(sums).map(([key,value])=>[`original_glcm_${key}`,value/valid]));
}
