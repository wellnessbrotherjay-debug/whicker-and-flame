"""Generates import-ready n8n workflow JSON for the Whisker & Heat Agency OS.
A copy of SignalIQ's generator (~/Desktop/agency-os) with Whisker's own API, renderer,
tenant and workflow ids (wos-*), so nothing it writes can reach Signal's data or workflows.

Run:  python3 scripts/build_workflows.py
Out:  n8n/workflows/*.json  (import via n8n → Workflows → Import from file)
"""
import json, uuid, pathlib, copy, re
from contextvars import ContextVar
from contextlib import contextmanager

TENANT_CONTEXT = ContextVar("agency_os_tenant", default=None)


def tenant_context(settings):
    """Validate and isolate explicit settings; never merge with Signal defaults."""
    required = {"namespace", "config", "credentials", "timezone", "output"}
    missing = required - settings.keys()
    if missing:
        raise ValueError("Missing tenant settings: " + ", ".join(sorted(missing)))
    value = copy.deepcopy(settings)
    if not value["namespace"] or value["namespace"] == "aos":
        raise ValueError("A separate workflow namespace is required")
    if not value["config"].get("tenant") or not value["timezone"]:
        raise ValueError("Explicit tenant and timezone are required")
    if pathlib.Path(value["output"]).resolve() == OUT.resolve():
        raise ValueError("Tenant export must not overwrite Signal workflows")
    return value


def foundation_dry_run(settings):
    """Fail before file creation or provider access until the adapter is implemented."""
    if settings.get("backend") != "foundation-plugin-api":
        raise ValueError("Foundation plugin API backend is required")
    if not settings.get("apiContracts"):
        raise ValueError("Export blocked: verified Foundation API bindings are missing")
    raise ValueError("Export blocked: Foundation request/response adapter is not implemented")


@contextmanager
def use_tenant(settings):
    token = TENANT_CONTEXT.set(tenant_context(settings))
    try:
        yield
    finally:
        TENANT_CONTEXT.reset(token)

OUT = pathlib.Path(__file__).resolve().parent.parent / "n8n" / "workflows"

CREDS = {
    # Already on n8n.safetykat.com — Jay's authorized OpenAI API connection.
    "openai": {"openAiApi": {"id": "magnovent-openai-2026", "name": "Magnovent OpenAI"}},
    "fb": {"facebookGraphApi": {"id": "wos-instagram-whisker", "name": "Whisker & Heat Instagram Page"}},
}

CONFIG = {
    "tenant": "whisker",
    "graph_version": "v25.0",
    "model_planner": "gpt-4.1-nano",
    "model_copy": "gpt-4.1-nano",
    "model_qa": "gpt-4.1-nano",
    # WhatsApp = the Magnovent bot's number. Token, phone-number id, WABA id and owner number are read
    # from n8n's environment (MAGNOVENT_WA_*), so no WhatsApp secret lives in any workflow.
    "wa_notice_template": "agency_os_notice",   # created by WF9 setup; body "Agency OS update: {{1}}. ..."
    "wa_template_lang": "en",
    "allowed_formats": "carousel,single",
    "publish_time_local": "18:00",
}


class WF:
    def __init__(self, name):
        self.name, self.nodes, self.conn, self.x = name, [], {}, 0
        self.context = copy.deepcopy(TENANT_CONTEXT.get())
        self.config = copy.deepcopy(self.context["config"] if self.context else CONFIG)
        self.credentials = copy.deepcopy(self.context["credentials"] if self.context else CREDS)

    def node(self, name, ntype, version, params, creds=None, pos=None, **extra):
        if pos is None:
            pos = [self.x, 300]
            self.x += 240
        n = {"id": str(uuid.uuid4()), "name": name, "type": ntype, "typeVersion": version,
             "position": pos, "parameters": params}
        if creds:
            n["credentials"] = copy.deepcopy(self.credentials[creds])
        n.update(extra)
        self.nodes.append(n)
        return name

    def link(self, src, dst, out=0, inp=0):
        main = self.conn.setdefault(src, {"main": []})["main"]
        while len(main) <= out:
            main.append([])
        main[out].append({"node": dst, "type": "main", "index": inp})

    def chain(self, *names):
        for a, b in zip(names, names[1:]):
            self.link(a, b)

    def dump(self, fname):
        # Existing factories still contain deployment-specific provider and backend
        # expressions. Until the Foundation adapter replaces them, no tenant-bound
        # graph may be serialized, even if its top-level credentials look isolated.
        if self.context is not None:
            raise ValueError("Tenant workflow export blocked: Foundation adapter and notification bindings are not implemented")
        names = [n["name"] for n in self.nodes]
        assert len(names) == len(set(names)), f"{self.name}: duplicate node names"
        for src, v in self.conn.items():
            assert src in names, f"{self.name}: unknown source {src}"
            for outs in v["main"]:
                for c in outs:
                    assert c["node"] in names, f"{self.name}: unknown target {c['node']}"
        namespace = self.context["namespace"] if self.context else "wos"
        timezone = self.context["timezone"] if self.context else "Asia/Makassar"
        output = pathlib.Path(self.context["output"]) if self.context else OUT
        wf = {"id": namespace + "-" + fname.split("_")[0].lower(), "name": self.name, "nodes": self.nodes, "connections": self.conn, "active": False,
              "settings": {"executionOrder": "v1", "timezone": timezone,
                           "saveManualExecutions": True, "callerPolicy": "workflowsFromSameOwner"},
              "pinData": {}}
        (output / fname).write_text(json.dumps(wf, indent=2))
        return fname


# ---------- node helpers ----------
def config(wf, pos=None, name="Config"):
    return wf.node(name, "n8n-nodes-base.set", 3.4, {
        "mode": "manual",
        "assignments": {"assignments": [
            {"id": str(uuid.uuid4()), "name": k, "value": v, "type": "string"} for k, v in wf.config.items()]},
        "options": {}}, pos=pos)


def cron(wf, name, expr, pos=None):
    # Scheduled workflows also need an explicit entry point for setup and CLI verification.
    if not any(n["type"] == "n8n-nodes-base.manualTrigger" for n in wf.nodes):
        manual = wf.node("Run once", "n8n-nodes-base.manualTrigger", 1, {}, pos=[0, 80])
        wf.link(manual, "Config")
    return wf.node(name, "n8n-nodes-base.scheduleTrigger", 1.2,
                   {"rule": {"interval": [{"field": "cronExpression", "expression": expr}]}}, pos=pos)


# Every workflow reaches the Agency OS data only through the Agency OS API on our own server
# (WHOS_API_URL and WHOS_API_TOKEN in the n8n settings). Nothing here talks to a database.
RPC_METHODS = {
    "n8n_log": "LogWorkflow", "n8n_load_context": "LoadContext", "n8n_cache_get": "CacheGet", "n8n_cache_put": "CachePut",
    "n8n_save_memo": "SaveMemo", "n8n_insert_post": "InsertPost", "n8n_claim_render_job": "ClaimRenderJob",
    "n8n_finish_render_job": "FinishRenderJob", "n8n_assign_approval_codes": "AssignApprovalCodes",
    "n8n_apply_approval": "ApplyApproval", "n8n_claim_next_post": "ClaimNextPost", "n8n_mark_post_published": "MarkPostPublished",
    "n8n_mark_post_failed": "MarkPostFailed", "n8n_snapshots_due": "SnapshotsDue", "n8n_upsert_snapshot": "UpsertSnapshot",
    "n8n_score_72h": "Score72h", "n8n_list_content": "ListContent", "n8n_preview_post": "PreviewPost",
}
API_PATH = '={{ $env.WHOS_API_URL }}/empire/agencyos/AgencyOSService/'
API_AUTH = [("Authorization", "=Bearer {{ $env.WHOS_API_TOKEN }}")]


