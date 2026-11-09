import {mapGeometryRevision} from './map-geometry-cache.js';
const EMPTY=Object.freeze([]);
const fields=['x','y','z','kind','rotated','rotation'];
// Footprint indexes depend only on placement, not inventories, dialogue or paint.
// Exact snapshots avoid JSON allocation while detecting mutable editor changes.
// Live encounters use the existing explicit geometry invalidation contract.
export class SceneryIndex{
 constructor(build,select=null){this.build=build;this.select=select;this.entries=new WeakMap();}
 get(map){
  const props=map.props||EMPTY,revision=mapGeometryRevision(map),old=this.entries.get(props);
  if(old&&revision!==undefined&&old.revision===revision)return old.index;
  const selected=this.select?props.filter(this.select):props;
  if(old&&old.stamp.length===selected.length&&selected.every((p,i)=>old.stamp[i][0]===p&&fields.every((k,j)=>old.stamp[i][j+1]===p[k]))){old.revision=revision;return old.index;}
  const index=this.build(selected),stamp=selected.map(p=>[p,...fields.map(k=>p[k])]);this.entries.set(props,{revision,stamp,index});return index;
 }
}
