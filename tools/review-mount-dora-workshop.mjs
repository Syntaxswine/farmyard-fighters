import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {grid,sectorFile,NAUTILUS_COMMIT} from '../maps/mount-dora/workshop/model.js';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function writeJSON(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');}
export function confined(base,relative){
  const file=path.resolve(base,relative);
  if(!file.startsWith(path.resolve(base)+path.sep))throw Error('Path escapes its project: '+relative);
  return file;
}
export function sourceChanges(before,after,at='$',result=[]){
  if(before===null||typeof before!=='object'){
    if(!Object.is(before,after))result.push({path:at,before,after});return result;
  }
  if(after===null||typeof after!=='object'||Array.isArray(before)!==Array.isArray(after)){result.push({path:at,before,after});return result;}
  if(Array.isArray(before)&&before.length!==after.length)result.push({path:at+'.length',before:before.length,after:after.length});
  for(const key of Object.keys(before))sourceChanges(before[key],after[key],at+'.'+key,result);
  return result;
}
export function addedPaths(before,after,at='$',result=[]){
  if(!before||typeof before!=='object'||!after||typeof after!=='object')return result;
  for(const key of Object.keys(after)){if(!Object.hasOwn(before,key))result.push(at+'.'+key);else addedPaths(before[key],after[key],at+'.'+key,result);}return result;
}
export function verifySource(source,gitSource=source){
  const listing=execFileSync('git',['-C',gitSource,'ls-tree','-rz',NAUTILUS_COMMIT],{encoding:'utf8',maxBuffer:4e6,windowsHide:true});
  const entries=listing.split('\0').filter(Boolean),failures=[],physicalRoot=fs.realpathSync(source)+path.sep;
  for(const line of entries){const tab=line.indexOf('\t'),[mode,type,oid]=line.slice(0,tab).split(' '),name=line.slice(tab+1);
    if(type!=='blob'||mode==='120000')throw Error('Unsupported source entry '+name);
    const file=confined(source,name);if(!fs.realpathSync(file).startsWith(physicalRoot))throw Error('Pinned source file resolves outside snapshot: '+name);
    const bytes=fs.readFileSync(file),actual=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
    if(actual!==oid)failures.push(name);
  }
  if(failures.length)throw Error('Pinned source differs: '+failures.slice(0,12).join(', '));
  return {nautilusCommit:NAUTILUS_COMMIT,trackedBlobsVerified:entries.length};
}
export async function fixtureProject(N,out){
  fs.mkdirSync(path.join(out,'sectors'),{recursive:true});
  const specs=[['fixture-downtown',0,0,'Synthetic downtown'],['fixture-boundary',1,0,'Synthetic boundary'],['fixture-shoreline',0,1,'Synthetic shoreline'],['fixture-water',1,1,'Synthetic water only']];
  const sectors=[];
  for(const [id,column,row,name]of specs){
    const d=N.createMapDocument(name);
    if(id==='fixture-downtown'){
      for(const command of [{tool:'wall-run',start:{x:80,y:70,z:0},end:{x:92,y:73,z:0},options:{exact:true,stories:2,material:'brick'}},
        {tool:'sloped-roof',options:{exact:true,x:105,y:90,width:12,depth:8,eaves:1,style:'gable',axis:'x',direction:1,pitch:35,overhang:.3,material:'slate',seed:42}}]){
        const r=d.apply(command);assert(r.ok,r.error);
      }
    }
    const map=JSON.parse(d.export());
    if(id==='fixture-shoreline')for(let y=128;y<240;y++)map.terrain[y].fill('water');
    if(id==='fixture-water'){map.terrain.forEach(r=>r.fill('water'));map.starts=[];map.exits=[];}
    map.metadata={mountDora:{synthetic:true,sectorId:id,origin:{x:column*240,y:row*240},sourceFeatureIds:['review:fixture/'+id],authoringPreviewAnchors:id!=='fixture-water'}};
    map.sourceAudit={bounded:true,featureId:'review:fixture/'+id,nested:{coordinates:[1.25,2.75],keep:{unicode:'shore ↔ town'}}};
    const file='sectors/'+id+'.json';writeJSON(path.join(out,file),map);
    sectors.push({id,column,row,name,file,nativeImport:{ready:id!=='fixture-water'},origin:{x:column*240,y:row*240},landmarks:[name+' — not surveyed geography']});
  }
  const project={version:1,id:'mount-dora-workshop-synthetic-fixtures',name:'Synthetic workshop bridge fixtures',sectorSize:240,columns:2,rows:2,sectors};
  writeJSON(path.join(out,'project.json'),project);return path.join(out,'project.json');
}
function editCandidate(d){
  const size=d.map.width;
  // A supported terrain change; never move anchors or delete a source feature for a test.
  for(const [x,y]of [[18,18],[30,30],...Array.from({length:400},(_,i)=>[8+(i%20)*11,8+Math.floor(i/20)*11])]){
    if(x>=size||y>=d.map.height)continue;
    const terrain=d.map.terrain[y][x];if(['water','void','crate','woodland-dense'].includes(terrain))continue;
    const command=terrain==='floor'?{tool:'texture',options:{groundKind:'ground-concrete'},start:{x,y,z:0}}:{tool:'floor',start:{x,y,z:0}};
    const r=d.preview(command);if(r.ok&&r.map.terrain[y][x]!==terrain)return command;
  }
  return null;
}
export function auditMap(N,bytes){
  const input=JSON.parse(bytes.toString('utf8')),errors=N.validateMap(input,{connectivity:false});
  const result={sha256:hash(bytes),bytes:bytes.length,levels:input.levels,nativeReady:false,errors:[...errors],
    features:{wallRuns:input.wallRuns?.segments?.length||0,slopedRoofs:input.slopedRoofs?.roofs?.length||0,buildingPrefabs:input.buildingPrefabs?.instances?.length||0}};
  if(errors.length)return result;
  try{
    const d=N.openDocument(bytes.toString('utf8')),before=d.export(),opened=JSON.parse(before);
    result.changedSourceValues=sourceChanges(input,opened);result.nativeAddedPaths=addedPaths(input,opened);
    assert.equal(result.changedSourceValues.length,0,'Import changes or removes source data');
    const command=editCandidate(d);assert(command,'No safe supported terrain edit found');
    const applied=d.apply(command);assert(applied.ok,applied.error);
    const edited=d.export();assert.notEqual(edited,before);assert(d.undo());assert.equal(d.export(),before);
    assert(d.redo());assert.equal(d.export(),edited);assert.equal(N.openDocument(edited).export(),edited);
    result.editCommand=command;result.history=true;result.exportReopen=true;result.nativeReady=true;
    result.normalizedSha256=hash(before);
  }catch(error){result.errors.push(error.message);}
  return result;
}
export async function audit({source,gitSource,project,fixtures=false,out=path.join(root,'artifacts/mount-dora-workshop')}){
  const provenance=verifySource(source,gitSource),N=await import(pathToFileURL(path.join(source,'packages/map-core/index.js')).href);
  if(fixtures)project=await fixtureProject(N,path.join(out,'fixtures'));
  if(!project)throw Error('Supply --project or explicitly choose --fixtures.');
  const projectBytes=fs.readFileSync(project),town=JSON.parse(projectBytes),sectors=grid(town),base=path.dirname(project),rows=[];
  for(const sector of sectors){const bytes=fs.readFileSync(confined(base,sectorFile(sector.file)));if(sector.metrics?.sha256&&sector.metrics.sha256!==hash(bytes))throw Error('Sector differs from the project manifest: '+sector.id);rows.push({id:sector.id,file:sector.file,...auditMap(N,bytes)});}
  const report={schemaVersion:1,nautilusCommit:NAUTILUS_COMMIT,source:provenance,sourceMode:fixtures?'fixtures':'project',projectId:town.id,projectSha256:hash(projectBytes),sourceDigest:town.generation?.sourceDigest||null,
    sectorCount:rows.length,expectedSectorCount:town.columns*town.rows,geographicFileCount:rows.length,
    nativeReadyCount:rows.filter(r=>r.nativeReady).length,sectors:rows,unexpectedErrors:rows.filter(r=>town.sectors.find(s=>s.id===r.id).nativeImport?.ready===true&&!r.nativeReady).map(r=>({id:r.id,errors:r.errors}))};
  assert.equal(rows.length,town.columns*town.rows,'Project grid is incomplete');
  writeJSON(path.join(out,'audit.json'),report);
  assert.equal(report.unexpectedErrors.length,0,'Native-ready sector unexpectedly failed: '+JSON.stringify(report.unexpectedErrors));
  return {report,project:path.resolve(project),source:path.resolve(source),out:path.resolve(out),N};
}
export function argumentsOf(args){
  const options={};
  for(let i=0;i<args.length;i++){const key=args[i];if(key==='--fixtures')options.fixtures=true;else if(['--source','--git-source','--project','--out'].includes(key))options[{'--source':'source','--git-source':'gitSource','--project':'project','--out':'out'}[key]]=path.resolve(args[++i]);else throw Error('Unknown argument '+key);}
  return options;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=await audit(argumentsOf(process.argv.slice(2)));
  console.log(JSON.stringify({sectorCount:result.report.sectorCount,nativeReady:result.report.nativeReadyCount,blocked:result.report.sectors.filter(r=>!r.nativeReady).map(r=>({id:r.id,errors:r.errors})),report:path.join(result.out,'audit.json')},null,2));
}