def rpc(wf, name, fn, args_js="{}", pos=None, **extra):
    """Call an Agency OS API method. args_js is a JS object literal whose keys are the old p_ names; they become the API names."""
    args = re.sub(r"\bp_([a-z0-9_]+)(\s*:)", lambda m: m.group(1).replace("_", "") + m.group(2), args_js)
    return http(wf, name, "POST", API_PATH + RPC_METHODS[fn], headers=API_AUTH,
                json_body="={{ JSON.stringify(" + args + ") }}", pos=pos, **extra)


AI_TEXT_JS = r"""
function aiText(r) {
  if (r.status !== 'completed') throw new Error('OpenAI response not completed: ' + (r.status ?? 'error'));
  const text = (r.output ?? []).flatMap(o => o.content ?? []).filter(b => b.type === 'output_text').map(b => b.text).join('').trim();
  if (!text) throw new Error('OpenAI response contains no output text');
  return text;
}
"""


def openai(wf, name, model_js, system_js, user_js, max_tokens, pos=None, **extra):
    body = ('={{ JSON.stringify({ model: ' + model_js + ', instructions: ' + system_js +
            ', input: "Return JSON. " + (' + user_js + ')' + ', max_output_tokens: ' + str(max_tokens) +
            ', text: { format: { type: "json_object" } }, store: false }) }}')
    return http(wf, name, "POST", "https://api.openai.com/v1/responses", creds="openai",
                json_body=body, timeout=180000, pos=pos, **extra)


def code(wf, name, js, pos=None, **extra):
    return wf.node(name, "n8n-nodes-base.code", 2, {"jsCode": (AI_TEXT_JS + js).strip()}, pos=pos, **extra)


def if_true(wf, name, expr, pos=None):
    return wf.node(name, "n8n-nodes-base.if", 2.2, {
        "conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
                       "conditions": [{"id": str(uuid.uuid4()), "leftValue": expr, "rightValue": "",
                                       "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
                       "combinator": "and"},
        "options": {}}, pos=pos)


def switch(wf, name, left, cases, fallback=None, pos=None):
    opts = {}
    if fallback:
        opts = {"fallbackOutput": "extra", "renameFallbackOutput": fallback}
    return wf.node(name, "n8n-nodes-base.switch", 3.2, {
        "rules": {"values": [
            {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
                            "conditions": [{"id": str(uuid.uuid4()), "leftValue": left, "rightValue": val,
                                            "operator": {"type": "string", "operation": "equals"}}],
                            "combinator": "and"},
             "renameOutput": True, "outputKey": key} for key, val in cases]},
        "options": opts}, pos=pos)


def http(wf, name, method, url, creds=None, query=None, json_body=None, pos=None, headers=None,
         binary_out=False, binary_in=None, timeout=60000, **extra):
    p = {"method": method, "url": url, "options": {"timeout": timeout}}
    if creds == "fb":
        p.update({"authentication": "predefinedCredentialType", "nodeCredentialType": "facebookGraphApi"})
    elif creds == "openai":
        p.update({"authentication": "predefinedCredentialType", "nodeCredentialType": "openAiApi"})
    elif creds:
        p.update({"authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth"})
    if query:
        p["sendQuery"] = True
        p["queryParameters"] = {"parameters": [{"name": k, "value": v} for k, v in query]}
    if headers:
        p["sendHeaders"] = True
        p["headerParameters"] = {"parameters": [{"name": k, "value": v} for k, v in headers]}
    if json_body is not None:
        p.update({"sendBody": True, "contentType": "json", "specifyBody": "json", "jsonBody": json_body})
    if binary_in:
        p.update({"sendBody": True, "contentType": "binaryData", "inputDataFieldName": binary_in})
    if binary_out:
        p["options"]["response"] = {"response": {"responseFormat": "file", "outputPropertyName": "data"}}
    return wf.node(name, "n8n-nodes-base.httpRequest", 4.2, p, creds=creds, pos=pos, **extra)


WA_URL = ('=https://graph.facebook.com/{{ $("Config").first().json.graph_version }}/'
          '{{ ($env.AOS_WA_PHONE_NUMBER_ID || $env.MAGNOVENT_WA_PHONE_NUMBER_ID) }}/messages')
WA_HEADERS = [("Authorization", "=Bearer {{ ($env.AOS_WA_ACCESS_TOKEN || $env.MAGNOVENT_WA_ACCESS_TOKEN) }}")]
OWNER_JS = 'String(($env.AOS_OWNER_WHATSAPP || $env.MAGNOVENT_OWNER_WHATSAPP) ?? "").split(",")[0].replace(/\\D/g, "")'


def wa_text(wf, name, text_expr, to_js=OWNER_JS, pos=None, **extra):
    """Free-form WhatsApp text. Only valid inside the 24h window, i.e. replying to the owner's own message."""
    body = ('={{ JSON.stringify({ messaging_product: "whatsapp", to: ' + to_js + ', '
            'type: "text", text: { preview_url: false, body: String(' + text_expr + ').slice(0, 4000) } }) }}')
    return http(wf, name, "POST", WA_URL, headers=WA_HEADERS, json_body=body, pos=pos, **extra)


def wa_notice(wf, name, text_expr, pos=None, **extra):
    """Template message to the owner: delivers any time, outside the 24h window. Meta forbids newlines/tabs and
    4+ spaces in template params, so the text is flattened to one line."""
    flat = ('String(' + text_expr + ').replace(/\\s*\\n+\\s*/g, " · ").replace(/\\t/g, " ")'
            '.replace(/ {4,}/g, "   ").slice(0, 900)')
    body = ('={{ JSON.stringify({ messaging_product: "whatsapp", to: ' + OWNER_JS + ', '
            'type: "template", template: { name: $("Config").first().json.wa_notice_template, '
            'language: { code: $("Config").first().json.wa_template_lang }, '
            'components: [{ type: "body", parameters: [{ type: "text", text: ' + flat + ' }] }] } }) }}')
    return http(wf, name, "POST", WA_URL, headers=WA_HEADERS, json_body=body, pos=pos, **extra)


def log(wf, name, workflow, status, msg_expr, pos=None):
    return rpc(wf, name, "n8n_log", '{ p_workflow: "' + workflow + '", p_run_id: String($execution.id), '
               'p_status: "' + status + '", p_message: String(' + msg_expr + ') }', pos=pos)


ERR = {"onError": "continueErrorOutput"}
GRAPH = 'https://graph.facebook.com/{{ $("Config").first().json.graph_version }}'


