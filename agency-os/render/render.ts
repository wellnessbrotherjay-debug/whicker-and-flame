// Whisker & Heat Agency OS slide renderer (copied from SignalIQ's; adds food photo and character slides).
// Agency OS slide renderer. Draws one 1080x1350 JPEG for a post (cover = hook, then slides) and stores it through the Agency OS API.
// Looks come from the brand version design tokens in the database. No tokens: refused (422). Nothing is guessed.
import http from "node:http";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";

const W = 1080;
const H = 1350;

type Tokens = {
  canvas: string; ink: string; body: string; muted: string; hairline: string; accent: string;
  // The brand's own exported artwork (PNG URL), never re-set in a substitute font.
  logo: { url: string; width: number; height: number };
  fonts: { family: string; regular: string; semibold: string };
};
type Visual = { kind: "funnel" | "journey" | "compare" | "trend" | "photo" | "character"; labels: string[]; url?: string };
type Slide = { title?: string; body?: string; visual?: Visual };
// Tokens plus the logo already fetched as a data URI, ready for satori.
type Look = Tokens & { logoData: string; images: Map<string, string> };

const REQUIRED: (keyof Tokens)[] = ["canvas", "ink", "body", "muted", "hairline", "accent", "logo", "fonts"];
const LOGO_H = 56;
// Photos and cast portraits come only from the brand's own site; anything else is refused.
const MEDIA = (process.env.DASHBOARD_ORIGIN ?? "") + "/";
const CAST: Record<string, string> = { luna: "Luna", simba: "Simba", nico: "Nico", milo: "Milo" };
const castUrl = (id: string) => MEDIA + "agency-os/cast/" + id + ".jpg";
const imageCache = new Map<string, Promise<string>>();
function image(url: string) {
  if (!url.startsWith(MEDIA)) throw new HttpError(422, "images must come from " + MEDIA);
  if (!imageCache.has(url)) {
    imageCache.set(url, fetch(url).then(async (r) => {
      const type = r.headers.get("content-type") ?? "";
      if (!r.ok || !/^image\/(jpeg|png)/.test(type)) throw new Error(`image fetch ${r.status} ${type} ${url}`);
      return `data:${type.split(";")[0]};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
    }));
  }
  return imageCache.get(url)!;
}
function imagesOf(visual?: Visual): string[] {
  if (visual?.kind === "photo" && visual.url) return [visual.url];
  if (visual?.kind === "character") return visual.labels.filter((id) => CAST[id]).map(castUrl);
  return [];
}

const fontCache = new Map<string, Promise<ArrayBuffer>>();
const logoCache = new Map<string, Promise<string>>();

// Fetched once per instance and handed to satori as a data URI.
function logo(url: string) {
  if (!logoCache.has(url)) {
    logoCache.set(url, fetch(url).then(async (r) => {
      const type = r.headers.get("content-type") ?? "";
      if (!r.ok || !type.startsWith("image/png")) throw new Error(`logo fetch ${r.status} ${type} ${url}`);
      return `data:image/png;base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
    }));
  }
  return logoCache.get(url)!;
}

function font(url: string) {
  if (!fontCache.has(url)) {
    fontCache.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error(`font fetch ${r.status} ${url}`);
      return r.arrayBuffer();
    }));
  }
  return fontCache.get(url)!;
}

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// satori element helper (no JSX in edge functions without a build step)
const h = (type: string, style: Record<string, unknown>, children?: unknown) =>
  ({ type, props: { style, children } });

