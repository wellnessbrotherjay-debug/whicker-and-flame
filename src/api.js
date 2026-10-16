export async function api(path, {method = 'GET', body} = {}) {
  const response = await fetch('/api/' + path, {
    method,
    headers: body ? {'Content-Type': 'application/json'} : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw Error(data.error || 'Something went wrong. Please try again.');
  return data;
}
