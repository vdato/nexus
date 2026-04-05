/**
 * Simple fetch wrapper for JSON API calls.
 */
export async function api(url, method = 'GET', body = null) {
  const opts = { method }
  if (body) {
    opts.headers = { 'Content-Type': 'application/json' }
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(url, opts)
  return res.json()
}