# =====================================================================
# WF0 Error handler (set as Error Workflow on WF1–WF5)
# =====================================================================
def wf0():
    wf = WF("Whisker OS WF0 — Error Handler")
    t = wf.node("Error Trigger", "n8n-nodes-base.errorTrigger", 1, {})
    c = config(wf)
    f = code(wf, "Format alert", r"""
const e = $('Error Trigger').first().json;
const wfName = e.workflow?.name ?? 'unknown workflow';
const node = e.execution?.lastNodeExecuted ?? 'unknown node';
const msg = (e.execution?.error?.message ?? 'no message').slice(0, 500);
const url = e.execution?.url ?? '';
return [{ json: {
  workflow: wfName, node, message: msg, run_id: String(e.execution?.id ?? ''),
  text: `🚨 Agency OS error\nWorkflow: ${wfName}\nNode: ${node}\nError: ${msg}\n${url}`
}}];""")
    lg = rpc(wf, "Log error", "n8n_log",
             '{ p_workflow: $json.workflow, p_run_id: $json.run_id, p_status: "error", p_message: $json.message, '
             'p_payload: JSON.stringify({ node: $json.node }) }')
    s = wa_notice(wf, "WhatsApp alert", '$("Format alert").first().json.text')
    wf.chain(t, c, f, lg, s)
    return wf.dump("WF0_error_handler.json")


# =====================================================================
# WF1 Weekly planner
# =====================================================================
BUILD_PLANNER_JS = r"""
const cfg = $('Config').first().json;
const ctx = $json;
if (!ctx.tenant_id) throw new Error(`Tenant ${cfg.tenant} not found or not active`);
const brand = ctx.brand ?? {};
const pillars = ctx.pillars ?? [];
if (!brand.marketing_context && pillars.length === 0) {
  throw new Error('No marketing_context and no content_pillars for this tenant. Fill them before planning — refusing to generate generic content.');
}
const formats = cfg.allowed_formats.split(',').map(s => s.trim());
const FOOD = 'https://whiskerflame.safetykat.com/agency-os/food/';
const PHOTOS = ['tomato-pasta','garden-pesto-twirls','pancakes','lemon-pea-risotto','roasted-tomato-soup','mushroom-bruschetta','crispy-chickpea-bowls','spinach-ricotta-bake','sweet-potato-black-bean-chili','apple-oat-crumble'].map(n => FOOD + n + '.jpg');
const system = `You are the content strategist for Whisker & Heat, a cat-led cooking brand. Plan 7 Instagram posts for next week.
Characters (original, fictional): Luna (luna) the Taste Detective, "Interesting… very suspicious."; Simba (simba) the Chaos Chef, "That was exactly what I meant to do!"; Nico (nico) the Kitchen Diplomat, "We can resolve this with dignity."; Milo (milo) the Curious Taster, "I was just checking…".
Rules:
- Output ONLY valid JSON, no markdown, matching: {"memo": string, "posts": [7 items]}
- Each post: {"pillar": one of the pillar names, "format": one of ${JSON.stringify(formats)},
  "hook_type": one of ["stat","contrarian","question","story","how-to"], "hook": max 110 chars,
  "slides": array of {"title": max 48 chars, "body": max 150 chars, "visual": one of
     {"kind":"character","labels":[1-4 of "luna","simba","nico","milo"]},
     {"kind":"photo","labels":[],"url": one of ${JSON.stringify(PHOTOS)}},
     {"kind":"journey","labels": 2-4 short cooking steps or ingredients, each max 22 chars}} (carousel: 3-4 slides, single: exactly 1),
  "cta": max 80 chars, "cta_type": one of ["follow","save","comment","dm","link"], "is_experiment": boolean}
- Mix the week: one story post that moves season one (The Lost Recipe Book) forward with a real payoff, one or two recipe posts with a photo slide and real steps, character comedy, and one audience question.
- Recipes must be real and safe; any steps shown must match the real recipe. Recipes are for people, never for cats. No medical, weight-loss or price claims. No allergy jokes.
- Exactly 1 or 2 posts must be is_experiment=true (new hook_type x pillar combinations).
- Weight pillars by their weight. Never repeat or closely paraphrase a recent hook.
- Lean into what scored well (saves, shares, recipe opens), move away from what scored badly and from rejected hooks.
- Warm and funny, never mean. Keep hooks short, preferably under 55 characters.
- "memo": max 150 words — what changed vs last week and why, citing the performance data given.`;
const user = JSON.stringify({
  marketing_context: brand.marketing_context ?? null, voice: brand.voice ?? {}, pillars,
  top_posts: ctx.top_posts, bottom_posts: ctx.bottom_posts,
  rejected_hooks: ctx.rejected_hooks, recent_hooks: ctx.recent_hooks
});
// deterministic cache key: FNV-1a 64-bit (no crypto module needed in the Code node)
let h = 0xcbf29ce484222325n;
const s = cfg.model_planner + system + user;
for (let i = 0; i < s.length; i++) { h ^= BigInt(s.charCodeAt(i)); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; }
return [{ json: { tenant_id: ctx.tenant_id, brand_version: brand.version ?? null, system, user,
  prompt_hash: 'planner:' + h.toString(16) } }];"""

PARSE_PLAN_JS = r"""
const cached = $('Cache lookup').first().json.response;
let plan;
if (cached) { plan = cached; }
else {
  const res = $('OpenAI — plan week').first().json;
  const text = aiText(res).replace(/```json|```/g, '').trim();
  try { plan = JSON.parse(text); } catch (e) { throw new Error('Planner returned invalid JSON: ' + text.slice(0, 300)); }
}
const cfg = $('Config').first().json;
const formats = cfg.allowed_formats.split(',').map(s => s.trim());
const HOOKS = ['stat','contrarian','question','story','how-to'];
const CTAS = ['follow','save','comment','dm','link'];
if (!plan || !Array.isArray(plan.posts) || plan.posts.length !== 7) throw new Error('Planner must return exactly 7 posts');
plan.posts.forEach((p, i) => {
  const bad = (m) => { throw new Error(`Post ${i + 1}: ${m}`); };
  if (!formats.includes(p.format)) bad('format ' + p.format);
  if (!HOOKS.includes(p.hook_type)) bad('hook_type ' + p.hook_type);
  if (!CTAS.includes(p.cta_type)) bad('cta_type ' + p.cta_type);
  if (typeof p.hook !== 'string' || p.hook.length < 10 || p.hook.length > 140) bad('hook length');
  if (!Array.isArray(p.slides)) bad('slides');
  if (p.format === 'carousel' && (p.slides.length < 3 || p.slides.length > 9)) bad('carousel needs 3-9 slides (cover + slides <= 10 images)');
  if (p.format === 'single' && p.slides.length !== 1) bad('single needs exactly 1 slide');
});
const base = $('Build planner prompt').first().json;
return [{ json: { memo: String(plan.memo ?? '').slice(0, 2000), posts: plan.posts,
  tenant_id: base.tenant_id, brand_version: base.brand_version, prompt_hash: base.prompt_hash,
  from_cache: Boolean(cached) } }];"""

