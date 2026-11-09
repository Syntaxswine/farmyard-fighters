export const NAUTILUS_COMMIT='2502646482218524fd5129641da769bb82462e4d';
export function sectorFile(file){
  if(typeof file!=='string'||!/^[A-Za-z0-9_./-]+\.json$/.test(file)||file.startsWith('/')||file.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Expected a relative sector JSON file inside the project.');
  return file;
}
export function grid(project){
  if(!Number.isInteger(project?.columns)||!Number.isInteger(project?.rows)||project.columns<1||project.rows<1||project.columns*project.rows>256||project.sectorSize!==240||!Array.isArray(project.sectors))throw Error('Expected a bounded project of 240 m sectors.');
  const ids=new Set(),positions=new Set();
  for(const s of project.sectors){const p=s.column+','+s.row;
    if(!s.id||ids.has(s.id)||positions.has(p)||!Number.isInteger(s.column)||!Number.isInteger(s.row)||s.column<0||s.column>=project.columns||s.row<0||s.row>=project.rows||s.origin?.x!==s.column*240||s.origin?.y!==s.row*240)throw Error('Invalid or duplicate sector '+s.id);
    sectorFile(s.file);ids.add(s.id);positions.add(p);
  }
  return [...project.sectors].sort((a,b)=>a.row-b.row||a.column-b.column);
}
export function neighbors(project,s){
  return [['north',0,-1],['east',1,0],['south',0,1],['west',-1,0]].map(([direction,dx,dy])=>({direction,sector:project.sectors.find(n=>n.column===s.column+dx&&n.row===s.row+dy)})).filter(n=>n.sector);
}
export function readiness(report,s,hash){
  const row=report?.nautilusCommit===NAUTILUS_COMMIT&&report.sectors?.find(r=>r.id===s.id&&r.file===s.file&&r.sha256===hash);
  return row?{ready:row.nativeReady===true,label:row.nativeReady?'Native import ready':'Native import blocked',errors:row.errors||[]}:{ready:false,label:'Import unverified',errors:['Run the pinned audit against this exact sector file.']};
}

export function landmarksFor(project,sector,features=[]){
  const x=sector.origin.x,y=sector.origin.y,inside=b=>Array.isArray(b)&&b.length===4&&b[2]>=x&&b[0]<x+240&&b[3]>=y&&b[1]<y+240;
  const labels=(sector.landmarks||[]).map(l=>typeof l==='string'?l:l.name||l.label||l.id);
  for(const l of project.landmarks||[]){
    const p=l.townMetres,feature=l.source&&features.find(f=>f.osm?.type===l.source.type&&f.osm?.id===l.source.id);
    if((p&&inside([p.x,p.y,p.x,p.y]))||(feature&&inside(feature.bounds)))labels.push(l.label||l.name||l.id);
  }
  for(const f of features)if(f.tags?.name&&(f.tags.leisure==='park'||f.tags.tourism||f.tags.historic)&&inside(f.bounds))labels.push(f.tags.name);
  return [...new Set(labels.filter(Boolean))].sort((a,b)=>a.localeCompare(b));
}
