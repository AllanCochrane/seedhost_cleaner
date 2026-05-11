# Media Library Janitor

A specialized orchestration tool designed to clean up remote storage and downloader queues once media has been successfully verified and ingested into your Plex library.

## Configuration Guide

The application requires several environment variables to be set in your `.env` file (see `.env.example` for the template).

### 1. Plex
*   **`PLEX_URL`**: The local or remote URL of your Plex server (e.g., `http://192.168.1.100:32400`).
*   **`PLEX_TOKEN`**: Your Plex Authentication Token. 
    *   *Where to find:* Sign in to Plex Web, go to any media item, click "..." -> "Get Info" -> "View XML". The token is at the end of the URL as `X-Plex-Token=...`.

### 2. Radarr
*   **`RADARR_URL`**: The URL of your Radarr service (e.g., `http://localhost:7878`).
*   **`RADARR_API_KEY`**: Your Radarr API Key.
    *   *Where to find:* Settings -> General -> API Key.

### 3. uTorrent (Web UI)
*   **`UTORRENT_URL`**: The Web UI endpoint. Important: Must end with `/gui/` (e.g., `http://192.168.1.50:8080/gui/`).
*   **`UTORRENT_USER`**: Your Web UI username.
*   **`UTORRENT_PASS`**: Your Web UI password.
    *   *Where to find/set:* Options -> Preferences -> Remote (or Web UI) in the uTorrent client.

### 4. Remote SSH Server
Used to delete the hardlinks/files on the remote seedbox or staging server.
*   **`SSH_HOST`**: IP or hostname.
*   **`SSH_USER`**: SSH username.
*   **`SSH_PASS`**: SSH password (optional if using key).
*   **`SSH_KEY`**: (Optional) The content of your private SSH key if using key-based auth.

---

## Installation

1.  **Clone or Download** the project to your local machine.
2.  **Install Dependencies**:
    ```bash
    npm install
    ```
3.  **Setup Environment**:
    Copy `.env.example` to `.env` and fill in your credentials:
    ```bash
    cp .env.example .env
    ```

## Running the Application

### Development Mode
Runs the backend Express server with Vite middleware for a live preview:
```bash
npm run dev
```
The app will be accessible at `http://localhost:3000`.

### Production Build
1.  **Build the Frontend**:
    ```bash
    npm run build
    ```
2.  **Start the Server**:
    ```bash
    NODE_ENV=production npm start
    ```

---

## Workflow Implementation
1.  **Libraries Scan**: The app fetches your entire library from Plex and cross-references it with Radarr's database.
2.  **Downloader Match**: It identifies which torrents in uTorrent match the movies already verified in Plex.
3.  **Space Recovery**: When you click "Clean" or "Purge All", the app:
    *   Connects via SSH to the remote server to `rm -rf` the file.
    *   Commands uTorrent to "Remove and Delete Data" (effectively cleaning the `.torrent` and the local download).
    *   Updates Radarr to unmonitor the movie so it isn't downloaded again.
