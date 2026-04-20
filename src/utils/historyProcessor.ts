export interface HistoryStats {
  totalHours: number;
  topArtists: { name: string; ms: number; count: number }[];
  topTracks: { name: string; ms: number; count: number }[];
  yearsStat: Record<string, number>;
  firstDate: string;
  lastDate: string;
  fileCount: number;
}

export const processHistoryFiles = async (files: FileList | File[]): Promise<HistoryStats | null> => {
  const stats = {
    totalMs: 0,
    artists: {} as Record<string, { ms: number; count: number }>,
    tracks: {} as Record<string, { ms: number; count: number }>,
    years: {} as Record<string, number>,
    firstListeningDate: null as string | null,
    lastListeningDate: null as string | null,
    fileCount: 0
  };

  try {
    const jsonFiles = Array.from(files).filter(f => f.name.endsWith('.json'));
    stats.fileCount = jsonFiles.length;

    if (jsonFiles.length === 0) return null;

    for (const file of jsonFiles) {
      const text = await file.text();
      const content = JSON.parse(text);
      
      if (!Array.isArray(content)) continue;

      content.forEach((entry: any) => {
        const ms = entry.ms_played || entry.msPlayed || 0;
        const artist = entry.master_metadata_album_artist_name || entry.artistName;
        const track = entry.master_metadata_track_name || entry.trackName;
        const ts = entry.ts || entry.endTime;

        if (!artist || !track || !ts) return;

        stats.totalMs += ms;

        // Date tracking
        if (!stats.firstListeningDate || ts < stats.firstListeningDate) stats.firstListeningDate = ts;
        if (!stats.lastListeningDate || ts > stats.lastListeningDate) stats.lastListeningDate = ts;

        // Artist stats
        if (!stats.artists[artist]) stats.artists[artist] = { ms: 0, count: 0 };
        stats.artists[artist].ms += ms;
        stats.artists[artist].count += 1;

        // Track stats
        const trackKey = `${track} — ${artist}`;
        if (!stats.tracks[trackKey]) stats.tracks[trackKey] = { ms: 0, count: 0 };
        stats.tracks[trackKey].ms += ms;
        stats.tracks[trackKey].count += 1;

        // Year stats
        const year = ts.substring(0, 4);
        if (!stats.years[year]) stats.years[year] = 0;
        stats.years[year] += ms;
      });
    }

    // Sort and limit
    const topArtists = Object.entries(stats.artists)
      .map(([name, s]) => ({ name, ...s }))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 30);

    const topTracks = Object.entries(stats.tracks)
      .map(([name, s]) => ({ name, ...s }))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 30);

    return {
      totalHours: Math.round(stats.totalMs / 3600000),
      topArtists,
      topTracks,
      yearsStat: stats.years,
      firstDate: stats.firstListeningDate || new Date().toISOString(),
      lastDate: stats.lastListeningDate || new Date().toISOString(),
      fileCount: stats.fileCount
    };
  } catch (error) {
    console.error("Error processing history files in browser:", error);
    return null;
  }
};
