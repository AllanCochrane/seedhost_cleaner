# Media Sync & Cleanup Workflow

This document describes how the **Media Library Janitor** orchestrates the cleanup between your remote services.

## The Architecture
The app acts as a secondary "Brain" that sits between your management tools (Radarr), your downloader (uTorrent), and your presentation layer (Plex).

```text
[ Remote Seedbox / Server ]          [ Local / Remote Plex ]
       |                                     |
       |---(A) uTorrent Download Directory   |
       |---(B) Hardlink/Rsync Directory ----(C)---> Plex Library
       |                                     |
[ This App (Janitor) ]                       |
       |                                     |
       |---(1) Query Plex -------------------|
       |---(2) Query Radarr -----------------|
       |---(3) Query uTorrent ---------------|
       |                                     |
       |---(4) IF (Media in Plex == TRUE)  --|
       |       AND (Media in uT == TRUE)     |
       |       THEN:                         |
       |         a. SSH RM (B)               |
       |         b. uTorrent DELETE (A)      |
```

## Step-by-Step Logic

### 1. Data Ingestion (State Discovery)
On load or refresh, the application backend communicates with your remote APIs:
*   **Plex**: Fetches the list of movies currently verified and indexed in your library.
*   **Radarr**: Fetches your movie database to cross-reference years and titles (helping resolve ambiguity).
*   **uTorrent**: Fetches the active torrent list, specifically looking for `hash`, `current_directory`, and `name`.

### 2. Normalization & Matching
The app runs a matching algorithm (`src/App.tsx` -> `matches` memo):
*   It strips special characters and spaces from titles to ensure `Spider-Man` matches `Spider.Man`.
*   It creates a "Sync Match" object only if the media is found in both the management layer and the downloader.

### 3. Verification
A media item is marked as **"Ready to Purge"** only if:
1.  **Plex** confirms the file is part of the library (meaning the Rsync/Sync job has successfully finished).
2.  **uTorrent** confirms the original torrent file data still exists on disk.

### 4. Cleanup Execution (`/api/cleanup`)
When you trigger a cleanup, the Express backend performs a serial execution to ensure no orphaned files remain:

1.  **Remote SSH Cleanup**:
    *   Connects to your remote server via SSH.
    *   Executes `rm -rf "/path/to/remote/hardlink/file"` to clean up the directory that feeds your Rsync job. This saves space on the remote disk immediately.
2.  **uTorrent Data Purge**:
    *   Authenticates with the uTorrent Web API.
    *   Issues the `removedata` action. This command tells uTorrent to stop seeding, remove the entry from the UI, and delete the actual downloaded files from the uTorrent download directory.
3.  **Radarr Lifecycle Management**:
    *   Authenticates with the Radarr API.
    *   Fetches the movie object and sets `monitored: false`. This ensures Radarr marks the item as satisfied and does not attempt to search for or download a new copy of the media in the future.

## Safety Measures
*   **Terminal State Check**: The app only suggests cleanup for items it can verify are currently in your Plex database.
*   **Dry Run Visibility**: The UI clearly highlights which items have a "Verified" Plex status before allowing any delete actions.
*   **Prevent Re-Download**: By unmonitoring in Radarr, we close the loop so your automation doesn't replace the files we just deleted.