BUILD_COPY_JS = r"""
const plan = $('Parse + validate plan').first().json;
const system = `You write Instagram captions for Whisker & Heat, a warm, funny cat-led cooking brand (fictional cats, real recipes for people). Captions end with the CTA; recipe posts say the full recipe is at the link in bio and name the allergens from the recipe. No medical, weight-loss or price claims. Output ONLY JSON:
{"items":[{"i": number, "caption": string (max 1600 chars, line breaks ok, ends with the CTA),
"hashtags": 3-5 strings each starting with #, niche over generic, "alt_text": max 200 chars describing the cover visual,
"hook_alternates": exactly 3 alternative hooks max 110 chars}]} — one item per input post, same order.`;
const user = JSON.stringify(plan.posts.map((p, i) => ({ i, hook: p.hook, slides: p.slides, cta: p.cta, pillar: p.pillar })));
return [{ json: { system, user } }];"""

BUILD_QA_JS = r"""
const copy = $('OpenAI — captions').first().json;
const text = aiText(copy).replace(/```json|```/g, '').trim();
let items;
try { items = JSON.parse(text).items; } catch (e) { throw new Error('Caption model returned invalid JSON: ' + text.slice(0, 300)); }
const plan = $('Parse + validate plan').first().json;
if (!Array.isArray(items) || items.length !== plan.posts.length) throw new Error('Caption count mismatch');
const brand = $('Load context').first().json.brand ?? {};
const banned = brand.voice?.banned ?? [];
const qa_system = `You are a brand-safety checker. Banned words/claims: ${JSON.stringify(banned)}.
Fail a post if: it contains a banned word or a guaranteed-result claim, the caption exceeds 2200 chars,
it has more than 5 hashtags, or it makes an unverifiable numeric promise to the reader.
Return ONLY JSON, no prose: {"results":[{"i":number,"pass":boolean,"reason":string}]}`;
const qa_user = JSON.stringify(items.map((c, i) => ({ i, hook: plan.posts[i].hook, caption: c.caption, hashtags: c.hashtags })));
return [{ json: { items, qa_system, qa_user } }];"""

ASSEMBLE_JS = r"""
const cfg = $('Config').first().json;
const plan = $('Parse + validate plan').first().json;
const { items } = $('Build QA request').first().json;
const qaRes = $('OpenAI — QA').first().json;
let results;
try {
  const t = aiText(qaRes).replace(/```json|```/g, '').trim();
  results = JSON.parse(t).results ?? [];
} catch (e) { throw new Error('QA model returned invalid JSON'); }
const passMap = new Map(results.map(r => [r.i, r]));

// Next Monday..Sunday at publish_time_local in Asia/Makassar (UTC+8, no DST)
const [hh, mm] = cfg.publish_time_local.split(':').map(Number);
const local = new Date(Date.now() + 8 * 3600e3);
const dow = local.getUTCDay();                        // 0 = Sunday
const daysToMon = ((8 - dow) % 7) || 7;
const out = [];
plan.posts.forEach((p, i) => {
  const qa = passMap.get(i);
  if (!qa || qa.pass !== true) return;                // failed or missing QA → not inserted
  const when = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + daysToMon + i, hh - 8, mm));
  const c = items[i];
  out.push({ post: {
    tenant: cfg.tenant, pillar: p.pillar, brand_version: plan.brand_version, format: p.format,
    hook: p.hook, hook_alternates: (c.hook_alternates ?? []).slice(0, 3), slides: p.slides,
    caption: c.caption, hashtags: (c.hashtags ?? []).slice(0, 5), alt_text: c.alt_text ?? null,
    cta: p.cta, cta_type: p.cta_type, hook_type: p.hook_type, is_experiment: Boolean(p.is_experiment),
    length_bucket: p.format === 'single' ? 'single' : (p.slides.length <= 5 ? 'short' : 'long'),
    scheduled_for: when.toISOString(), prompt_hash: plan.prompt_hash } });
});
if (out.length === 0) throw new Error('All 7 posts failed QA: ' + JSON.stringify(results).slice(0, 400));
const skipped = plan.posts.length - out.length;
return out.map(o => ({ json: { ...o, skipped } }));"""


def wf1():
    wf = WF("Whisker OS WF1 — Weekly Planner")
    t = cron(wf, "Sunday 17:00", "0 17 * * 0")
    c = config(wf)
    ctx = rpc(wf, "Load context", "n8n_load_context", "{ p_tenant: $json.tenant }")
    bp = code(wf, "Build planner prompt", BUILD_PLANNER_JS)
    cache = rpc(wf, "Cache lookup", "n8n_cache_get", "{ p_prompt_hash: $json.prompt_hash }")
    hit = if_true(wf, "Cache hit?", '={{ !!$json.response }}')
    sonnet = openai(wf, "OpenAI — plan week", '$("Config").first().json.model_planner',
                    '$("Build planner prompt").first().json.system', '$("Build planner prompt").first().json.user',
                    8000, pos=[wf.x, 480])
    save = rpc(wf, "Save to cache", "n8n_cache_put",
               '{ p_prompt_hash: $("Build planner prompt").first().json.prompt_hash, '
               'p_model: $("Config").first().json.model_planner, '
               'p_response: JSON.stringify((() => { const r = $("OpenAI — plan week").first().json; if (r.status !== "completed") throw new Error("Planner incomplete"); const t = (r.output ?? []).flatMap(o => o.content ?? [])'
               '.filter(b => b.type === "output_text").map(b => b.text).join("").replace(/```json|```/g, "").trim(); '
               'try { return JSON.parse(t); } catch (e) { return null; } })()), '
               'p_tokens_in: $("OpenAI — plan week").first().json.usage?.input_tokens ?? null, '
               'p_tokens_out: $("OpenAI — plan week").first().json.usage?.output_tokens ?? null }',
               pos=[wf.x, 480])
    parse = code(wf, "Parse + validate plan", PARSE_PLAN_JS)
    memo = rpc(wf, "Save strategy memo", "n8n_save_memo",
               '{ p_tenant_id: $json.tenant_id, p_memo: $json.memo, p_mix: JSON.stringify($json.posts.map(p => ({ pillar: p.pillar, '
               'format: p.format, hook_type: p.hook_type, is_experiment: p.is_experiment }))) }')
    bcopy = code(wf, "Build caption request", BUILD_COPY_JS)
    haiku = openai(wf, "OpenAI — captions", '$("Config").first().json.model_copy',
                   '$json.system', '$json.user', 6000)
    bqa = code(wf, "Build QA request", BUILD_QA_JS)
    qa = openai(wf, "OpenAI — QA", '$("Config").first().json.model_qa', '$json.qa_system', '$json.qa_user', 1200)
    asm = code(wf, "Assemble + schedule", ASSEMBLE_JS)
    ins = rpc(wf, "Insert post + features + render job", "n8n_insert_post", "{ post: JSON.stringify($json.post) }")
    summ = code(wf, "Summarise", r"""
const n = $input.all().length;
const skipped = $('Assemble + schedule').first().json.skipped ?? 0;
return [{ json: { message: `Planned ${n} posts (${skipped} failed QA) — render jobs queued` } }];""")
    lg = log(wf, "Log run", "WF1_weekly_planner", "ok", '$json.message')
    wf.chain(t, c, ctx, bp, cache, hit)
    wf.link(hit, parse, out=0)
    wf.link(hit, sonnet, out=1)
    wf.chain(sonnet, save, parse, memo, bcopy, haiku, bqa, qa, asm, ins, summ, lg)
    return wf.dump("WF1_weekly_planner.json")