function frame(t: Look, index: number, total: number, body: unknown, footer: unknown) {
  const counter = `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  return h("div", {
    width: W, height: H, display: "flex", flexDirection: "column",
    backgroundColor: t.canvas, color: t.ink, fontFamily: t.fonts.family,
    padding: "88px 96px 80px",
  }, [
    h("div", { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 30, color: t.muted, letterSpacing: 1 }, [
      { type: "img", props: { src: t.logoData, height: LOGO_H, width: Math.round(LOGO_H * t.logo.width / t.logo.height) } },
      h("div", { display: "flex" }, counter),
    ]),
    h("div", { display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }, body),
    h("div", {
      display: "flex", justifyContent: "space-between", alignItems: "center",
      borderTop: `2px solid ${t.hairline}`, paddingTop: 32, fontSize: 30, color: t.muted,
    }, footer),
  ]);
}

const accentBar = (t: Look) => h("div", { display: "flex", width: 88, height: 8, backgroundColor: t.accent, marginBottom: 48 });

function graphic(t: Look, visual?: Visual) {
  const v = visual ?? { kind: "character", labels: Object.keys(CAST) };
  const labels = v.labels.slice(0, 4).map(s => String(s).slice(0, 22));
  const label = (s: string, style = {}) => h("div", { display: "flex", fontSize: 28, ...style }, s);
  let drawing;
  if (v.kind === "photo") {
    const src = v.url ? t.images.get(v.url) : undefined;
    if (!src) throw new HttpError(422, "photo slide needs a url from " + MEDIA);
    return h("div", { display: "flex", marginTop: 42 }, [{ type: "img", props: { src, width: 888, height: 600, style: { objectFit: "cover", borderRadius: 28 } } }]);
  }
  if (v.kind === "character") {
    const ids = v.labels.filter((id) => CAST[id]).slice(0, 4);
    const size = ids.length > 2 ? 190 : 260;
    return h("div", { display: "flex", marginTop: 42, gap: 28, justifyContent: "flex-start" }, ids.map((id) =>
      h("div", { display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }, [
        { type: "img", props: { src: t.images.get(castUrl(id)), width: size, height: size, style: { borderRadius: size, objectFit: "cover" } } },
        label(CAST[id], { fontSize: 30, fontWeight: 600 }),
      ])));
  }
  if (v.kind === "funnel") {
    drawing = h("div", { display: "flex", flexDirection: "column", gap: 14 }, labels.map((s, i) =>
      h("div", { display: "flex", alignItems: "center", gap: 24 }, [
        label(s, { width: 190, color: t.body }),
        h("div", { display: "flex", width: 590 - i * 125, height: 64, backgroundColor: t.ink, opacity: 1 - i * .16, borderRadius: 8 }),
      ])));
  } else if (v.kind === "compare") {
    drawing = h("div", { display: "flex", gap: 24 }, [0, 1].map(i => h("div", {
      display: "flex", flexDirection: "column", width: 414, height: 285, border: `2px solid ${t.ink}`,
      borderRadius: 20, padding: 30, backgroundColor: i ? t.ink : t.canvas, color: i ? t.canvas : t.ink,
    }, [label(i ? "OR THIS" : "THIS", { fontSize: 22, opacity: .65 }),
      h("div", { display: "flex", fontSize: 44, fontWeight: 600, marginTop: 38 }, labels[i] ?? ""),
      h("div", { display: "flex", marginTop: 24, width: i ? 250 : 90, height: 8, backgroundColor: i ? t.canvas : t.ink }),
    ])));
  } else if (v.kind === "trend") {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="250" viewBox="0 0 840 250"><path d="M20 20V225H820M20 155H820M20 85H820" fill="none" stroke="${t.muted}" stroke-width="2" opacity=".35"/><path d="M25 190L165 155L305 163L455 95L600 75L800 20" fill="none" stroke="${t.ink}" stroke-width="9" stroke-linecap="round"/><path d="M25 210L165 195L305 205L455 194L600 202L800 183" fill="none" stroke="${t.body}" stroke-width="5" stroke-dasharray="14 12"/></svg>`;
    drawing = h("div", { display: "flex", flexDirection: "column", gap: 24 }, [
      { type: "img", props: { src: `data:image/svg+xml;base64,${btoa(svg)}`, width: 840, height: 250 } },
      h("div", { display: "flex", justifyContent: "space-between" }, [label(`— ${labels[0] ?? "Clicks"}`), label(`- - ${labels[1] ?? "Bookings"}`, { color: t.body })]),
    ]);
  } else {
    drawing = h("div", { display: "flex", flexWrap: "wrap", gap: 18 }, labels.map((s, i) =>
      h("div", { display: "flex", width: 405, height: 138, padding: 25, borderRadius: 18,
        border: `2px solid ${i === 2 ? t.ink : t.muted}`, alignItems: "center", gap: 24 }, [
        label(String(i + 1).padStart(2, "0"), { fontSize: 46, color: t.muted }),
        label(s, { fontSize: 32, fontWeight: 600 }),
      ])));
  }
  return h("div", { display: "flex", flexDirection: "column", marginTop: 42, gap: 22 }, [drawing,
    label(v.kind === "trend" || v.kind === "funnel" ? "ILLUSTRATIVE · NOT REAL DATA" : v.kind === "journey" ? "STEP BY STEP" : "", { fontSize: 20, color: t.muted, letterSpacing: 2 }),
  ]);
}

function cover(t: Look, hook: string, sub: string | null, total: number, isLast: boolean, cta: string | null, visual?: Visual) {
  const size = hook.length > 80 ? 76 : hook.length > 50 ? 88 : 104;
  return frame(t, 0, total, [
    h("div", { display: "flex", fontSize: Math.min(size, 88), fontWeight: 600, lineHeight: 1.06, letterSpacing: -2 }, hook),
    graphic(t, visual),
    ...(sub ? [h("div", { display: "flex", marginTop: 28, fontSize: 32, lineHeight: 1.3, color: t.body }, sub)] : []),
  ], isLast && cta
    ? [h("div", { display: "flex", color: t.accent, fontWeight: 600 }, cta)]
    : [h("div", { display: "flex" }, "Swipe"), h("div", { display: "flex", color: t.accent }, "›")]);
}

function content(t: Look, s: Slide, index: number, total: number, cta: string | null) {
  const isLast = index === total - 1;
  return frame(t, index, total, [
    h("div", { display: "flex", fontSize: 68, fontWeight: 600, lineHeight: 1.1, letterSpacing: -1.5 }, s.title ?? ""),
    graphic(t, s.visual),
    ...(s.body ? [h("div", { display: "flex", marginTop: 28, fontSize: 34, lineHeight: 1.35, color: t.body }, s.body)] : []),
  ], isLast && cta
    ? [h("div", { display: "flex", color: t.accent, fontWeight: 600 }, cta)]
    : [h("div", { display: "flex" }, ""), h("div", { display: "flex", color: t.accent }, "›")]);
}

