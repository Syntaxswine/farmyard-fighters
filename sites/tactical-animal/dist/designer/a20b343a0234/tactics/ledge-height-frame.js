// Clips are authored against a two-unit ledge. Shift the complete native rig
// only while it is unsupported, retaining both floor and lip contacts without
// stretching bones or changing the approved supported poses.
export function ledgeHeightFrame(clip,progress,frame,direction='up'){
 const height=frame.ledgeHeight??2,delta=height-2;
 if(!delta)return frame;
 const phase=clip.phases[direction==='up'?2:5],time=Math.max(0,Math.min(1,progress))*clip.duration;
 const u=Math.max(0,Math.min(1,(time-phase.start)/(phase.end-phase.start)));
 const lift=direction==='up'?u*u*(3-2*u):1-u*u;
 return {...frame,origin:[frame.origin[0],frame.origin[1]+delta*lift,frame.origin[2]]};
}