# =====================================================================
# WF2 Carousel render (n8n side; reel jobs are left for the Remotion worker)
# =====================================================================
def wf2():
    wf = WF("Whisker OS WF2 — Carousel Render")
    t = cron(wf, "Every 5 min", "*/5 * * * *")
    c = config(wf)
    claim = rpc(wf, "Claim render job", "n8n_claim_render_job", '{ kinds: "carousel,cover" }')
    has = if_true(wf, "Job claimed?", '={{ !!$json.job }}')
    slides = code(wf, "Plan slide renders", r"""
const cfg = $('Config').first().json;
const job = $('Claim render job').first().json.job;
// The renderer draws slide 0 as the hook cover, then one image per slide.
const slides = Array.isArray(job.slides) ? job.slides : [];
const total = job.format === 'single' ? 1 : slides.length + 1;
if (total > 10) throw new Error(`Post ${job.post_id} would be ${total} images; Instagram max is 10`);
return Array.from({ length: total }, (_, n) => ({ json: { job_id: job.job_id, post_id: job.post_id, position: n, brand_version: job.brand_version ?? 1 } }));""")
    render = http(wf, "Render and store slide", "POST",
                  "={{ $env.WHOS_RENDER_URL }}/render?post={{ $json.post_id }}&slide={{ $json.position }}&v={{ $json.brand_version }}",
                  headers=API_AUTH, **ERR)
    once = code(wf, "Collapse to job",
                "return [{ json: { job_id: $('Plan slide renders').first().json.job_id, slides: $input.all().length } }];")
    fin = rpc(wf, "Finish job (ok)", "n8n_finish_render_job", "{ p_job: $json.job_id, p_ok: true }")
    lg = log(wf, "Log run", "WF2_render", "ok",
             '"job " + $("Collapse to job").first().json.job_id + " -> " + $json.result')
    ferr = code(wf, "Collect render error", r"""
const e = $input.first().json;
return [{ json: { job_id: $('Claim render job').first().json.job.job_id,
  error: String(e.error?.message ?? e.message ?? JSON.stringify(e)).slice(0, 1000) } }];""",
                pos=[1700, 520], executeOnce=True)
    failj = rpc(wf, "Finish job (failed)", "n8n_finish_render_job",
                "{ p_job: $json.job_id, p_ok: false, p_error: $json.error }", pos=[1940, 520])
    alert = wa_notice(wf, "Alert render failure",
                      '"⚠️ Render failed for job " + $("Collect render error").first().json.job_id + ": " '
                      '+ $("Collect render error").first().json.error', pos=[2180, 520])
    wf.chain(t, c, claim, has)
    wf.link(has, slides, out=0)
    wf.chain(slides, render)
    wf.link(render, once, out=0); wf.link(render, ferr, out=1)
    wf.chain(once, fin, lg)
    wf.chain(ferr, failj, alert)
    return wf.dump("WF2_carousel_render.json")


# =====================================================================
# WF3a Approval digest  /  WF3b Approval inbound
# =====================================================================
def wf3a():
    wf = WF("Whisker OS WF3a — Approval Digest")
    t1 = cron(wf, "Sunday 19:00 digest", "0 19 * * 0", pos=[0, 200])
    t2 = cron(wf, "Daily 09:00 reminder", "0 9 * * *", pos=[0, 420])
    c = config(wf, pos=[240, 300])
    codes = rpc(wf, "Assign approval codes", "n8n_assign_approval_codes", "{ p_tenant: $json.tenant }", pos=[480, 300])
    msg = code(wf, "Build digest", r"""
const posts = $json.posts ?? [];
if (posts.length === 0) return [];                       // nothing pending → stop quietly
// Template notice (works outside the 24h window). Replying LIST opens the window and WF3b sends the full list.
const text = `📋 Whisker & Heat: ${posts.length} post(s) waiting for approval. Reply LIST to see them, or OK all to approve everything. Unapproved posts are never auto-published.`;
return [{ json: { text, count: posts.length } }];""", pos=[720, 300])
    send = wa_notice(wf, "Send digest", '$json.text', pos=[960, 300])
    lg = log(wf, "Log run", "WF3a_digest", "ok",
             '"digest sent: " + $("Build digest").first().json.count + " posts"', pos=[1200, 300])
    wf.link(t1, c); wf.link(t2, c)
    wf.chain(c, codes, msg, send, lg)
    return wf.dump("WF3a_approval_digest.json")


