export interface PlexItem {
  key: string;
  title: string;
  year?: number;
  type: string;
  addedAt: number;
  Media?: Array<{
    Part: Array<{
      file: string;
      size: number;
    }>;
  }>;
}

export interface RadarrMovie {
  id: number;
  title: string;
  year: number;
  path: string;
  hasFile: boolean;
  movieFile?: {
    size: number;
    relativePath: string;
  };
  monitored: boolean;
}

export interface UTorrentTorrent {
  hash: string;
  status: number;
  name: string;
  size: number;
  progress: number;
  downloaded: number;
  uploaded: number;
  ratio: number;
  upspeed: number;
  downspeed: number;
  eta: number;
  label: string;
  peers_connected: number;
  peers_in_swarm: number;
  seeds_connected: number;
  seeds_in_swarm: number;
  availability: number;
  torrent_queue_order: number;
  remaining: number;
  download_url?: string;
  rss_feed_url?: string;
  status_message?: string;
  stream_id?: string;
  added_on: number;
  completed_on: number;
  current_directory: string;
}

export interface SyncMatch {
  title: string;
  plex?: PlexItem;
  radarr?: RadarrMovie;
  utorrent?: UTorrentTorrent;
  remotePath?: string;
  canCleanup: boolean;
}
