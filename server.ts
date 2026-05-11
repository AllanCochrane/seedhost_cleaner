import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import { Client } from "ssh2";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  
  // 1. Get Plex Library
  app.get("/api/plex/items", async (req, res) => {
    try {
      const { PLEX_URL, PLEX_TOKEN } = process.env;
      if (!PLEX_URL || !PLEX_TOKEN) {
        return res.status(500).json({ error: "Plex config missing" });
      }
      
      const response = await axios.get(`${PLEX_URL}/library/sections/all`, {
        params: { 'X-Plex-Token': PLEX_TOKEN },
        headers: { 'Accept': 'application/json' }
      });
      
      res.json(response.data.MediaContainer.Metadata || []);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 2. Get Radarr History / Movies
  app.get("/api/radarr/movies", async (req, res) => {
    try {
      const { RADARR_URL, RADARR_API_KEY } = process.env;
      if (!RADARR_URL || !RADARR_API_KEY) {
        return res.status(500).json({ error: "Radarr config missing" });
      }
      
      const response = await axios.get(`${RADARR_URL}/api/v3/movie`, {
        params: { apiKey: RADARR_API_KEY }
      });
      
      res.json(response.data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 3. Get uTorrent Downloads
  // Note: uTorrent Web API is a bit legacy, often requires a token and auth
  app.get("/api/utorrent/list", async (req, res) => {
    try {
      const { UTORRENT_URL, UTORRENT_USER, UTORRENT_PASS } = process.env;
      if (!UTORRENT_URL || !UTORRENT_USER || !UTORRENT_PASS) {
        return res.status(500).json({ error: "uTorrent config missing" });
      }

      const authHeader = `Basic ${Buffer.from(`${UTORRENT_USER}:${UTORRENT_PASS}`).toString('base64')}`;
      
      // Get token first
      const tokenResponse = await axios.get(`${UTORRENT_URL}token.html`, {
        headers: { Authorization: authHeader }
      });
      const tokenMatch = tokenResponse.data.match(/<div id='token'[^>]*>([^<]+)<\/div>/);
      const token = tokenMatch ? tokenMatch[1] : null;

      if (!token) throw new Error("Could not fetch uTorrent token");

      const listResponse = await axios.get(`${UTORRENT_URL}`, {
        params: { token, list: 1 },
        headers: { Authorization: authHeader, Cookie: tokenResponse.headers['set-cookie']?.join('; ') }
      });
      
      const structured = listResponse.data.torrents.map((t: any[]) => ({
        hash: t[0],
        status: t[1],
        name: t[2],
        size: parseInt(t[3]),
        progress: t[4] / 1000,
        downloaded: parseInt(t[5]),
        ratio: t[7] / 1000,
        label: t[11],
        added_on: t[23],
        completed_on: t[24],
        current_directory: t[25]
      }));

      res.json(structured);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 4. Cleanup Action (SSH + uTorrent + Radarr)
  app.post("/api/cleanup", async (req, res) => {
    const { items } = req.body; // Array of { torrentHash, remotePath, radarrId }
    const results = [];

    try {
      const { 
        SSH_HOST, SSH_USER, SSH_PASS, SSH_KEY, 
        UTORRENT_URL, UTORRENT_USER, UTORRENT_PASS,
        RADARR_URL, RADARR_API_KEY 
      } = process.env;

      for (const item of items) {
        let sshSuccess = false;
        let utorrentSuccess = false;
        let radarrSuccess = false;

        // 1. SSH Remove
        if (SSH_HOST && SSH_USER && item.remotePath) {
          const conn = new Client();
          await new Promise((resolve, reject) => {
            const authProps: any = {
              host: SSH_HOST,
              port: 22,
              username: SSH_USER
            };

            if (SSH_PASS) authProps.password = SSH_PASS;
            if (SSH_KEY) authProps.privateKey = SSH_KEY;

            conn.on('ready', () => {
              conn.exec(`rm -rf "${item.remotePath}"`, (err, stream) => {
                if (err) reject(err);
                stream.on('close', (code: number) => {
                  sshSuccess = code === 0;
                  conn.end();
                  resolve(true);
                });
              });
            }).on('error', (err) => reject(err)).connect(authProps);
          });
        }

        // 2. uTorrent Remove (action=removedata handles both torrent and data)
        if (UTORRENT_URL && item.torrentHash) {
          try {
            const authHeader = `Basic ${Buffer.from(`${UTORRENT_USER}:${UTORRENT_PASS}`).toString('base64')}`;
            const tokenResponse = await axios.get(`${UTORRENT_URL}token.html`, { headers: { Authorization: authHeader } });
            const tokenMatch = tokenResponse.data.match(/<div id='token'[^>]*>([^<]+)<\/div>/);
            const token = tokenMatch ? tokenMatch[1] : null;

            if (token) {
              await axios.get(`${UTORRENT_URL}`, {
                params: { token, action: 'removedata', hash: item.torrentHash },
                headers: { Authorization: authHeader, Cookie: tokenResponse.headers['set-cookie']?.join('; ') }
              });
              utorrentSuccess = true;
            }
          } catch (e) {
            console.error("uTorrent cleanup failed", e);
          }
        }

        // 3. Radarr Unmonitor
        if (RADARR_URL && RADARR_API_KEY && item.radarrId) {
          try {
            // First get the latest movie object
            const movieRes = await axios.get(`${RADARR_URL}/api/v3/movie/${item.radarrId}`, {
              params: { apiKey: RADARR_API_KEY }
            });
            const movieData = movieRes.data;
            
            // Update monitored status
            movieData.monitored = false;
            
            await axios.put(`${RADARR_URL}/api/v3/movie/${item.radarrId}`, movieData, {
              params: { apiKey: RADARR_API_KEY }
            });
            radarrSuccess = true;
          } catch (e) {
            console.error("Radarr unmonitor failed", e);
          }
        }

        results.push({ item, sshSuccess, utorrentSuccess, radarrSuccess });
      }

      res.json({ results });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