def wf3b():
    """Called by the Magnovent WhatsApp bot (Execute Workflow) when the OWNER sends an approval command.
    Meta delivers every message for that number to the bot's one webhook, so approvals ride on it:
    no second webhook, no second Meta app. Input item: the bot's normalised message {from, text, isOwner}."""
    wf = WF("Whisker OS WF3b — Approval Commands (called by Magnovent bot)")
    trig = wf.node("From Magnovent bot", "n8n-nodes-base.executeWorkflowTrigger", 1.1,
                   {"inputSource": "passthrough"}, pos=[0, 300])
    c = config(wf, pos=[240, 300])
    parse = code(wf, "Filter + parse command", r"""
const m = $('From Magnovent bot').first().json;
const from = String(m.from ?? '').replace(/\D/g, '');
const owners = String(($env.AOS_OWNER_WHATSAPP || $env.MAGNOVENT_OWNER_WHATSAPP) ?? '').split(',').map(v => v.replace(/\D/g, '')).filter(Boolean);
// Only the owner can approve or reject posts — checked here again, not just trusted from the caller.
if (!from || !owners.includes(from)) throw new Error('Approval command from a non-owner number was refused');
const body = String(m.text ?? '').trim();
let r;
if (/^(list|all|show all|all content|show all content|list all|schedule|content|show all days content|all days|all days content)$/i.test(body)) r = { action: 'list', codes: null, hook: null };
else if ((r=body.match(/^(?:list|show|content)?\s*(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2})$/i))) r={action:'list',codes:null,hook:null,day:r[1].toLowerCase()};
else if ((r = body.match(/^preview\s+(\d+)$/i))) r = { action: 'preview', codes: [Number(r[1])], hook: null };
else if (/^(?:ok|approve)\s+all$/i.test(body)) r = { action: 'approve_all', codes: null, hook: null };
else if ((r = body.match(/^ok\s+([\d,\s]+)$/i))) r = { action: 'approve', codes: r[1].split(/[,\s]+/).filter(Boolean).map(Number), hook: null };
else if ((r = body.match(/^no\s+([\d,\s]+)$/i))) r = { action: 'reject', codes: r[1].split(/[,\s]+/).filter(Boolean).map(Number), hook: null };
else if ((r = body.match(/^edit\s+(\d+)\s*:\s*([\s\S]{3,140})$/i))) r = { action: 'edit', codes: [Number(r[1])], hook: r[2].trim() };
else r = { action: 'help', codes: null, hook: null };
return [{ json: { ...r, raw: body, from } }];""", pos=[480, 300])
    route = switch(wf, "Route command", "={{ $json.action }}",
                   [("list", "list"), ("help", "help"), ("preview", "preview")], fallback="apply", pos=[720, 300])
    REPLY_TO = '$("Filter + parse command").first().json.from'
    codes = rpc(wf, "Assign approval codes", "n8n_list_content",
                '{ p_tenant: $("Config").first().json.tenant }', pos=[960, 100])
    listmsg = code(wf, "Build list", r"""
let posts = $json.posts ?? [];
const request=$('Filter + parse command').first().json;
const dayKey=d=>new Date(d).toLocaleDateString('en-CA',{timeZone:'Asia/Makassar'});
let day=request.day;
if(day){
 const today=dayKey(new Date()); const base=new Date(today+'T12:00:00+08:00');
 if(day==='today') day=today;
 else if(day==='tomorrow') day=dayKey(new Date(base.getTime()+86400000));
 else if(!/^\d{4}-\d{2}-\d{2}$/.test(day)){
  const names=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const current=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Makassar',weekday:'long'}).format(base).toLowerCase();
  day=dayKey(new Date(base.getTime()+((names.indexOf(day)-names.indexOf(current)+7)%7)*86400000));
 }
 posts=posts.filter(p=>p.scheduled_for && dayKey(p.scheduled_for)===day);
}
if(!posts.length) return [{json:{text:'Whisker & Heat: no content'+(day?' scheduled for '+day:' yet')+'. Reply ALL to see every post, including approved and unscheduled content.'}}];
const fmt=iso=>!iso?'Unscheduled':new Date(iso).toLocaleString('en-GB',{timeZone:'Asia/Makassar',weekday:'short',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
const label=p=>p.status==='approved'?(p.scheduled_for?'Scheduled · approved':'Approved · unscheduled'):({pending_approval:'Awaiting approval',draft:'Draft',rendered:'Rendered',published:'Published',publishing:'Publishing',failed:'Failed',rejected:'Rejected'}[p.status]??p.status);
const lines=posts.map(p=>`${p.code}. ${label(p)} · ${fmt(p.scheduled_for)}\n${p.hook}\nPREVIEW ${p.code} — all slides${p.permalink?'\n'+p.permalink:''}`);
const footer='\n\nALL · TODAY · TOMORROW · LIST 2026-10-12\nPREVIEW 1 — every slide\nOK all / APPROVE all — approve waiting posts';
const chunks=[];let text='Whisker & Heat · '+posts.length+' post(s)'+(day?' · '+day:'')+' · Bali time';
for(const line of lines){if((text+'\n\n'+line+footer).length>3800){chunks.push({json:{text:text+footer}});text='Whisker & Heat · continued';}text+='\n\n'+line;}
chunks.push({json:{text:text+footer}});return chunks;""",
                   pos=[1200, 100])
    sendlist = wa_text(wf, "Send list", '$json.text', to_js=REPLY_TO, pos=[1440, 100])
    helpmsg = wa_text(wf, "Send help", '"Whisker & Heat Agency OS — your content approval assistant. Reply LIST or ALL for every post and its status. Reply TODAY, TOMORROW, MONDAY or LIST YYYY-MM-DD for a day. Reply PREVIEW 1 (or another draft number) to receive every slide as an image, in order. Approve with OK 1,3 or OK all; reject with NO 2; change a hook with EDIT 4: new hook. Only explicit OK commands approve posts. This chat currently supports these commands; broader creative requests can go to Codex."',
                      to_js=REPLY_TO, pos=[960, 300])
    previewq = rpc(wf, "Load preview images", "n8n_preview_post",
                   '{ p_tenant: $("Config").first().json.tenant, p_code: $("Filter + parse command").first().json.codes[0] }',
                   alwaysOutputData=True, pos=[960, 760])
    previewitems = code(wf, "Prepare full preview", r"""
const post = $input.first().json;
const to = $('Filter + parse command').first().json.from;
const images = (post.post_assets ?? []).filter(a => a.public_url).sort((a,b) => a.position-b.position);
if (!images.length) return [{json:{messaging_product:'whatsapp',to,type:'text',text:{body:'No rendered draft found for that number. Reply LIST for the current draft numbers.'}}}];
return images.map((a,i) => ({json:{messaging_product:'whatsapp',to,type:'image',image:{link:a.public_url,
 caption:`Whisker & Heat post ${post.approval_code} · Slide ${i+1}/${images.length}\n${post.hook}\n${i === images.length-1 ? (post.status === 'pending_approval' || !post.status ? 'Review all slides, then reply OK '+post.approval_code+' to approve. Nothing is approved by previewing.' : 'Status: '+post.status+'. Viewing does not change approval or schedule.') : 'Draft preview · '+post.status}`}}}));
""", pos=[1200,760])
    previewsend = http(wf, "Send every preview image", "POST", WA_URL, headers=WA_HEADERS,
                       json_body='={{ JSON.stringify($json) }}', pos=[1440,760])
    next(n for n in wf.nodes if n["name"] == previewsend)["parameters"]["options"]["batching"] = {"batch": {"batchSize": 1, "batchInterval": 700}}
    apply_ = rpc(wf, "Apply approval", "n8n_apply_approval",
                 '{ p_tenant: $("Config").first().json.tenant, p_action: $json.action, p_codes: ($json.codes ?? []).join(","), '
                 'p_new_hook: $json.hook }', pos=[960, 520], **ERR)
    reply = wa_text(wf, "Confirm to owner",
                    '({ approve_all: "✅ Approved all", approve: "✅ Approved", reject: "🗑️ Rejected", '
                    'edit: "✏️ Re-rendering" }[$("Filter + parse command").first().json.action]) '
                    '+ " — " + $json.affected + " post(s)"', to_js=REPLY_TO, pos=[1200, 460])
    lg = log(wf, "Log run", "WF3b_commands", "ok",
             '$("Filter + parse command").first().json.raw + " -> " + $("Apply approval").first().json.affected',
             pos=[1440, 460])
    bad = wa_text(wf, "Reply with error", '"❌ Could not apply: " + ($json.error?.message ?? "unknown error")',
                  to_js=REPLY_TO, pos=[1200, 640])
    wf.chain(trig, c, parse, route)
    wf.link(route, codes, out=0); wf.link(route, helpmsg, out=1); wf.link(route, previewq, out=2); wf.link(route, apply_, out=3)
    wf.chain(previewq, previewitems, previewsend)
    wf.chain(codes, listmsg, sendlist)
    wf.link(apply_, reply, out=0); wf.link(apply_, bad, out=1)
    wf.chain(reply, lg)
    return wf.dump("WF3b_approval_commands.json")


# =====================================================================
# WF4 Publisher (every 15 min; claims at most one due approved post)
# =====================================================================
PREP_MEDIA_JS = r"""
const post = $('Claim post').first().json.post;
if (!post.ig_user_id) throw new Error('social_accounts.ig_user_id is empty for this tenant — finish Meta setup first');
const media = (post.assets ?? []).filter(a => a.url);
if (post.format === 'carousel') {
  if (media.length < 2 || media.length > 10) throw new Error(`Carousel needs 2-10 assets, has ${media.length}`);
  return media.map(a => ({ json: { kind: 'child', url: a.url } }));
}
if (media.length < 1) throw new Error('No rendered asset for this post');
return [{ json: { kind: post.format === 'reel' ? 'reel' : 'single', url: media[0].url } }];"""


