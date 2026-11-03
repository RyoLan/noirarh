/** Reads the launch feed published by a Noira site (GET /api/launches). */
export async function fetchLaunches(feedUrl: string, verdict: string, limit: number, signal?: AbortSignal): Promise<unknown> {
  if (!feedUrl) throw new Error('No feed URL is set (feedUrl in Settings).');
  const url = new URL('/api/launches', feedUrl);
  url.searchParams.set('verdict', verdict);
  url.searchParams.set('limit', String(limit));
  const res = await fetch(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`The launch feed at ${url.origin} returned ${res.status}`);
  return res.json();
}
