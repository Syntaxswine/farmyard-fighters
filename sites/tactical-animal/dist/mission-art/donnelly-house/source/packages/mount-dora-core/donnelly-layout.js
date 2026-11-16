// Engine-owned interpretation, not a surveyed Donnelly floor plan. Wall axes
// are local metres; apply HOUSE.origin once for engine coordinates.
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
export const HOUSE=freeze({profile:'interior-v1',origin:[386.5,469.5],groundH:.848,storyM:2.12,slabM:.12,wallM:.16,upperH:2.968,atticH:5.088,body:{radiusM:.23,heightM:1.8}});
export const HOUSE_ROOMS=[
 ['G01','Entry parlor',[11,6,16,12]],['G02','Family parlor',[11,0,16,6]],['G03','Dining room',[6,0,11,5]],['G04','Study',[6,9,11,12]],['G05','Main stair hall',[6,5,11,9]],
 ['G06','Kitchen',[0,9,4,13]],['G07','Scullery',[4,11,6,13]],['G08','Pantry',[4,9,6,11]],['G09','Larder',[0,7,2,9]],['G10','Service passage',[2,7,6,9]],['G11','Back hall',[4,4,6,7]],['G12','Store',[0,4,4,7]],
 ['U01','Principal chamber',[11,6,16,12]],['U02','Front chamber',[11,0,16,6]],['U03','Chamber C',[6,9,11,12]],['U04','Chamber D',[6,0,11,5]],['U05','Upper landing',[6,5,11,9]],
 ['U06','Rear chamber',[0,8,4,13]],['U07','Shared bathroom',[4,10,6,13]],['U08','Linen room',[0,7,4,8]],['U09','Rear corridor',[4,4,6,10]],['U10','Upper store',[0,4,4,7]]
].map(([id,label,bounds])=>({id,label,bounds,level:id[0]==='G'?0:1}));
// Wider return stair: five .30m goings in each flight, six rises per flight.
// This leaves .94m clear east and 1.00m north galleries, 1.20m west/turn landings.
export const HOUSE_STAIR=freeze({id:'main-return-1p2-v1',x0:7.28,turnX:8.78,endX:9.98,y0:6.08,y1:7.28,y2:7.4,y3:8.6,widthM:1.2,landingM:1.2,risers:12,riseM:2.12/12,goingM:.3,hole:[7.28,6.08,9.98,8.6]});
// Door IDs are stable semantic keys, distinct from compiled generated IDs.
export const HOUSE_DOORS=[
 ['front','Outside','G01',[16,7.4],'y',1,false,1],['parlors','G01','G02',[13.5,6],'x',1.8,true,0],
 ['g-parlor-hall','G01','G05',[11,6.65],'y',1,true,-1],['g-family-dining','G02','G03',[11,2.5],'y',1,true,1],
 ['g-dining-hall','G03','G05',[6.68,5],'x',1,true,1],['g-study-hall','G04','G05',[6.68,9],'x',1,true,1],
 ['g-dining-back','G03','G11',[6,4.5],'y',.8,true,1],['g-hall-back','G05','G11',[6,6.5],'y',.8,true,1],
 ['g-passage-back','G10','G11',[5,7],'x',1,true,1],['g-kitchen-passage','G06','G10',[3,9],'x',1,true,1],
 ['rear','Outside','G06',[0,11],'y',1,false,-1],['g-scullery','G06','G07',[4,12],'y',1,true,-1],['g-pantry','G06','G08',[4,10],'y',1,true,-1],['g-larder','G09','G10',[2,8],'y',1,true,1],['g-store','G10','G12',[3.1,7],'x',1,true,-1],
 ['u-principal','U01','U05',[11,6.65],'y',1,false,-1],['u-front','U02','U05',[11,5.5],'y',.8,true,1],
 ['u-chamber-c','U03','U05',[6.68,9],'x',1,true,1],['u-chamber-d','U04','U05',[6.68,5],'x',1,true,-1],['u-rear-corridor','U05','U09',[6,6],'y',1,true,1],
 ['u-rear-chamber','U06','U09',[4,9],'y',1,true,1],['u-bath','U07','U09',[5,10],'x',1,true,1],['u-linen','U08','U10',[2,7],'x',1,true,-1],['u-store','U09','U10',[4,5.5],'y',1,true,1]
].map(([id,from,to,at,axis,widthM,open,swing])=>({id,from,to,at,axis,widthM,open,swing,hand:'start',level:to[0]==='U'||from[0]==='U'?1:0}));
export const HOUSE_WINDOWS=[
 [0,'G01',[16,9.5],'y',1.2],[0,'G02',[16,3.5],'y',1.2],[0,'G02',[13,0],'x',1.2],[0,'G03',[8.5,0],'x',1.2],[0,'G04',[8.5,12],'x',1.2],[0,'G06',[2,13],'x',1.2],[0,'G07',[5,13],'x',1],[0,'G09',[0,8],'y',.6],
 [1,'U01',[16,9.5],'y',1.2],[1,'U02',[18,3.5],'y',1.8],[1,'U02',[13,0],'x',1.2],[1,'U03',[8.5,12],'x',1.2],[1,'U04',[8.5,0],'x',1.2],[1,'U06',[2,13],'x',1.2],[1,'U07',[5,13],'x',.8]
].map(([level,room,at,axis,widthM],i)=>({id:'window-'+i,level,room,at,axis,widthM,bottomM:level===1&&i===9?.28:.55,heightM:level===1&&i===9?1.7:1.18}));
export const HOUSE_TURRET=freeze({centre:[15.6,11.4],radiusM:1.5,sides:6});

for(const value of [HOUSE_ROOMS,HOUSE_DOORS,HOUSE_WINDOWS])freeze(value);
