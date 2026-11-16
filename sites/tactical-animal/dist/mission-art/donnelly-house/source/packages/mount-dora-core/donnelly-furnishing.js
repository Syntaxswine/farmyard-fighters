import {HOUSE} from './donnelly-layout.js';
// Small engine-owned arrangements made from the ordinary solid/wood/material
// recipes. No whole-building donor runtime, external art or hidden supports.
export function donnellyFurnishings(){
 const pieces=[];let serial=0;
 const solid=(room,label,b,h0,h1,material='wood')=>{const level=room[0]==='U'?1:room[0]==='A'?2:0,floor=HOUSE.groundH+level*HOUSE.storyM;pieces.push({id:'furn-'+serial++,room,label,level,material,bounds:{min:{x:b[0],y:b[1],h:floor+h0},max:{x:b[2],y:b[3],h:floor+h1}}});};
 const table=(r,label,x,y,w,d)=>{solid(r,label,[x,y,x+w,y+d],.68,.76);for(const [dx,dy]of [[.07,.07],[w-.14,.07],[.07,d-.14],[w-.14,d-.14]])solid(r,label+' leg',[x+dx,y+dy,x+dx+.07,y+dy+.07],0,.68);};
 const chair=(r,x,y)=>{solid(r,'Chair seat',[x-.23,y-.23,x+.23,y+.23],0,.44);solid(r,'Chair back',[x-.23,y+.17,x+.23,y+.24],.44,.9);};
 const sofa=(r,x,y)=>{solid(r,'Settee base',[x,y,x+1.8,y+.7],0,.38);solid(r,'Settee cushion',[x+.1,y+.08,x+1.7,y+.57],.38,.5,'fabric-green');solid(r,'Settee back',[x,y+.6,x+1.8,y+.75],.38,1.02);for(const dx of [0,1.68])solid(r,'Settee arm',[x+dx,y,x+dx+.12,y+.7],.38,.69);};
 const bed=(r,x,y)=>{solid(r,'Bed frame',[x,y,x+1.5,y+2],0,.4);solid(r,'Linen mattress',[x+.05,y+.06,x+1.45,y+1.94],.4,.59,'linen');solid(r,'Bed headboard',[x,y+1.9,x+1.5,y+2.03],.4,1.12);solid(r,'Folded cover',[x+.06,y+.25,x+1.44,y+.9],.59,.64,'fabric-green');};
 sofa('G01',12.6,10.7);table('G01','Conversation table',13,9.2,1.2,.6);solid('G01','Turret window seat',[16.05,11.05,16.65,11.75],0,.47,'fabric-green');
 table('G02','Reading table',13,2.5,1.2,.75);chair('G02',12.45,2.85);chair('G02',14.75,2.85);solid('G02','Book cabinet',[11.18,.4,11.55,1.7],0,1.55);
 table('G03','Dining table',7.5,1.7,2,1.3);for(const x of [8,9])for(const y of [1.1,3.6])chair('G03',x,y);solid('G03','Sideboard',[7.5,.18,9.5,.65],0,.95);
 table('G04','Writing desk',8.5,10,1.5,.7);chair('G04',8,10.35);solid('G04','Library shelves',[6.3,11.62,8,11.88],0,1.65);
 table('G06','Kitchen worktable',1.25,12.1,1.6,.7);solid('G06','Cookstove',[.2,9.2,.95,9.9],0,.72,'iron');solid('G06','Stove top',[.16,9.16,.99,9.94],.72,.8,'iron');
 solid('G07','Scullery wash counter',[5.28,11.2,5.8,12.8],0,.78);solid('G07','Wash basin',[5.26,11.45,5.82,12.15],.78,.9,'ceramic');
 solid('G08','Pantry shelves',[5.45,9.2,5.82,10.8],0,1.55);solid('G09','Larder shelves',[.17,7.2,.52,8.8],0,1.4);solid('G12','Store crates',[.35,4.35,1.2,5.2],0,.75);solid('G12','Back store shelves',[.3,6.4,1.9,6.8],0,1.45);
 bed('U01',12.3,9.5);solid('U01','Wardrobe',[15.12,8.1,15.72,9],0,1.68);solid('U01','Turret window seat',[16.05,11.05,16.65,11.75],0,.47,'fabric-green');
 bed('U02',12,1.1);solid('U02','Dressing chest',[17.15,4.5,17.75,5.65],0,.85);table('U02','Bay writing table',16.55,1.25,1,.5);
 bed('U03',8.65,9.55);solid('U03','Clothes chest',[7,11.3,8.15,11.8],0,.8);
 bed('U04',8.7,1);solid('U04','Chamber wardrobe',[6.2,1,6.75,2.2],0,1.6);
 bed('U06',.4,10.5);solid('U06','Rear chamber chest',[.25,8.25,1.4,8.8],0,.8);
 solid('U07','Shared bath tub',[4.45,11.8,5.6,12.65],0,.62,'ceramic');solid('U07','Basin pedestal',[5.4,11.1,5.72,11.55],0,.76,'wood');solid('U07','Shared basin',[5.25,11.05,5.82,11.65],.76,.9,'ceramic');
 solid('U08','Linen shelves',[.3,7.22,1.25,7.75],0,1.6);solid('U10','Upper store chest',[.4,4.4,1.5,5.1],0,.8);
 // These are enclosed storage props, deliberately without a playable attic
 // floor/route. Their complete boxes fit below the real hip/front-gable shells.
 solid('A02','Attic trunk',[11.4,5.7,12.3,6.5],0,.7);table('A01','Gable work bench',16.2,3.5,1.1,.55);
 return pieces;
}
