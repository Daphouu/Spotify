// Client-side Spotify helper using Authorization Code + PKCE.
// Requires the Spotify app's Redirect URI to match window.location.origin + '/callback'.

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID || '246a3172512d45e4993b4b5b2da93598';

const SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-top-read',
  'user-read-recently-played',
  'playlist-modify-public',
  'playlist-modify-private',
  'playlist-read-private',
  'playlist-read-collaborative',
  'ugc-image-upload',
].join(' ');

const redirectUri = () =>
  typeof window !== 'undefined'
    ? `${window.location.origin}/callback`
    : 'http://127.0.0.1:5174/callback';

// ---------- PKCE helpers ----------
const randomString = (len: number) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
};

const sha256 = async (input: string) => {
  const data = new TextEncoder().encode(input);
  return crypto.subtle.digest('SHA-256', data);
};

const base64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

// ---------- Auth ----------
export const redirectToSpotifyAuth = async () => {
  const verifier = randomString(64);
  const challenge = base64url(await sha256(verifier));
  const uri = redirectUri();

  localStorage.setItem('code_verifier', verifier);
  localStorage.setItem('redirect_uri', uri);

  const url = new URL('https://accounts.spotify.com/authorize');
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    redirect_uri: uri,
  }).toString();

  window.location.href = url.toString();
};

export const exchangeCodeForToken = async (code: string) => {
  const verifier = localStorage.getItem('code_verifier') || '';
  const uri = localStorage.getItem('redirect_uri') || redirectUri();

  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: uri,
      code_verifier: verifier,
    }),
  });
  const data = await r.json();
  if (data.access_token) {
    localStorage.setItem('access_token', data.access_token);
    if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
    if (data.expires_in) {
      localStorage.setItem('token_expires_at', String(Date.now() + data.expires_in * 1000));
    }
  }
  return data;
};

export const refreshAccessToken = async () => {
  const refresh = localStorage.getItem('refresh_token');
  if (!refresh) return null;
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refresh,
    }),
  });
  const data = await r.json();
  if (data.access_token) {
    localStorage.setItem('access_token', data.access_token);
    if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
    if (data.expires_in) {
      localStorage.setItem('token_expires_at', String(Date.now() + data.expires_in * 1000));
    }
    return data.access_token as string;
  }
  return null;
};

export const getAccessToken = () => localStorage.getItem('access_token');

// ---------- Fetch wrapper with auto-refresh ----------
const api = async (path: string, init: RequestInit = {}): Promise<Response> => {
  let token = getAccessToken();
  const expiresAt = Number(localStorage.getItem('token_expires_at') || 0);
  if (token && expiresAt && Date.now() > expiresAt - 30_000) {
    const refreshed = await refreshAccessToken();
    if (refreshed) token = refreshed;
  }
  if (!token) throw new Error('Not authenticated');

  const doFetch = (t: string) =>
    fetch(`https://api.spotify.com/v1${path}`, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${t}`,
      },
    });

  let res = await doFetch(token);
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) res = await doFetch(refreshed);
  }
  return res;
};

export class SpotifyApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const apiJson = async <T = any>(path: string, init?: RequestInit): Promise<T> => {
  const r = await api(path, init);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (data as any)?.error?.message || `Spotify ${r.status}`;
    throw new SpotifyApiError(msg, r.status);
  }
  return data as T;
};

// ---------- Public endpoints ----------
export const fetchProfile = () => apiJson('/me');

export const fetchTopItems = (
  type: 'artists' | 'tracks',
  time_range: 'short_term' | 'medium_term' | 'long_term' = 'medium_term',
  limit = 20
) => apiJson(`/me/top/${type}?time_range=${time_range}&limit=${limit}`);

export const fetchUserPlaylists = () => apiJson('/me/playlists?limit=50');

export const fetchPlaylistTracks = async (playlistId: string) => {
  const meta = await apiJson<any>(
    `/playlists/${playlistId}?fields=name,owner(display_name),tracks(total)`
  );
  const lines: string[] = [];
  let next: string | null = `/playlists/${playlistId}/tracks?limit=100&fields=items(track(name,artists(name))),next`;
  while (next) {
    const page: any = await apiJson<any>(next);
    for (const item of page.items || []) {
      const t = item?.track;
      if (!t) continue;
      lines.push(
        `${(t.artists || []).map((a: any) => a.name).join(', ') || 'Unknown Artist'} - ${t.name || 'Unknown Track'}`
      );
    }
    next = page.next ? page.next.replace('https://api.spotify.com/v1', '') : null;
  }
  return { name: meta.name, creator: meta.owner?.display_name || null, tracksText: lines.join('\n') };
};

const cleanQuery = (q: string) =>
  q
    .replace(/\s*[([]?(?:official|lyric(?:s)?|music)?\s*(?:video|audio)[)\]]?/gi, '')
    .replace(/\s*[([]?remaster(?:ed)?(?:\s+\d{4})?[)\]]?/gi, '')
    .replace(/\s*[([]?live(?:\s+at .*?)?[)\]]?/gi, '')
    .replace(/\s*ft\.? .*$/gi, '')
    .replace(/\s*feat\.? .*$/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

export const searchTrack = async (query: string) => {
  const cleaned = cleanQuery(query);
  let data = await apiJson<any>(`/search?q=${encodeURIComponent(cleaned)}&type=track&limit=1`);
  if (!data.tracks?.items?.length && cleaned !== query) {
    data = await apiJson<any>(`/search?q=${encodeURIComponent(query)}&type=track&limit=1`);
  }
  return data.tracks?.items?.[0] || null;
};

export const createPlaylist = async (name: string) => {
  return apiJson('/me/playlists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      description: 'Created via MySpotifyAnalytics',
      public: false,
    }),
  });
};

export const addTracksToPlaylist = async (playlistId: string, uris: string[]) => {
  // Spotify accepts up to 100 URIs per call
  for (let i = 0; i < uris.length; i += 100) {
    const chunk = uris.slice(i, i + 100);
    await apiJson(`/playlists/${playlistId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: chunk }),
    });
  }
};

export const uploadPlaylistCover = async (playlistId: string, base64Image: string) => {
  const clean = base64Image.split(',')[1] || base64Image;
  const res = await api(`/playlists/${playlistId}/images`, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: clean,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cover upload failed (${res.status}): ${text}`);
  }
};

export const logout = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('token_expires_at');
  localStorage.removeItem('code_verifier');
  localStorage.removeItem('redirect_uri');
};