const api = process.env.AGENCYOS_API_URL!;
const apiToken = process.env.AGENCYOS_API_TOKEN!;
async function ao(method: string, payload: Record<string, unknown>) {
  const r = await fetch(api + "/empire/agencyos/AgencyOSService/" + method, {
    method: "POST", headers: { Authorization: "Bearer " + apiToken, "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const j: any = await r.json();
  if (!r.ok) throw new HttpError(r.status === 404 ? 404 : 500, `${method}: ${j?.error ?? j?.value?.[0]?.statusmsg ?? r.status}`);
  return j;
}

async function render(url: URL) {
  const post = url.searchParams.get("post");
  const slideRaw = url.searchParams.get("slide");
  if (!post || !/^[0-9]+$/.test(post)) throw new HttpError(400, "post must be a number");
  const n = Number(slideRaw);
  if (slideRaw === null || !Number.isInteger(n) || n < 0) throw new HttpError(400, "slide must be an integer >= 0");

  const p = await ao("GetRenderInput", { PostId: post, Version: url.searchParams.get("v") ? Number(url.searchParams.get("v")) : null });
  const version = p.brand_version;
  if (!Number.isInteger(version)) throw new HttpError(422, "post has no brand_version and no v given");
  const tok = p.design_tokens as Tokens | null;
  const missing = REQUIRED.filter((k) => !tok?.[k]);
  if (tok?.logo && !(tok.logo.url?.startsWith("https://") && tok.logo.width > 0 && tok.logo.height > 0)) missing.push("logo");
  if (!tok || missing.length) throw new HttpError(422, `brand v${version} design_tokens missing: ${missing.join(", ") || "all"}`);

  const slides: Slide[] = Array.isArray(p.slides) ? p.slides : [];
  const wanted = [...new Set(slides.flatMap((s) => imagesOf(s.visual)).concat(slides.length ? [] : imagesOf()))];
  if (!slides.some((s) => s.visual)) wanted.push(...Object.keys(CAST).map(castUrl));
  const images = new Map(await Promise.all(wanted.map(async (u) => [u, await image(u)] as [string, string])));
  const t: Look = { ...tok, logoData: await logo(tok.logo.url), images };
  let tree;
  if (p.format === "single") {
    if (n !== 0) throw new HttpError(400, "single posts have only slide 0");
    tree = cover(t, p.hook, slides[0]?.body ?? null, 1, true, p.cta, slides[0]?.visual);
  } else {
    const total = slides.length + 1;
    if (total > 10) throw new HttpError(422, `carousel would be ${total} images; Instagram max is 10`);
    if (n >= total) throw new HttpError(400, `slide ${n} out of range (0..${total - 1})`);
    tree = n === 0 ? cover(t, p.hook, null, total, false, null, slides[0]?.visual) : content(t, slides[n - 1], n, total, p.cta);
  }

  const [regular, semibold] = await Promise.all([font(t.fonts.regular), font(t.fonts.semibold)]);
  const svg = await satori(tree as never, {
    width: W, height: H,
    fonts: [
      { name: t.fonts.family, data: regular, weight: 400, style: "normal" },
      { name: t.fonts.family, data: semibold, weight: 600, style: "normal" },
    ],
  });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
  return await sharp(png).flatten({ background: t.canvas }).jpeg({ quality: 90 }).toBuffer();
}

const port = Number(process.env.AGENCYOS_RENDER_PORT);
const host = process.env.AGENCYOS_RENDER_HOST!;
// POST /render?post=<id>&slide=<n>&v=<brand version> draws the slide and stores it as a post asset through the Agency OS API.
http.createServer(async (req, res) => {
  const send = (status: number, obj: unknown) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
  const started = Date.now();
  try {
    if (req.method !== "POST" || req.headers.authorization !== "Bearer " + apiToken) return send(401, { error: "not signed in" });
    const url = new URL(req.url!, "http://local");
    const jpg = await render(url);
    if (url.searchParams.get("store") === "0") { res.writeHead(200, { "Content-Type": "image/jpeg" }); return void res.end(jpg); }
    const postId = url.searchParams.get("post")!;
    const slide = Number(url.searchParams.get("slide"));
    const publicUrl = process.env.DASHBOARD_ORIGIN + "/agency-os/media/" + postId + "-" + slide + "-image.jpg";
    await ao("UpsertPostAsset", { PostId: postId, Position: slide, Kind: "image", MimeType: "image/jpeg", FileContent: jpg.toString("base64"), PublicUrl: publicUrl });
    send(200, { ok: true, post: postId, slide, bytes: jpg.length, ms: Date.now() - started });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    send(status, { error: (e as Error).message });
  }
}).listen(port, host, () => console.log("agencyos render listening " + host + ":" + port));
