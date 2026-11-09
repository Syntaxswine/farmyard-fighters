import {sectorLoading} from './sector-loading.js';
// Show and paint the light-weight loading view before importing the simulation,
// decoding the authored sector or compiling its first scene.
let attempted=false;
const campaign=new URLSearchParams(location.search).has('campaign');
sectorLoading.run(async()=>{
 if(attempted){location.reload();return;}attempted=true;
 await import('./battle-3d.js');
},{back:()=>{location.href=campaign?'campaign.html':'../../../index.html';},backLabel:campaign?'Campaign map':'Main menu'}).catch(error=>console.error('Sector loading failed:',error));