def wf4():
    wf = WF("Whisker OS WF4 — Publisher")
    t = cron(wf, "Every 15 min", "*/15 * * * *")
    c = config(wf)
    claim = rpc(wf, "Claim post", "n8n_claim_next_post", "{ p_tenant: $json.tenant }")
    has = if_true(wf, "Post due?", '={{ !!$json.post }}')
    prep = code(wf, "Prepare media", PREP_MEDIA_JS, **ERR)
    sw = switch(wf, "Route by format", "={{ $json.kind }}",
                [("child", "child"), ("single", "single"), ("reel", "reel")])
    ig = '{{ $("Claim post").first().json.post.ig_user_id }}'
    cap = '={{ $("Claim post").first().json.post.caption }}'
    child = http(wf, "Create child container", "POST", f"={GRAPH}/{ig}/media", creds="fb",
                 query=[("image_url", "={{ $json.url }}"), ("is_carousel_item", "true")], pos=[1680, 140], **ERR)
    agg = wf.node("Collect child ids", "n8n-nodes-base.aggregate", 1,
                  {"fieldsToAggregate": {"fieldToAggregate": [
                      {"fieldToAggregate": "id", "renameField": True, "outputFieldName": "children"}]},
                   "options": {}}, pos=[1920, 140])
    parent = http(wf, "Create carousel container", "POST", f"={GRAPH}/{ig}/media", creds="fb",
                  query=[("media_type", "CAROUSEL"), ("children", '={{ $json.children.join(",") }}'),
                         ("caption", cap)], pos=[2160, 140], **ERR)
    single = http(wf, "Create image container", "POST", f"={GRAPH}/{ig}/media", creds="fb",
                  query=[("image_url", "={{ $json.url }}"), ("caption", cap)], pos=[1680, 320], **ERR)
    reel = http(wf, "Create reel container", "POST", f"={GRAPH}/{ig}/media", creds="fb",
                query=[("media_type", "REELS"), ("video_url", "={{ $json.url }}"), ("caption", cap),
                       ("share_to_feed", "true")], pos=[1680, 500], **ERR)
    keep = code(wf, "Container id", "return [{ json: { container_id: $input.first().json.id } }];", pos=[2400, 320])
    wait = wf.node("Wait 10s", "n8n-nodes-base.wait", 1.1, {"amount": 10, "unit": "seconds"},
                   pos=[2640, 320], webhookId=str(uuid.uuid4()))
    status = http(wf, "Get container status", "GET",
                  f'={GRAPH}/{{{{ $("Container id").first().json.container_id }}}}', creds="fb",
                  query=[("fields", "status_code,status")], pos=[2880, 320], **ERR)
    ready = switch(wf, "Ready?", "={{ $json.status_code }}", [("finished", "FINISHED"), ("error", "ERROR")],
                   fallback="in_progress", pos=[3120, 320])
    guard = code(wf, "Poll guard (max 3 min)", r"""
if ($runIndex >= 18) throw new Error('Container not ready after 18 polls: ' + JSON.stringify($input.first().json));
return $input.all();""", pos=[3360, 480], **ERR)
    pub = http(wf, "Publish", "POST", f"={GRAPH}/{ig}/media_publish", creds="fb",
               query=[("creation_id", '={{ $("Container id").first().json.container_id }}')], pos=[3360, 200], **ERR)
    perma = http(wf, "Get permalink", "GET", f"={GRAPH}/{{{{ $json.id }}}}", creds="fb",
                 query=[("fields", "id,permalink")], pos=[3600, 200], **ERR)
    done = rpc(wf, "Mark published", "n8n_mark_post_published",
               '{ p_post: $("Claim post").first().json.post.id, p_media_id: $json.id, p_permalink: $json.permalink }',
               pos=[3840, 200])
    lg = log(wf, "Log run", "WF4_publisher", "ok", '"published " + $("Get permalink").first().json.permalink',
             pos=[4080, 200])
    note = wa_notice(wf, "Notify published", '"✅ Posted: " + $("Get permalink").first().json.permalink',
                     pos=[4320, 200], **ERR)
    note_fallback = wa_text(wf, "Notify published in active chat", '"Whisker & Heat: your approved post is live. " + $("Get permalink").first().json.permalink', pos=[4560, 320])
    ferr = code(wf, "Collect publish error", r"""
const e = $input.first().json;
const msg = e.error?.message ?? (e.status_code === 'ERROR' ? 'container status ERROR: ' + (e.status ?? '') : null) ?? e.message ?? JSON.stringify(e);
return [{ json: { post_id: $('Claim post').first().json.post.id, error: String(msg).slice(0, 1000) } }];""",
                pos=[3360, 700], executeOnce=True)
    failp = rpc(wf, "Mark failed (retry/backoff)", "n8n_mark_post_failed",
                "{ p_post: $json.post_id, p_error: $json.error }", pos=[3600, 700])
    flog = log(wf, "Log failure", "WF4_publisher", "error", '$("Collect publish error").first().json.error',
               pos=[3840, 700])
    falert = wa_notice(wf, "Alert failure",
                       '"⚠️ Publish failed (" + $("Mark failed (retry/backoff)").first().json.new_status + "): " '
                       '+ $("Collect publish error").first().json.error', pos=[4080, 700])
    wf.chain(t, c, claim, has)
    wf.link(has, prep, out=0)
    wf.link(prep, sw, out=0); wf.link(prep, ferr, out=1)
    wf.link(sw, child, out=0); wf.link(sw, single, out=1); wf.link(sw, reel, out=2)
    wf.link(child, agg, out=0); wf.link(child, ferr, out=1)
    wf.link(agg, parent)
    for n in (parent, single, reel):
        wf.link(n, keep, out=0); wf.link(n, ferr, out=1)
    wf.chain(keep, wait, status)
    wf.link(status, ready, out=0); wf.link(status, ferr, out=1)
    wf.link(ready, pub, out=0)       # FINISHED
    wf.link(ready, ferr, out=1)      # ERROR
    wf.link(ready, guard, out=2)     # in progress → poll again
    wf.link(guard, wait, out=0); wf.link(guard, ferr, out=1)
    wf.link(pub, perma, out=0); wf.link(pub, ferr, out=1)
    wf.link(perma, done, out=0); wf.link(perma, ferr, out=1)
    wf.chain(done, lg, note)
    wf.link(note, note_fallback, out=1)
    wf.chain(ferr, failp, flog, falert)
    return wf.dump("WF4_publisher.json")


