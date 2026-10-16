import {ao} from './agencyos.ts';
export const tenant=process.env.AOS_TENANT_ID!;
export async function posts(){const all:any[]=await ao('ListPosts',{TenantId:tenant});return withFunnel(all)}

async function withFunnel(all:any[]){const rows:any[]=await ao('ListLeadMagnets');const by=new Map(rows.filter(r=>r.statuscode==='OK').map(r=>[String(r.postref),r]));for(const p of all){const m=by.get(String(p.id));p.lead_magnet=m?{id:m.leadmagnetid,keyword:m.keyword,title:m.title,pdf_url:'/agency-os/guide/'+m.slug+'.pdf',pdf_pages:Number(m.pdfpages)||null,funnel:{comments:Number(m.comments),pdfs_sent:Number(m.pdfssent),pdfs_opened:Number(m.pdfsopened),scans_sent:Number(m.scanssent)}}:null}return all}
