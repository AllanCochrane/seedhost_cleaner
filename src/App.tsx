import { useState, useEffect, useMemo } from 'react';
import { 
  Server, 
  Trash2, 
  RefreshCw, 
  ShieldCheck, 
  AlertTriangle, 
  Terminal, 
  Database, 
  HardDrive,
  Info,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PlexItem, RadarrMovie, UTorrentTorrent, SyncMatch } from './types';
import axios from 'axios';

export default function App() {
  const [plexItems, setPlexItems] = useState<PlexItem[]>([]);
  const [radarrMovies, setRadarrMovies] = useState<RadarrMovie[]>([]);
  const [torrents, setTorrents] = useState<UTorrentTorrent[]>([]);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [plexRes, radarrRes, utorrentRes] = await Promise.all([
        axios.get('/api/plex/items'),
        axios.get('/api/radarr/movies'),
        axios.get('/api/utorrent/list').catch(() => ({ data: [] })) // Might fail if offline
      ]);
      setPlexItems(plexRes.data);
      setRadarrMovies(radarrRes.data);
      setTorrents(utorrentRes.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  const matches = useMemo(() => {
    const list: SyncMatch[] = [];
    
    // Group everything by title + year
    const radarrMap = new Map<string, RadarrMovie>();
    radarrMovies.forEach(m => radarrMap.set(`${normalize(m.title)}-${m.year}`, m));

    const plexMap = new Map<string, PlexItem>();
    plexItems.forEach(p => plexMap.set(`${normalize(p.title)}-${p.year}`, p));

    // Combine
    const allKeys = new Set([...radarrMap.keys(), ...plexMap.keys()]);

    allKeys.forEach(key => {
      const r = radarrMap.get(key);
      const p = plexMap.get(key);
      
      // Try to find matching torrent
      const t = torrents.find(t => r && t.name.toLowerCase().includes(normalize(r.title)));

      if (r || p) {
        list.push({
          title: r?.title || p?.title || "Unknown",
          plex: p,
          radarr: r,
          utorrent: t,
          remotePath: t ? `${t.current_directory}/${t.name}` : undefined,
          canCleanup: !!p && !!t
        });
      }
    });

    return list.sort((a, b) => b.canCleanup ? 1 : -1);
  }, [plexItems, radarrMovies, torrents]);

  const handleCleanup = async (match: SyncMatch) => {
    if (!match.utorrent) return;
    setCleaning(true);
    try {
      await axios.post('/api/cleanup', {
        items: [{
          torrentHash: match.utorrent.hash,
          remotePath: match.remotePath,
          radarrId: match.radarr?.id
        }]
      });
      fetchData();
    } catch (err: any) {
      setError("Cleanup failed: " + err.message);
    } finally {
      setCleaning(false);
    }
  };

  const cleanupAll = async () => {
    const toCleanup = matches.filter(m => m.canCleanup);
    if (toCleanup.length === 0) return;
    
    setCleaning(true);
    try {
      await axios.post('/api/cleanup', {
        items: toCleanup.map(m => ({
          torrentHash: m.utorrent!.hash,
          remotePath: m.remotePath,
          radarrId: m.radarr?.id
        }))
      });
      fetchData();
    } catch (err: any) {
      setError("Bulk cleanup failed: " + err.message);
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans">
      {/* Header */}
      <header className="border-b border-[#141414] p-6 flex justify-between items-end">
        <div>
          <h1 className="font-serif italic text-3xl mb-1 flex items-center gap-2">
            <Server className="w-8 h-8" />
            Media Library Janitor
          </h1>
          <p className="text-xs font-mono uppercase opacity-50 tracking-widest">
            Sync Orchestration & Space Recovery
          </p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 border border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="font-mono text-xs uppercase font-bold">Refresh</span>
          </button>
        </div>
      </header>

      {/* Stats Board */}
      <section className="grid grid-cols-1 md:grid-cols-4 border-b border-[#141414]">
        <StatCard icon={Database} label="Plex Content" value={plexItems.length} />
        <StatCard icon={ShieldCheck} label="Radarr Monitored" value={radarrMovies.filter(m => m.monitored).length} />
        <StatCard icon={HardDrive} label="Active Torrents" value={torrents.length} />
        <StatCard 
          icon={Trash2} 
          label="Ready to Purge" 
          value={matches.filter(m => m.canCleanup).length}
          accent
        />
      </section>

      {/* Main Grid */}
      <main className="p-0">
        {error && (
          <div className="bg-red-100 border-b border-red-400 text-red-700 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-mono">{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-xs uppercase font-bold underline">Dismiss</button>
          </div>
        )}

        {/* Global Action Bar */}
        <div className="bg-[#141414] text-[#E4E3E0] p-4 flex justify-between items-center px-6">
          <div className="flex items-center gap-4">
            <Terminal className="w-5 h-5 text-green-400" />
            <span className="font-mono text-xs uppercase">
              {cleaning ? 'Executing cleanup sequence...' : 'System Idle - Awaiting instructions'}
            </span>
          </div>
          {matches.filter(m => m.canCleanup).length > 0 && (
            <button 
              onClick={cleanupAll}
              disabled={cleaning}
              className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-full font-mono text-xs uppercase font-bold transition-all shadow-lg flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Purge All Ready Items
            </button>
          )}
        </div>

        {/* List Header */}
        <div className="grid grid-cols-12 p-4 px-6 border-b border-[#141414] bg-[#F1F0ED] items-center">
            <div className="col-span-1 font-serif italic text-[11px] opacity-40 uppercase tracking-widest">ID</div>
            <div className="col-span-3 font-serif italic text-[11px] opacity-40 uppercase tracking-widest">Media Title</div>
            <div className="col-span-2 font-serif italic text-[11px] opacity-40 uppercase tracking-widest">Plex Status</div>
            <div className="col-span-2 font-serif italic text-[11px] opacity-40 uppercase tracking-widest">Source (Radarr)</div>
            <div className="col-span-2 font-serif italic text-[11px] opacity-40 uppercase tracking-widest">Download (uT)</div>
            <div className="col-span-2 font-serif italic text-[11px] opacity-40 uppercase tracking-widest text-right">Actions</div>
        </div>

        {/* List Body */}
        <div className="flex flex-col">
          <AnimatePresence initial={false}>
            {loading ? (
              <div className="p-20 flex flex-col items-center justify-center gap-4 opacity-50">
                <RefreshCw className="w-12 h-12 animate-spin" />
                <p className="font-mono text-sm uppercase tracking-widest">Scanning libraries...</p>
              </div>
            ) : matches.length === 0 ? (
              <div className="p-20 flex flex-col items-center justify-center gap-4 opacity-50 text-center">
                <Info className="w-12 h-12" />
                <p className="font-mono text-sm uppercase tracking-widest max-w-xs">No media identified in connected services.</p>
              </div>
            ) : matches.map((match, idx) => (
              <motion.div 
                key={match.title + idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`grid grid-cols-12 p-4 px-6 border-b border-[#141414] hover:bg-white transition-all group ${match.canCleanup ? 'bg-orange-50/50' : ''}`}
              >
                  <div className="col-span-1 font-mono text-xs opacity-30">#{(idx + 1).toString().padStart(3, '0')}</div>
                  <div className="col-span-3">
                    <span className="font-bold text-lg leading-tight block">{match.title}</span>
                    <span className="text-[10px] font-mono uppercase opacity-50">Detected as: {match.plex ? 'Existing' : 'Missing'}</span>
                  </div>
                  
                  <div className="col-span-2 flex items-center gap-2">
                    {match.plex ? (
                      <div className="flex items-center gap-1.5 text-green-600 font-mono text-[10px] uppercase font-bold">
                        <CheckCircle2 className="w-4 h-4" /> Verified
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-gray-400 font-mono text-[10px] uppercase">
                        <XCircle className="w-4 h-4" /> Pending
                      </div>
                    )}
                  </div>

                  <div className="col-span-2 flex items-center">
                    {match.radarr ? (
                      <span className="bg-[#141414] text-white px-2 py-0.5 rounded text-[10px] font-mono">RADARR</span>
                    ) : (
                      <span className="border border-[#141414] px-2 py-0.5 rounded text-[10px] font-mono opacity-30">MANUAL</span>
                    )}
                  </div>

                  <div className="col-span-2 flex flex-col justify-center">
                    {match.utorrent ? (
                      <div className="flex flex-col">
                        <span className="font-mono text-[10px] uppercase font-bold truncate max-w-[150px]">
                          {match.utorrent.name}
                        </span>
                        <div className="w-24 bg-gray-200 h-1 mt-1 overflow-hidden">
                          <div className="bg-blue-600 h-full" style={{ width: `${match.utorrent.progress}%` }}></div>
                        </div>
                      </div>
                    ) : (
                      <span className="font-mono text-[10px] uppercase opacity-30 italic">Not in downloader</span>
                    )}
                  </div>

                  <div className="col-span-2 flex items-center justify-end">
                    {match.canCleanup ? (
                      <button 
                        onClick={() => handleCleanup(match)}
                        disabled={cleaning}
                        className="bg-orange-500 hover:bg-orange-600 text-white p-2 rounded transform active:scale-95 transition-all flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="font-mono text-[10px] uppercase font-bold">Clean</span>
                      </button>
                    ) : (
                      <span className="font-mono text-[10px] uppercase opacity-30 select-none">No action dev</span>
                    )}
                  </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </main>

      <footer className="p-8 border-t border-[#141414] opacity-50 flex justify-between items-center text-[10px] font-mono uppercase tracking-widest">
        <div>System Version 1.0.4 - Media Orchestration Protocol</div>
        <div className="flex gap-4">
          <span>Plex connected</span>
          <span>Radarr connected</span>
          <span>SSH connected</span>
        </div>
      </footer>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: any, label: string, value: string | number, accent?: boolean }) {
  return (
    <div className={`p-6 border-r border-[#141414] last:border-r-0 flex flex-col gap-1 ${accent ? 'bg-orange-100' : ''}`}>
      <div className="flex items-center gap-2 opacity-50">
        <Icon className="w-4 h-4" />
        <span className="font-mono text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="font-serif text-4xl italic font-black leading-none">{value}</div>
    </div>
  );
}
