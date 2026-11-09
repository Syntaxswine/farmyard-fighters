import fs from 'node:fs';
import path from 'node:path';
import {hash,confined,writeJSON,root} from './review-mount-dora-workshop.mjs';
export function snapshotProject(projectFile,destination){
  if(!path.resolve(destination).startsWith(path.join(root,'artifacts')+path.sep))throw Error('Snapshot destination must be task-owned artifacts.');
  const bytes=fs.readFileSync(projectFile),project=JSON.parse(bytes),base=path.dirname(projectFile),files=[];
  fs.mkdirSync(destination,{recursive:true});
  for(const s of project.sectors){
    const input=fs.readFileSync(confined(base,s.file)),actual=hash(input);
    if(s.metrics?.sha256&&s.metrics.sha256!==actual)throw Error('Source generation changed during snapshot: '+s.id);
    files.push({file:s.file,sha256:actual});const output=confined(destination,s.file);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,input);
  }
  for(const optional of [project.featuresFile,project.atlasFile].filter(Boolean)){
    const input=fs.readFileSync(confined(base,optional));files.push({file:optional,sha256:hash(input)});
    const output=confined(destination,optional);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,input);
  }
  if(hash(fs.readFileSync(projectFile))!==hash(bytes))throw Error('Project manifest changed during snapshot; retry when generation is complete.');
  fs.writeFileSync(path.join(destination,'project.json'),bytes);
  writeJSON(path.join(destination,'snapshot-receipt.json'),{sourceProject:path.resolve(projectFile),projectSha256:hash(bytes),files});
  return path.join(destination,'project.json');
}
if(process.argv[1]&&path.basename(process.argv[1])==='snapshot-mount-dora-workshop.mjs'){
  if(process.argv.length!==4)throw Error('Usage: node tools/snapshot-mount-dora-workshop.mjs PROJECT.json DESTINATION');
  console.log(snapshotProject(path.resolve(process.argv[2]),path.resolve(process.argv[3])));
}
