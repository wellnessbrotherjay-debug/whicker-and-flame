export const zone='Asia/Makassar';
export const baliDate=(s:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s));
export const toUTC=(s:string)=>new Date(s+':00+08:00').toISOString();
export const localInput=(s:string)=>baliDate(s)+'T'+new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(s));
export const pretty=(s:string|null)=>s?new Intl.DateTimeFormat('en-GB',{timeZone:zone,day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(s)):'No date set';
export const statusLabel=(p:{status:string,scheduled_for:string|null})=>p.status==='approved'?(p.scheduled_for?'Scheduled':'Approved'):({pending_approval:'Awaiting approval',draft:'Draft',rendered:'Rendering',published:'Published',publishing:'Publishing',failed:'Needs attention',rejected:'Rejected'}[p.status]??p.status);
