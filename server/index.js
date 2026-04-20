import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Mistral } from '@mistralai/mistralai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const apiKey = process.env.MISTRAL_API_KEY;
if (!apiKey) {
  console.warn('[warn] MISTRAL_API_KEY missing from server/.env — /api/chat will return an error until it is set.');
}
const mistral = apiKey ? new Mistral({ apiKey }) : null;

const extractSpotifyId = (url) => {
  const m = url.match(/(playlist|album|track)\/([A-Za-z0-9]+)/);
  if (!m) return null;
  return { kind: m[1], id: m[2] };
};

// Scrape Spotify's public embed page — works for any public playlist/album
// including editorial ones that the Web API restricts for non-approved apps.
const extractFromEmbed = async (kind, id) => {
  const url = `https://open.spotify.com/embed/${kind}/${id}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html',
    },
  });
  if (!res.ok) {
    const err = new Error(`Spotify embed page returned ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const html = await res.text();

  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Could not locate playlist data on the embed page.');

  let data;
  try {
    data = JSON.parse(match[1]);
  } catch {
    throw new Error('Failed to parse embed page JSON.');
  }

  const entity = data?.props?.pageProps?.state?.data?.entity;
  if (!entity) throw new Error('Embed page had no entity data.');

  const list = Array.isArray(entity.trackList) ? entity.trackList : [];
  const tracks = list
    .filter((t) => t?.title)
    .map((t) => {
      const artist = t.subtitle || (t.artists || []).map((a) => a.name).join(', ') || '';
      return `${artist} - ${t.title}`.trim();
    });

  return {
    tracks,
    title: entity.title || entity.name || null,
    creator: entity.subtitle || null,
  };
};

app.post('/api/extract', async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'URL is required' });
  if (!url.includes('spotify.com')) {
    return res.status(400).json({
      error: 'Only Spotify URLs are supported. Paste a spotify.com link or use the "My Spotify" source.',
    });
  }

  const parsed = extractSpotifyId(url);
  if (!parsed) return res.status(400).json({ error: 'Unrecognized Spotify URL format.' });
  if (parsed.kind === 'track') {
    return res.status(400).json({ error: 'Paste a playlist or album URL, not a single track.' });
  }

  try {
    const { tracks, title, creator } = await extractFromEmbed(parsed.kind, parsed.id);
    if (tracks.length === 0) {
      return res
        .status(404)
        .json({ error: 'No tracks found on the embed page. Is the playlist public?' });
    }
    res.json({ tracks, metadata: { title, creator } });
  } catch (err) {
    console.error('[extract] failed:', err.message);
    res.status(err.status || 500).json({
      error: `Extraction failed: ${err.message}. The playlist may be private — make it public or use "My Spotify".`,
    });
  }
});

app.post('/api/chat', async (req, res) => {
  if (!mistral) {
    return res.status(500).json({ error: 'Server is missing MISTRAL_API_KEY. Add it to server/.env.' });
  }
  const { message, context } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Message is required' });

  const systemPrompt = `You are MySpotifyAI, a friendly and insightful music analyst.
You answer questions about the user's listening habits using the context below.
Use short paragraphs and light Markdown (bold, lists). Be specific about artists/tracks when relevant.

Context:
========
${context || '(no context provided)'}
========`;

  try {
    const out = await mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
    });
    res.json({ response: out.choices[0].message.content });
  } catch (err) {
    console.error('[chat] failed:', err.message);
    res.status(500).json({ error: 'Mistral request failed: ' + err.message });
  }
});

const PORT = 3000;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[server] listening on http://127.0.0.1:${PORT}`);
});
