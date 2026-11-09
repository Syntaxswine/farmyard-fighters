// Tiles are centred at integer metre coordinates. Block 0 therefore covers
// [-.5, 23.5); crossing 23.5 enters block 1 without moving/snapping the animal.
export const WORLD_BLOCK_SIZE=24;
export const WORLD_SECTOR_SIZE=240;

export function gridDimensions(source){
  const rows=Array.isArray(source)?source:source?.map??source?.terrain;
  const width=rows?.[0]?.length??source?.width,height=rows?.length??source?.height;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw Error('Invalid world dimensions.');
  return {width,height};
}

export function worldBounds(source){
  if(source?.worldBounds)return {...source.worldBounds};
  const {width,height}=gridDimensions(source);
  // Preserve the original solo operations' one-tile void rim.
  return {x:1,y:1,w:width-2,h:height-2};
}

export const blockForPoint=point=>({x:Math.floor((point.x+.5)/WORLD_BLOCK_SIZE),y:Math.floor((point.y+.5)/WORLD_BLOCK_SIZE)});

export function blockRect(column,row,source){
  const {width,height}=gridDimensions(source),x=column*WORLD_BLOCK_SIZE,y=row*WORLD_BLOCK_SIZE;
  return {id:`${column},${row}`,column,row,x,y,w:Math.min(WORLD_BLOCK_SIZE,width-x),h:Math.min(WORLD_BLOCK_SIZE,height-y)};
}

// The rendering window is a residency policy, never a simulation boundary.
// Shift inward at sector edges so a large world still retains nine blocks.
export function blockWindow(source,focus,side=3){
  if(![3,5].includes(side))throw Error('Render residency is bounded to 3x3 or 5x5 blocks.');
  const {width,height}=gridDimensions(source),columns=Math.ceil(width/WORLD_BLOCK_SIZE),rows=Math.ceil(height/WORLD_BLOCK_SIZE);
  const centre=blockForPoint(focus),nx=Math.min(side,columns),ny=Math.min(side,rows);
  const firstX=Math.max(0,Math.min(columns-nx,centre.x-Math.floor(nx/2))),firstY=Math.max(0,Math.min(rows-ny,centre.y-Math.floor(ny/2)));
  const blocks=[];
  for(let row=firstY;row<firstY+ny;row++)for(let column=firstX;column<firstX+nx;column++)blocks.push(blockRect(column,row,source));
  const x=firstX*WORLD_BLOCK_SIZE,y=firstY*WORLD_BLOCK_SIZE,w=Math.min(width-x,nx*WORLD_BLOCK_SIZE),h=Math.min(height-y,ny*WORLD_BLOCK_SIZE);
  return {key:`${firstX},${firstY}:${nx},${ny}`,x,y,w,h,blocks};
}

export const pointInWorldRect=(point,rect,padding=0)=>point.x>=rect.x-.5-padding&&point.x<rect.x+rect.w-.5+padding&&point.y>=rect.y-.5-padding&&point.y<rect.y+rect.h-.5+padding;
