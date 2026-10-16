// The dashboard reads and writes guides, PDFs and funnel steps only through the Agency OS API.
const api = process.env.AGENCYOS_API_URL!;
const token = process.env.AGENCYOS_API_TOKEN!;

export async function ao(method: string, body: Record<string, unknown> = {}): Promise<any> {
  const r = await fetch(api + '/empire/agencyos/AgencyOSService/' + method, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j: any = await r.json();
  if (!r.ok) {
    const msg = String(j?.error || j?.value?.[0]?.statusmsg || r.status).replace(/^agencyos\.\w+: /, '');
    throw Object.assign(Error(msg), { code: j?.code });
  }
  // Rows answer as {value:[...]}; JSON-text answers arrive already unwrapped.
  return j && !Array.isArray(j) && 'value' in j ? j.value : j;
}

// One guide by slug, only when its PDF is stored.
export async function guideRow(slug: string) {
  const g = (await ao('GetLeadMagnet', { Slug: slug }))[0];
  return g?.statuscode === 'OK' && g.haspdf ? { id: g.id, title: g.title, pdf_pages: Number(g.pdfpages) } : undefined;
}

export async function guidePdf(slug: string) {
  const f = (await ao('GetLeadMagnetFile', { Slug: slug }))[0];
  return f?.statuscode === 'OK' ? Buffer.from(f.filecontent, 'base64') : null;
}