# =====================================================================
# WF5 Insights (hourly snapshots at 2h/24h/72h/7d + 72h score)
# =====================================================================
def wf5():
    wf = WF("Whisker OS WF5 — Insights + Score")
    t = cron(wf, "Hourly :05", "5 * * * *")
    c = config(wf)
    dueq = rpc(wf, "Snapshots due", "n8n_snapshots_due")
    due = code(wf, "Split due", "return ($json.due ?? []).map(d => ({ json: d }));")
    ins = http(wf, "Fetch insights", "GET", f"={GRAPH}/{{{{ $json.ig_media_id }}}}/insights", creds="fb",
               query=[("metric", '={{ $json.format === "reel" '
                                 '? "reach,likes,comments,saved,shares,views,ig_reels_avg_watch_time" '
                                 ': "reach,likes,comments,saved,shares,views,profile_visits,follows" }}')],
               onError="continueRegularOutput")
    norm = code(wf, "Normalise metrics", r"""
const due = $('Split due').all();
return $input.all().map((item, idx) => {
  const src = due[idx].json;
  const data = item.json.data ?? [];
  const v = (name) => { const m = data.find(d => d.name === name); return m ? Number(m.values?.[0]?.value ?? m.total_value?.value ?? 0) : null; };
  return { json: { post_id: src.post_id, hours: src.hours, ok: data.length > 0,
    error: item.json.error ? String(item.json.error.message ?? item.json.error).slice(0, 300) : null,
    views: v('views'), reach: v('reach'), likes: v('likes'), saves: v('saved'), shares: v('shares'),
    comments: v('comments'), profile_visits: v('profile_visits'), follows: v('follows'),
    avg_watch_ms: v('ig_reels_avg_watch_time') } };
});""")
    okf = if_true(wf, "Got data?", '={{ $json.ok }}')
    up = rpc(wf, "Upsert snapshot", "n8n_upsert_snapshot", "{ snapshot: JSON.stringify($json) }")
    is72 = if_true(wf, "72h snapshot?", '={{ Number($json.hours) === 72 }}')
    score = rpc(wf, "Score 72h", "n8n_score_72h", "{ p_post: $json.post_id }")
    summ = code(wf, "Summarise",
                "return [{ json: { message: `snapshots processed: ${$('Normalise metrics').all().length}` } }];",
                executeOnce=True)
    lg = log(wf, "Log run", "WF5_insights", "ok", '$json.message')
    bad = log(wf, "Log fetch error", "WF5_insights", "error",
              '"insights fetch failed for " + $json.post_id + ": " + $json.error', pos=[1700, 520])
    wf.chain(t, c, dueq, due, ins, norm, okf)
    wf.link(okf, up, out=0); wf.link(okf, bad, out=1)
    wf.link(up, is72)
    wf.link(is72, score, out=0); wf.link(is72, summ, out=1)
    wf.link(score, summ)
    wf.link(summ, lg)
    return wf.dump("WF5_insights.json")


# =====================================================================
# WF9 Setup & health check (run on demand; uses only credentials already on the server)
# =====================================================================
def wf9():
    wf = WF("Whisker OS WF9 — Setup & Health Check")
    OK = {"onError": "continueRegularOutput"}
    t = wf.node("Run once", "n8n-nodes-base.manualTrigger", 1, {}, pos=[0, 300])
    c = config(wf)
    s1 = openai(wf, "Ping planner model", '$("Config").first().json.model_planner', '"Reply with a JSON object containing ok set to true"',
                '"ping"', 64, **OK)
    s2 = openai(wf, "Ping copy model", '$("Config").first().json.model_copy', '"Reply with a JSON object containing ok set to true"',
                '"ping"', 64, **OK)
    me = http(wf, "Meta token: who am I", "GET", '=https://graph.facebook.com/{{ $("Config").first().json.graph_version }}/me',
              creds="fb", query=[("fields", "id,name")], **OK)
    pages = http(wf, "Meta token: pages + Instagram", "GET",
                 '=https://graph.facebook.com/{{ $("Config").first().json.graph_version }}/me',
                 creds="fb", query=[("fields", "name,instagram_business_account{id,username}")], **OK)
    tlist = http(wf, "WhatsApp template status", "GET",
                 '=https://graph.facebook.com/{{ $("Config").first().json.graph_version }}/{{ ($env.AOS_WA_BUSINESS_ACCOUNT_ID || $env.MAGNOVENT_WA_BUSINESS_ACCOUNT_ID) }}/message_templates',
                 headers=WA_HEADERS, query=[("name", '={{ $("Config").first().json.wa_notice_template }}'),
                                            ("fields", "name,status,language,category,rejected_reason")], **OK)
    need = if_true(wf, "Template missing?", '={{ !($json.data ?? []).some(x => x.name === $("Config").first().json.wa_notice_template) && !$json.error }}')
    create = http(wf, "Create notice template", "POST",
                  '=https://graph.facebook.com/{{ $("Config").first().json.graph_version }}/{{ ($env.AOS_WA_BUSINESS_ACCOUNT_ID || $env.MAGNOVENT_WA_BUSINESS_ACCOUNT_ID) }}/message_templates',
                  headers=WA_HEADERS, json_body='={{ JSON.stringify({ name: $("Config").first().json.wa_notice_template, '
                  'language: $("Config").first().json.wa_template_lang, category: "UTILITY", components: [{ type: "BODY", '
                  'text: "Agency OS update: " + "{" + "{1}" + "}" + ". Reply in this chat if anything needs you.", '
                  'example: { body_text: [["3 posts are waiting for your approval"]] } }] }) }}', **OK)
    summ = code(wf, "Summary", r"""
const j = (n) => { try { return $(n).first().json; } catch (e) { return { not_run: true }; } };
const txt = (r) => { try { return aiText(r); } catch(e) { return ''; } };
const err = (r) => r.error ? String(r.error.message ?? r.error).slice(0, 300) : null;
const p1 = j('Ping planner model'), p2 = j('Ping copy model');
const pages = j('Meta token: pages + Instagram');
const tl = j('WhatsApp template status');
const cr = j('Create notice template');
return [{ json: {
  openai_planner: { model: p1.model ?? null, reply: txt(p1) || null, error: err(p1), keys: Object.keys(p1).slice(0, 8) },
  openai_copy: { model: p2.model ?? null, reply: txt(p2) || null, error: err(p2) },
  meta_me: { ...(({ id, name }) => ({ id, name }))(j('Meta token: who am I')), error: err(j('Meta token: who am I')) },
  instagram_accounts: (pages.data ?? (pages.instagram_business_account ? [pages] : [])).map(pg => ({ page: pg.name, ig: pg.instagram_business_account ?? null })),
  pages_error: err(pages),
  whatsapp_template: (tl.data ?? []).map(x => ({ name: x.name, status: x.status, language: x.language, category: x.category, rejected_reason: x.rejected_reason })),
  template_error: err(tl),
  template_created: cr.not_run ? null : { id: cr.id ?? null, status: cr.status ?? null, error: err(cr) },
  owner_number_set: Boolean(String(($env.AOS_OWNER_WHATSAPP || $env.MAGNOVENT_OWNER_WHATSAPP) ?? '').replace(/\D/g, ''))
} }];""", executeOnce=True)
    wf.chain(t, c, s1, s2, me, pages, tlist, need)
    wf.link(need, create, out=0); wf.link(need, summ, out=1)
    wf.link(create, summ)
    return wf.dump("WF9_setup_check.json")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--tenant-config", type=pathlib.Path)
    parser.add_argument("--dry-run", action="store_true")
    options = parser.parse_args()
    if options.tenant_config:
        try:
            foundation_dry_run(json.loads(options.tenant_config.read_text()))
        except ValueError as exc:
            parser.exit(2, str(exc) + "\n")
    if options.dry_run:
        parser.exit(2, "Dry-run requires an explicit --tenant-config\n")
    OUT.mkdir(parents=True, exist_ok=True)
    # WF3b (WhatsApp approval commands) and WF9 (Meta setup check) are Signal's: they listen on the shared
    # Magnovent WhatsApp number, and two brands cannot both answer it. Whisker approves in its dashboard.
    files = [f() for f in (wf0, wf1, wf2, wf3a, wf4, wf5)]
    for f in files:
        d = json.loads((OUT / f).read_text())
        print(f"{f:30s} nodes={len(d['nodes']):3d}")
