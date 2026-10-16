// Generates the Whisker & Heat n8n workflows. Edit this file, never the JSON it writes.
// Run: node automations/build-workflows.mjs   →   automations/n8n/*.json (imported switched off).
//
// Settings come from n8n environment variables (N8N_BLOCK_ENV_ACCESS_IN_NODE=false):
//   WH_API_BASE        https://<site>          the Whisker & Heat site
//   WH_IG_USER_ID      Instagram professional account id
//   WH_GRAPH_VERSION   e.g. v23.0
//   WH_ENABLE_GENERATION=true                 only after the video price is confirmed
//   WH_VIDEO_SUBMIT_URL / WH_VIDEO_STATUS_URL  the video provider's endpoints
//   WH_ALERT_WEBHOOK   optional: where failures are reported
// Credentials (n8n → Credentials → Header Auth), referenced by name:
//   "Whisker Heat API"  Authorization: Bearer <WF_WORKFLOW_TOKEN>
//   "Anthropic API"     x-api-key: <key>
//   "Instagram Graph"   Authorization: Bearer <long-lived page/IG token>
//   "Video Provider"    whatever header the provider needs
import {mkdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const OUT = new URL('./n8n/', import.meta.url);
mkdirSync(OUT, {recursive: true});
const API = '={{ $env.WH_API_BASE }}';
const GRAPH = "={{ 'https://graph.facebook.com/' + $env.WH_GRAPH_VERSION }}";

class Workflow {
  constructor(id, name) { Object.assign(this, {id, name, nodes: [], connections: {}}); }
  add(name, type, parameters, version, credential) {
    const node = {id: createHash('sha1').update(this.id + '/' + name).digest('hex').slice(0, 32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5'),
      name, type: 'n8n-nodes-base.' + type, typeVersion: version, position: [this.nodes.length * 240, 300], parameters};
    if (credential) node.credentials = {httpHeaderAuth: {id: 'SET_IN_N8N', name: credential}};
    this.nodes.push(node);
    return name;
  }
  code(name, js) { return this.add(name, 'code', {jsCode: js.trim()}, 2); }
  http(name, method, url, {body, query, credential = 'Whisker Heat API', options = {}} = {}) {
    const p = {method, url, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', options: {timeout: 120000, ...options}};
    if (body !== undefined) Object.assign(p, {sendBody: true, specifyBody: 'json', jsonBody: body});
    if (query) Object.assign(p, {sendQuery: true, queryParameters: {parameters: Object.entries(query).map(([name, value]) => ({name, value}))}});
    return this.add(name, 'httpRequest', p, 4.2, credential);
  }
  every(name, interval) { return this.add(name, 'scheduleTrigger', {rule: {interval: [interval]}}, 1.2); }
  link(from, ...to) { this.connections[from] = {main: [to.map(node => ({node, type: 'main', index: 0}))]}; }
  chain(...names) { names.slice(1).forEach((n, i) => this.link(names[i], n)); }
  write(file) {
    const names = new Set(this.nodes.map(n => n.name));
    if (names.size !== this.nodes.length) throw Error(`${this.name}: duplicate node name`);
    for (const [from, {main}] of Object.entries(this.connections)) {
      if (!names.has(from)) throw Error(`${this.name}: unknown node ${from}`);
      for (const branch of main) for (const {node} of branch) if (!names.has(node)) throw Error(`${this.name}: unknown node ${node}`);
    }
    writeFileSync(new URL(file, OUT), JSON.stringify({
      id: this.id, name: this.name, active: false, nodes: this.nodes, connections: this.connections,
      settings: {executionOrder: 'v1', timezone: 'Asia/Makassar', saveManualExecutions: true, errorWorkflow: 'wh-00-alert'}, pinData: {},
    }, null, 2) + '\n');
  }
}

// WH-00 — any failure is reported, never silently swallowed.
{
  const w = new Workflow('wh-00-alert', 'Whisker & Heat · 00 failure alert');
  w.add('A workflow failed', 'errorTrigger', {}, 1);
  w.code('Describe the failure', `
const e = $json.execution || {};
return [{json: {text: 'Whisker & Heat workflow failed: ' + ($json.workflow?.name || '?') + ' at ' + (e.lastNodeExecuted || '?') + ' — ' + (e.error?.message || 'no message') + ' ' + (e.url || '')}}];`);
  w.code('Only when an alert address is set', `if (!$env.WH_ALERT_WEBHOOK) return []; return $input.all();`);
  w.add('Send alert', 'httpRequest', {method: 'POST', url: '={{ $env.WH_ALERT_WEBHOOK }}', sendBody: true, specifyBody: 'json', jsonBody: '={{ { text: $json.text } }}', options: {}}, 4.2);
  w.chain('A workflow failed', 'Describe the failure', 'Only when an alert address is set', 'Send alert');
  w.write('wh-00-alert.json');
}

// WH-01 — every Sunday 17:00, next week's slate of post ideas.
{
  const w = new Workflow('wh-01-plan', 'Whisker & Heat · 01 plan next week');
  w.every('Sunday 17:00', {field: 'weeks', weeksInterval: 1, triggerAtDay: [0], triggerAtHour: 17});
  w.code('Next Monday', `
const d = new Date(); d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
return [{json: {weekStart: d.toISOString().slice(0, 10)}}];`);
  w.http('Plan the week', 'POST', API + "/api/workflow/plan-week", {body: '={{ { weekStart: $json.weekStart } }}'});
  w.chain('Sunday 17:00', 'Next Monday', 'Plan the week');
  w.write('wh-01-plan.json');
}

// WH-02 — the script writer drafts each new idea. A person always reviews and approves.
{
  const w = new Workflow('wh-02-write', 'Whisker & Heat · 02 draft scripts and captions');
  w.every('Every 30 minutes', {field: 'minutes', minutesInterval: 30});
  w.http('Ideas waiting for a draft', 'GET', API + '/api/workflow/posts/ideas');
  w.http('Story bible and recipes', 'GET', API + '/api/workflow/context');
  w.code('One request per idea', `
const {site, recipes, brand} = $('Story bible and recipes').first().json;
const posts = $('Ideas waiting for a draft').first().json.posts || [];
return posts.map(post => {
  const recipe = recipes.find(r => r.id === post.recipeId);
  const episode = site.episodes.find(e => e.n === post.episode);
  const cast = post.characters.map(id => ({...site.characters.find(c => c.id === id), ...brand.characters[id]}));
  const format = brand.formats[post.format];
  const system = [
    'You write short vertical videos for Whisker & Heat, a cat-led cooking brand. Four original fictional cats: Luna, Simba, Nico, Milo.',
    'Rules: ' + brand.style.rules.join(' '),
    'Stories can be exaggerated; recipes must be real and safe. Every cooking step shown must match the written recipe exactly. Never present human food as food for cats. No medical, weight-loss or price claims. No allergy jokes.',
  ].join('\\n');
  const user = JSON.stringify({
    task: 'Write the draft for this post.', format: format.label, seconds: format.seconds, collection: site.collections.find(c => c.id === post.pillar),
    title: post.title, hookIdea: post.hook, notes: post.notes, poll: post.poll, platforms: post.platforms,
    characters: cast.map(c => ({name: c.name, role: c.role, voice: c.voice, catchphrase: c.catchphrase, never: c.never})),
    episode: episode ? {n: episode.n, title: episode.title, synopsis: episode.text} : null,
    recipe: recipe ? {title: recipe.title, servings: recipe.servings, minutes: recipe.totalMinutes, ingredients: recipe.ingredients, steps: recipe.steps} : null,
    link: 'Captions end with: Recipe at the link in bio.',
  });
  const captions = Object.fromEntries(post.platforms.map(p => [p, {type: 'string', description: p + ' caption, native to that platform, under 2000 characters'}]));
  return {json: {postId: post.id, request: {
    model: 'claude-opus-5-5', max_tokens: 16000, output_config: {effort: 'medium', format: {type: 'json_schema', schema: {
      type: 'object', additionalProperties: false, required: ['hook', 'script', 'shotlist', 'captions', 'hashtags'],
      properties: {
        hook: {type: 'string', description: 'What happens in the first 1-2 seconds'},
        script: {type: 'string', description: 'Lines as SPEAKER: line, plus [action] notes'},
        shotlist: {type: 'string', description: 'Numbered shots with framing and on-screen text'},
        captions: {type: 'object', additionalProperties: false, required: post.platforms, properties: captions},
        hashtags: {type: 'string'}}}}},
    system, messages: [{role: 'user', content: user}]}}};
});`);
  w.http('Ask Claude for the draft', 'POST', 'https://api.anthropic.com/v1/messages', {credential: 'Anthropic API', body: '={{ $json.request }}',
    options: {timeout: 300000, batching: {batch: {batchSize: 1, batchInterval: 2000}}}});
  w.code('Read the draft', `
return $input.all().map((item, i) => {
  const r = item.json;
  const postId = $('One request per idea').all()[i].json.postId;
  if (r.stop_reason === 'refusal') throw new Error('Claude declined post ' + postId + ': ' + (r.stop_details?.explanation || r.stop_details?.category || 'no detail'));
  if (r.stop_reason === 'max_tokens') throw new Error('Draft for post ' + postId + ' was cut off; raise max_tokens.');
  const text = (r.content || []).find(b => b.type === 'text')?.text;
  if (!text) throw new Error('No draft text for post ' + postId);
  return {json: {postId, draft: JSON.parse(text)}};
});`);
  w.http('Save the draft', 'POST', "={{ $env.WH_API_BASE + '/api/workflow/posts/' + $json.postId + '/draft' }}", {body: '={{ $json.draft }}'});
  w.chain('Every 30 minutes', 'Ideas waiting for a draft', 'Story bible and recipes', 'One request per idea', 'Ask Claude for the draft', 'Read the draft', 'Save the draft');
  // The Messages API requires the anthropic-version header alongside the key.
  const ask = w.nodes.find(n => n.name === 'Ask Claude for the draft');
  Object.assign(ask.parameters, {sendHeaders: true, headerParameters: {parameters: [{name: 'anthropic-version', value: '2023-06-01'}]}});
  w.write('wh-02-write.json');
}

// WH-03 — submit one video job to the provider (switched off until the price is confirmed).
{
  const w = new Workflow('wh-03-video-submit', 'Whisker & Heat · 03 submit video jobs');
  w.every('Every 10 minutes', {field: 'minutes', minutesInterval: 10});
  w.code('Generation switched on?', `if ($env.WH_ENABLE_GENERATION !== 'true' || !$env.WH_VIDEO_SUBMIT_URL) return []; return [{json: {}}];`);
  w.http('Claim one job', 'POST', API + '/api/workflow/claim', {body: '={{ {} }}'});
  w.code('A job exists', `const j = $json.job; return j ? [{json: j}] : [];`);
  w.http('Submit to the video provider', 'POST', '={{ $env.WH_VIDEO_SUBMIT_URL }}', {credential: 'Video Provider',
    body: "={{ { prompt: $json.prompt, duration: 10, aspect_ratio: '9:16', resolution: '720p' } }}"});
  w.code('Keep the request id', `
const id = $json.request_id || $json.id || $json.requestId;
if (!id) throw new Error('The provider returned no request id. Check its history before submitting again.');
return [{json: {jobId: $('A job exists').first().json.id, requestId: String(id)}}];`);
  w.http('Record the request', 'POST', API + '/api/workflow/register', {body: '={{ $json }}'});
  w.chain('Every 10 minutes', 'Generation switched on?', 'Claim one job', 'A job exists', 'Submit to the video provider', 'Keep the request id', 'Record the request');
  w.write('wh-03-video-submit.json');
}

// WH-04 — collect finished videos; they wait for review in the Studio.
{
  const w = new Workflow('wh-04-video-collect', 'Whisker & Heat · 04 collect finished videos');
  w.every('Every 5 minutes', {field: 'minutes', minutesInterval: 5});
  w.code('Collection switched on?', `if (!$env.WH_VIDEO_STATUS_URL) return []; return [{json: {}}];`);
  w.http('Jobs being generated', 'GET', API + '/api/workflow/pending');
  w.add('One per job', 'splitOut', {fieldToSplitOut: 'jobs', options: {}}, 1);
  w.http('Ask the provider', 'GET', "={{ $env.WH_VIDEO_STATUS_URL.replace('{id}', $json.requestId) }}", {credential: 'Video Provider'});
  w.code('Finished or failed', `
return $input.all().flatMap((item, i) => {
  const job = $('One per job').all()[i].json, r = item.json;
  const status = String(r.status || '').toLowerCase();
  const url = r.video_url || r.output?.video_url || r.result?.url;
  if (url && /complete|succeed|done|finished/.test(status)) return [{json: {path: 'complete', body: {jobId: job.id, videoUrl: url}}}];
  if (/fail|error|cancel/.test(status)) return [{json: {path: 'fail', body: {jobId: job.id, error: r.error || status}}}];
  return [];
});`);
  w.http('Report the result', 'POST', "={{ $env.WH_API_BASE + '/api/workflow/' + $json.path }}", {body: '={{ $json.body }}'});
  w.chain('Every 5 minutes', 'Collection switched on?', 'Jobs being generated', 'One per job', 'Ask the provider', 'Finished or failed', 'Report the result');
  w.write('wh-04-video-collect.json');
}

// WH-05 — publish scheduled posts to Instagram at their time; record the real link.
{
  const w = new Workflow('wh-05-publish', 'Whisker & Heat · 05 publish to Instagram');
  w.every('Every 15 minutes', {field: 'minutes', minutesInterval: 15});
  w.http('Posts due now', 'GET', API + '/api/workflow/posts/due');
  w.code('Instagram posts not yet published', `
if (!$env.WH_IG_USER_ID) return [];
return ($json.posts || []).filter(p => p.pending.includes('instagram')).map(p => ({json: {
  postId: p.id, video: !/\\.(jpe?g|png)(\\?|$)/i.test(p.mediaUrl), mediaUrl: p.mediaUrl,
  caption: [p.captions.instagram, p.hashtags].filter(Boolean).join('\\n\\n')}}));`);
  w.http('Create the media container', 'POST', GRAPH + "/{{ $env.WH_IG_USER_ID }}/media", {credential: 'Instagram Graph',
    query: {media_type: "={{ $json.video ? 'REELS' : 'IMAGE' }}", video_url: "={{ $json.video ? $json.mediaUrl : '' }}", image_url: "={{ $json.video ? '' : $json.mediaUrl }}", caption: '={{ $json.caption }}'}});
  w.add('Let Instagram process it', 'wait', {amount: 90, unit: 'seconds'}, 1.1);
  w.http('Is it ready?', 'GET', GRAPH + "/{{ $('Create the media container').item.json.id }}", {credential: 'Instagram Graph', query: {fields: 'status_code'}});
  w.code('Only finished containers', `
return $input.all().flatMap((item, i) => {
  const status = item.json.status_code;
  if (status === 'ERROR' || status === 'EXPIRED') throw new Error('Instagram could not process post ' + $('Instagram posts not yet published').all()[i].json.postId + ': ' + status);
  return status === 'FINISHED' || !status ? [{json: {postId: $('Instagram posts not yet published').all()[i].json.postId, creationId: $('Create the media container').all()[i].json.id}}] : [];
});`);
  w.http('Publish', 'POST', GRAPH + "/{{ $env.WH_IG_USER_ID }}/media_publish", {credential: 'Instagram Graph', query: {creation_id: '={{ $json.creationId }}'}});
  w.http('Get the post link', 'GET', GRAPH + '/{{ $json.id }}', {credential: 'Instagram Graph', query: {fields: 'permalink'}});
  w.http('Record it in the Studio', 'POST', "={{ $env.WH_API_BASE + '/api/workflow/posts/' + $('Only finished containers').item.json.postId + '/published' }}",
    {body: "={{ { platform: 'instagram', url: $json.permalink, postId: $json.id } }}"});
  w.chain('Every 15 minutes', 'Posts due now', 'Instagram posts not yet published', 'Create the media container', 'Let Instagram process it', 'Is it ready?', 'Only finished containers', 'Publish', 'Get the post link', 'Record it in the Studio');
  w.write('wh-05-publish.json');
}

// WH-06 — every morning, results for published Instagram posts.
{
  const w = new Workflow('wh-06-results', 'Whisker & Heat · 06 collect results');
  w.every('Every day 07:00', {field: 'days', daysInterval: 1, triggerAtHour: 7});
  w.http('Published posts', 'GET', API + '/api/workflow/posts/published');
  w.code('Instagram posts from the last 60 days', `
const since = Date.now() - 60 * 86400000;
return ($json.posts || []).filter(p => p.published.instagram && Date.parse(p.published.instagram.at) > since)
  .map(p => ({json: {postId: p.id, mediaId: p.published.instagram.postId}}));`);
  w.http('Ask Instagram', 'GET', GRAPH + '/{{ $json.mediaId }}/insights', {credential: 'Instagram Graph', query: {metric: 'views,reach,saved,shares,likes,comments'}});
  w.code('Name the numbers', `
const names = {views: 'views', reach: 'reach', saved: 'saves', shares: 'shares', likes: 'likes', comments: 'comments'};
return $input.all().map((item, i) => {
  const metrics = {};
  for (const m of item.json.data || []) if (names[m.name]) metrics[names[m.name]] = m.values?.[0]?.value ?? m.total_value?.value ?? 0;
  return {json: {postId: $('Instagram posts from the last 60 days').all()[i].json.postId, body: {platform: 'instagram', metrics}}};
});`);
  w.http('Save the results', 'POST', "={{ $env.WH_API_BASE + '/api/workflow/posts/' + $json.postId + '/metrics' }}", {body: '={{ $json.body }}'});
  w.chain('Every day 07:00', 'Published posts', 'Instagram posts from the last 60 days', 'Ask Instagram', 'Name the numbers', 'Save the results');
  w.write('wh-06-results.json');
}

console.log('Wrote 7 workflows to automations/n8n/');
