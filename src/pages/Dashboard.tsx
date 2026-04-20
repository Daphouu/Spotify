import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import {
  LogOut,
  User,
  Send,
  MessageSquareText,
  FileJson,
  UploadCloud,
  ImagePlus,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import {
  fetchProfile,
  fetchTopItems,
  fetchUserPlaylists,
  fetchPlaylistTracks,
  searchTrack,
  createPlaylist,
  addTracksToPlaylist,
  uploadPlaylistCover,
  logout as logoutSpotify,
  redirectToSpotifyAuth,
  SpotifyApiError,
} from '../utils/spotify';
import { processHistoryFiles, type HistoryStats } from '../utils/historyProcessor';

type TimeRange = 'short_term' | 'medium_term' | 'long_term';

type Profile = {
  display_name?: string;
  id?: string;
  images?: { url: string }[];
};

type Artist = {
  id: string;
  name: string;
  genres?: string[];
  popularity?: number;
  images?: { url: string }[];
};

type Track = { id: string; name: string; artists: { name: string }[] };
type PlaylistMeta = { id: string; name: string; tracks?: { total: number } };

const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [topArtists, setTopArtists] = useState<Artist[]>([]);
  const [topTracks, setTopTracks] = useState<Track[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange>('long_term');
  const [loading, setLoading] = useState(true);

  const [myPlaylists, setMyPlaylists] = useState<PlaylistMeta[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [sourcePlatform, setSourcePlatform] = useState<'spotify' | 'url'>('spotify');

  const [playlistInput, setPlaylistInput] = useState('');
  const [newPlaylistName, setNewPlaylistName] = useState('My Migrated Playlist');
  const [extractUrl, setExtractUrl] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionStatus, setConversionStatus] = useState<'idle' | 'searching' | 'creating' | 'done'>(
    'idle'
  );

  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [playlistCover, setPlaylistCover] = useState<string | null>(null);

  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    {
      role: 'assistant',
      content:
        "Hello! I'm **MySpotifyAI**. Ask me anything about your listening habits — I know your current top artists, tracks, and genres.",
    },
  ]);
  const [isChatting, setIsChatting] = useState(false);

  const [historyResult, setHistoryResult] = useState<HistoryStats | null>(null);
  const [isProcessingHistory, setIsProcessingHistory] = useState(false);

  // ---------- Load dashboard data ----------
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const prof = await fetchProfile();
        if (cancelled) return;
        setProfile(prof);

        const [artistsData, tracksData, playlistsData] = await Promise.all([
          fetchTopItems('artists', timeRange, 20),
          fetchTopItems('tracks', timeRange, 20),
          fetchUserPlaylists(),
        ]);
        if (cancelled) return;
        setTopArtists((artistsData as any)?.items || []);
        setTopTracks(((tracksData as any)?.items || []).slice(0, 10));
        setMyPlaylists((playlistsData as any)?.items || []);
      } catch (err) {
        console.error('Dashboard load failed:', err);
        navigate('/');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [timeRange, navigate]);

  // ---------- Derived: genre breakdown (replacement for deprecated audio-features) ----------
  const genreBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    topArtists.forEach((a) => {
      (a.genres || []).forEach((g) => {
        counts[g] = (counts[g] || 0) + 1;
      });
    });
    const ordered = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const total = ordered.reduce((acc, [, n]) => acc + n, 0) || 1;
    return ordered.slice(0, 6).map(([name, n]) => ({ name, pct: Math.round((n / total) * 100) }));
  }, [topArtists]);

  const avgPopularity = useMemo(() => {
    if (!topArtists.length) return 0;
    const sum = topArtists.reduce((acc, a) => acc + (a.popularity || 0), 0);
    return Math.round(sum / topArtists.length);
  }, [topArtists]);

  // ---------- Handlers ----------
  const handleLogout = () => {
    logoutSpotify();
    navigate('/');
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const b64 = reader.result as string;
      setPlaylistCover(b64);
      setCoverPreview(b64);
    };
    reader.readAsDataURL(file);
  };

  const generateMagicCover = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pairs = [
      ['#1DB954', '#191414'],
      ['#00c6ff', '#0072ff'],
      ['#f953c6', '#b91d73'],
      ['#7f00ff', '#e100ff'],
      ['#ff4b1f', '#1fddff'],
      ['#3a1c71', '#d76d77'],
    ];
    const pair = pairs[Math.floor(Math.random() * pairs.length)];
    const grad = ctx.createLinearGradient(0, 0, 640, 640);
    grad.addColorStop(0, pair[0]);
    grad.addColorStop(1, pair[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 640, 640);

    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.arc(640, 0, 400, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 60px Inter, system-ui, sans-serif';

    const words = newPlaylistName.split(' ');
    const lines: string[] = [];
    let current = '';
    words.forEach((w) => {
      if ((current + w).length > 15) {
        lines.push(current.trim());
        current = w + ' ';
      } else {
        current += w + ' ';
      }
    });
    lines.push(current.trim());
    lines.forEach((line, i) => {
      ctx.fillText(line.toUpperCase(), 320, 320 - (lines.length - 1) * 35 + i * 70);
    });

    const b64 = canvas.toDataURL('image/jpeg', 0.85);
    setPlaylistCover(b64);
    setCoverPreview(b64);
  };

  const handleExtractFromUrl = async () => {
    if (!extractUrl.trim()) return;
    setIsExtracting(true);
    try {
      const resp = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: extractUrl }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `Server ${resp.status}`);

      if (data.tracks?.length > 0) {
        setPlaylistInput(data.tracks.join('\n'));
        const t = data.metadata?.title;
        const c = data.metadata?.creator;
        if (t) setNewPlaylistName(c ? `${t} (by ${c})` : t);
      } else {
        alert('No tracks found. Is the playlist public?');
      }
    } catch (err: any) {
      alert(`Extraction failed: ${err.message}`);
    }
    setIsExtracting(false);
  };

  const handleSelectMyPlaylist = async (playlistId: string) => {
    setSelectedPlaylistId(playlistId);
    if (!playlistId) return;
    setIsExtracting(true);
    try {
      const data = await fetchPlaylistTracks(playlistId);
      setPlaylistInput(data.tracksText);
      setNewPlaylistName(data.creator ? `${data.name} (by ${data.creator})` : data.name);
    } catch (err: any) {
      alert(`Spotify extract failed: ${err.message}`);
    }
    setIsExtracting(false);
  };

  const handleConvert = async () => {
    if (!playlistInput.trim()) {
      alert('Paste or extract tracks first.');
      return;
    }
    if (!profile?.id) {
      alert('Session error. Please log out and log in again.');
      return;
    }

    setIsConverting(true);
    setConversionStatus('searching');

    try {
      const lines = playlistInput.split('\n').map((l) => l.trim()).filter(Boolean);
      const uris: string[] = [];
      for (const line of lines) {
        const t = await searchTrack(line);
        if (t?.uri) uris.push(t.uri);
      }

      if (uris.length === 0) {
        alert('None of those tracks were found on Spotify. Check the spelling.');
        setConversionStatus('idle');
        setIsConverting(false);
        return;
      }

      setConversionStatus('creating');
      const playlist: any = await createPlaylist(newPlaylistName);
      await addTracksToPlaylist(playlist.id, uris);

      if (playlistCover) {
        try {
          await uploadPlaylistCover(playlist.id, playlistCover);
        } catch (e) {
          console.warn('Cover upload failed:', e);
        }
      }

      setConversionStatus('done');
      alert(
        `Done! "${newPlaylistName}" created with ${uris.length} of ${lines.length} tracks.`
      );
    } catch (err: any) {
      console.error(err);
      setConversionStatus('idle');
      setIsConverting(false);
      if (err instanceof SpotifyApiError && err.status === 403) {
        const wantsReconnect = window.confirm(
          'Spotify refused the write (403 Forbidden). This usually means your login predates the playlist-modify permission. Reconnect now to grant it?'
        );
        if (wantsReconnect) {
          logoutSpotify();
          await redirectToSpotifyAuth();
        }
        return;
      }
      alert(`Migration error: ${err.message}`);
      return;
    }
    setIsConverting(false);
  };

  const handleChatSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chatMessage.trim() || isChatting) return;

    const userMsg = chatMessage;
    setChatHistory((prev) => [...prev, { role: 'user', content: userMsg }]);
    setChatMessage('');
    setIsChatting(true);

    try {
      const lines: string[] = [
        `User: ${profile?.display_name || 'Unknown'}`,
        '',
        '== CURRENT TOP ARTISTS ==',
        ...topArtists.slice(0, 15).map((a, i) => `${i + 1}. ${a.name}${a.genres?.length ? ` (${a.genres.slice(0, 3).join(', ')})` : ''}`),
        '',
        '== CURRENT TOP TRACKS ==',
        ...topTracks.slice(0, 10).map((t, i) => `${i + 1}. ${t.name} — ${t.artists.map((x) => x.name).join(', ')}`),
      ];

      if (genreBreakdown.length) {
        lines.push('', '== TOP GENRES ==');
        genreBreakdown.forEach((g) => lines.push(`- ${g.name} (${g.pct}%)`));
      }

      if (historyResult) {
        lines.push('', '== EXTENDED HISTORY (UPLOADED) ==');
        lines.push(
          `Total listening: ${historyResult.totalHours} h, range ${new Date(historyResult.firstDate).getFullYear()}–${new Date(historyResult.lastDate).getFullYear()}`
        );
        lines.push('All-time top artists:');
        historyResult.topArtists.slice(0, 10).forEach((a, i) =>
          lines.push(`  ${i + 1}. ${a.name} (${Math.round(a.ms / 3600000)}h)`)
        );
      }

      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, context: lines.join('\n') }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `Server ${resp.status}`);
      setChatHistory((prev) => [...prev, { role: 'assistant', content: data.response || 'No response.' }]);
    } catch (err: any) {
      setChatHistory((prev) => [
        ...prev,
        { role: 'assistant', content: `Connection error: ${err.message}` },
      ]);
    }
    setIsChatting(false);
  };

  const handleHistoryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsProcessingHistory(true);
    try {
      const stats = await processHistoryFiles(files);
      if (stats) setHistoryResult(stats);
    } catch (err) {
      console.error(err);
      alert('Could not process those history files.');
    }
    setIsProcessingHistory(false);
  };

  // ---------- Render ----------
  if (loading) {
    return (
      <div className="hero-wrapper" style={{ backgroundColor: 'var(--bg-dark)' }}>
        <div className="pulse" style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--spotify-green)' }} />
        <h2 style={{ marginTop: 24 }}>Loading your library…</h2>
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="hero-wrapper" style={{ backgroundColor: 'var(--bg-dark)' }}>
        <h2>Login failed.</h2>
        <button onClick={handleLogout} className="btn-primary" style={{ marginTop: 20 }}>
          Return
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', paddingTop: 40, paddingBottom: 80 }}>
      <div className="container" style={{ maxWidth: 1000 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {profile.images?.[0]?.url ? (
              <img src={profile.images[0].url} alt="avatar" style={{ width: 60, height: 60, borderRadius: '50%' }} />
            ) : (
              <User size={24} />
            )}
            <div>
              <h2 style={{ margin: 0 }}>Hello, {profile.display_name}</h2>
            </div>
          </div>
          <button onClick={handleLogout} className="btn-logout">
            <LogOut size={18} /> Logout
          </button>
        </header>

        <div style={{ display: 'flex', gap: 10, marginBottom: 40 }}>
          {(['short_term', 'medium_term', 'long_term'] as TimeRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={timeRange === r ? 'btn-range active' : 'btn-range'}
            >
              {r.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Genre / popularity snapshot */}
        <div className="glass-panel" style={{ padding: 32, marginBottom: 40 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ margin: 0 }}>Your Musical DNA</h3>
            {historyResult && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'rgba(29, 185, 84, 0.1)', borderRadius: 100, border: '1px solid rgba(29, 185, 84, 0.3)' }}>
                <Sparkles size={14} className="text-spotify" />
                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--spotify-green)' }}>
                  EXTENDED HISTORY LOADED
                </span>
              </div>
            )}
          </div>

          {genreBreakdown.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>
              Not enough genre data yet — keep listening and check back!
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              {genreBreakdown.map((g) => (
                <GenreBar key={g.name} label={g.name} value={g.pct} />
              ))}
            </div>
          )}

          <div style={{ marginTop: 24, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <Stat label="Avg. artist popularity" value={`${avgPopularity} / 100`} />
            <Stat label="Top artists sampled" value={String(topArtists.length)} />
            {historyResult && (
              <>
                <Stat label="All-time hours" value={`${historyResult.totalHours.toLocaleString()} h`} />
                <Stat label="#1 of all time" value={historyResult.topArtists[0]?.name || '—'} />
              </>
            )}
          </div>
        </div>

        {/* AI Chat */}
        <div className="glass-panel" style={{ padding: 24, marginBottom: 40, border: '1px solid rgba(29, 185, 84, 0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <MessageSquareText size={24} className="text-spotify" />
            <h3>MySpotifyAI</h3>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {chatHistory.map((c, i) => (
              <div
                key={i}
                style={{
                  alignSelf: c.role === 'user' ? 'flex-end' : 'flex-start',
                  padding: '10px 14px',
                  borderRadius: 12,
                  maxWidth: '85%',
                  background: c.role === 'user' ? 'var(--surface-light)' : 'rgba(29,185,84,0.1)',
                }}
              >
                <ReactMarkdown>{c.content}</ReactMarkdown>
              </div>
            ))}
            {isChatting && (
              <div style={{ alignSelf: 'flex-start', padding: '10px 14px', color: 'var(--text-secondary)' }}>
                Thinking…
              </div>
            )}
          </div>
          <form onSubmit={handleChatSubmit} style={{ display: 'flex', gap: 10 }}>
            <input
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="Ask anything about your music…"
              style={{ flex: 1, padding: 12, borderRadius: 100, background: 'var(--surface-light)', border: 'none', color: 'white' }}
            />
            <button type="submit" className="btn-primary" style={{ borderRadius: '50%', width: 45, height: 45, padding: 0 }}>
              <Send size={18} />
            </button>
          </form>
        </div>

        {/* Top lists */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30, marginBottom: 60 }}>
          <div>
            <h3>Top Artists</h3>
            {topArtists.slice(0, 10).map((a, i) => (
              <div key={a.id} className="list-item">
                #{i + 1} {a.name}
              </div>
            ))}
          </div>
          <div>
            <h3>Top Tracks</h3>
            {topTracks.map((t, i) => (
              <div key={t.id} className="list-item">
                #{i + 1} {t.name}
              </div>
            ))}
          </div>
        </div>

        {/* Playlist tools */}
        <div className="glass-panel" style={{ padding: 32 }}>
          <h3>Playlist Builder</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
            Import tracks from one of your playlists or any Spotify/Spotify-album URL, then build a brand-new playlist.
          </p>

          <div style={{ marginBottom: 24 }}>
            <h4 style={{ marginBottom: 12 }}>1. Source</h4>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <button
                onClick={() => setSourcePlatform('spotify')}
                className={`btn-range ${sourcePlatform === 'spotify' ? 'active' : ''}`}
              >
                My Spotify
              </button>
              <button
                onClick={() => setSourcePlatform('url')}
                className={`btn-range ${sourcePlatform === 'url' ? 'active' : ''}`}
              >
                Spotify URL
              </button>
            </div>

            {sourcePlatform === 'spotify' ? (
              <div style={{ marginBottom: 10 }}>
                <select
                  value={selectedPlaylistId}
                  onChange={(e) => handleSelectMyPlaylist(e.target.value)}
                  style={{ width: '100%', padding: 12, borderRadius: 8, background: 'var(--surface-light)', border: 'none', color: 'white' }}
                >
                  <option value="">-- Pick one of your playlists --</option>
                  {myPlaylists.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.tracks?.total || 0} tracks)
                    </option>
                  ))}
                </select>
                {isExtracting && (
                  <div style={{ marginTop: 8, fontSize: '0.9rem', color: 'var(--spotify-green)' }}>
                    Fetching tracks…
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <input
                  value={extractUrl}
                  onChange={(e) => setExtractUrl(e.target.value)}
                  placeholder="https://open.spotify.com/playlist/… or /album/…"
                  style={{ flex: 1, padding: 12, borderRadius: 8, background: 'var(--surface-light)', border: 'none', color: 'white' }}
                />
                <button onClick={handleExtractFromUrl} className="btn-primary" disabled={isExtracting}>
                  {isExtracting ? '...' : 'Extract'}
                </button>
              </div>
            )}

            <textarea
              value={playlistInput}
              onChange={(e) => setPlaylistInput(e.target.value)}
              placeholder="Artist - Track (one per line)"
              style={{ width: '100%', height: 120, padding: 12, borderRadius: 8, background: 'var(--surface-light)', border: 'none', color: 'white' }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <h4 style={{ marginBottom: 12 }}>2. Configure & create</h4>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 20 }}>
              <label htmlFor="cover-upload" style={{ cursor: 'pointer' }}>
                <div
                  style={{
                    width: 100,
                    height: 100,
                    background: 'var(--surface-light)',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {coverPreview ? (
                    <img src={coverPreview} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <ImagePlus size={30} />
                  )}
                </div>
              </label>
              <input
                id="cover-upload"
                type="file"
                accept="image/jpeg,image/png"
                onChange={handleImageChange}
                style={{ display: 'none' }}
              />
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <label>Playlist name</label>
                  <button type="button" onClick={generateMagicCover} className="btn-magic">
                    <Sparkles size={12} /> Magic Cover
                  </button>
                </div>
                <input
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 10,
                    borderRadius: 8,
                    background: 'var(--surface-light)',
                    border: 'none',
                    color: 'white',
                    marginTop: 5,
                  }}
                />
              </div>
            </div>
            <button onClick={handleConvert} disabled={isConverting} className="btn-primary" style={{ width: '100%' }}>
              {isConverting
                ? conversionStatus === 'searching'
                  ? 'Searching tracks…'
                  : conversionStatus === 'creating'
                  ? 'Creating playlist…'
                  : 'Processing…'
                : 'Create Spotify playlist'}{' '}
              <ArrowRight size={18} />
            </button>
            {conversionStatus === 'done' && (
              <div style={{ color: 'var(--spotify-green)', marginTop: 10 }}>Done!</div>
            )}
          </div>
        </div>

        {/* Extended history upload */}
        <div className="glass-panel" style={{ padding: 32, marginTop: 40, border: '1px dashed rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
            <div>
              <h3>Extended history upload</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: 8 }}>
                Upload your <code style={{ color: 'var(--spotify-green)' }}>Streaming_History_Audio_*.json</code> files to unlock all-time insights.
              </p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: 10, borderRadius: 8 }}>
              <FileJson size={24} className="text-spotify" />
            </div>
          </div>

          <div style={{ border: '2px dashed rgba(255,255,255,0.1)', borderRadius: 12, padding: 40, textAlign: 'center' }}>
            <input
              type="file"
              multiple
              accept=".json"
              onChange={handleHistoryUpload}
              id="history-upload"
              style={{ display: 'none' }}
            />
            <label htmlFor="history-upload" style={{ cursor: 'pointer' }}>
              <div
                style={{
                  width: 60,
                  height: 60,
                  background: 'rgba(29, 185, 84, 0.1)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <UploadCloud className="text-spotify" size={30} />
              </div>
              <h4 style={{ marginBottom: 8 }}>{isProcessingHistory ? 'Analyzing…' : 'Pick your JSON files'}</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                JSON only. Files never leave your browser.
              </p>
            </label>
          </div>

          {historyResult && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ marginTop: 24, padding: 16, borderRadius: 8, background: 'rgba(29,185,84,0.05)' }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
                <Stat label="Total hours" value={`${historyResult.totalHours.toLocaleString()} h`} />
                <Stat label="Files processed" value={String(historyResult.fileCount)} />
                <Stat label="#1 artist" value={historyResult.topArtists[0]?.name || '—'} />
                <Stat
                  label="Years covered"
                  value={`${new Date(historyResult.firstDate).getFullYear()}–${new Date(historyResult.lastDate).getFullYear()}`}
                />
              </div>
            </motion.div>
          )}

          <div style={{ marginTop: 24, padding: 16, borderRadius: 8, background: 'rgba(255,255,255,0.03)', fontSize: '0.85rem' }}>
            <h5 style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={14} /> How to get your data
            </h5>
            <ol style={{ paddingLeft: 20, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li>
                Go to{' '}
                <a href="https://www.spotify.com/account/privacy/" target="_blank" rel="noreferrer" style={{ color: 'var(--spotify-green)' }}>
                  Spotify Privacy
                </a>
              </li>
              <li>Request your "Extended Streaming History"</li>
              <li>Wait for the email (a few days)</li>
              <li>Upload the JSON files here</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};

const GenreBar: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
      <span style={{ textTransform: 'capitalize' }}>{label}</span>
      <span style={{ color: 'var(--spotify-green)' }}>{value}%</span>
    </div>
    <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        style={{ height: '100%', background: 'var(--spotify-green)', borderRadius: 3 }}
      />
    </div>
  </div>
);

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{value}</div>
  </div>
);

export default Dashboard;
