# 🚀 Hugo Sync Modal for Obsidian

A high-performance, frontmatter-aware Obsidian desktop plugin designed to seamlessly publish and sync your markdown notes and assets to any Hugo static site hosted on GitHub (Cloudflare Pages, Vercel, Netlify, GitHub Pages).

---

## ✨ Features

- **⚡ Lightweight Git Blob SHA Diffing**: Computes Git blob hashes locally (`git hash-object` equivalent) using Web Crypto SHA-1. Accurately determines which notes are modified or new without downloading or cloning the remote repository.
- **📂 Interactive 4-Category Publication Center**:
  - 🟡 **Changed**: Notes modified locally since the last sync.
  - 🟢 **New / Unsynced**: Notes created locally that don't exist on GitHub yet.
  - ⚪ **Synced**: Notes that are 100% identical and up to date.
  - 🔴 **Deleted**: Notes removed from your vault that still exist in your Hugo repository.
- **🌳 Atomic Git Tree Commits**: Batches all note creations, modifications, image uploads, and deletions into a **single atomic Git commit** using GitHub's Git Data Trees API. Triggers only **one CI/CD build** per sync session!
- **🛡️ Frontmatter & Syntax Fidelity**: Preserves YAML/TOML frontmatter verbatim. Automatically normalizes Windows CRLF to LF to prevent false line-ending diffs.
- **🧜‍♂️ Mermaid & Code Protection**: Protects fenced code blocks and Mermaid comments (`%%...%%`) during publishing.
- **🗺️ Bi-directional Index Mapping**: Intelligently maps vault root `index.md` $\longleftrightarrow$ Hugo's `content/_index.md`.
- **🖼️ Asset Syncing**: Automatically tracks and uploads referenced images into your Hugo site's `static/` folder.

---

## 📥 Installation

### Method 1: Via Obsidian BRAT (Recommended)
1. Install the **BRAT** plugin from Obsidian Community Plugins.
2. In Obsidian Settings, go to **BRAT** $\rightarrow$ **Add Beta plugin**.
3. Enter repository URL:
   ```text
   https://github.com/rubanbalaji-g/obsidian-hugo-sync-modal
   ```
4. Click **Add Plugin** and enable **Hugo Sync Modal**.

### Method 2: Manual Installation
1. Go to the [Releases](https://github.com/rubanbalaji-g/obsidian-hugo-sync-modal/releases) page (or download from the repository root).
2. Download `main.js`, `manifest.json`, and `styles.css`.
3. In your Obsidian vault, navigate to:
   ```text
   <VaultFolder>/.obsidian/plugins/obsidian-hugo-sync-modal/
   ```
4. Place `main.js`, `manifest.json`, and `styles.css` into that folder.
5. In Obsidian, go to **Settings** $\rightarrow$ **Community plugins** and toggle **Hugo Sync Modal** on.

---

## ⚙️ Configuration

1. In Obsidian, open **Settings** $\rightarrow$ **Hugo Sync Modal**.
2. Configure the following fields:
   - **GitHub Personal Access Token**: A GitHub token (classic token with `repo` scope or fine-grained token with *Contents: Read & Write*).
   - **GitHub Username / Organization**: e.g., `rubanbalaji-g`.
   - **GitHub Repository**: e.g., `my-hugo-site`.
   - **Branch**: Usually `main`.
   - **Content Folder**: Target folder in your Hugo repository (default: `content`).
   - **Image Folder**: Target folder for images (default: `static/images`).
   - **Publish Filter**:
     - *All Notes*: Publishes all markdown notes in your vault.
     - *Frontmatter Only*: Only publishes notes with `publish: true` in their frontmatter.

---

## 📖 How to Use

1. Click the **cloud upload icon** (`upload-cloud`) on Obsidian's left ribbon, or press `Ctrl + P` / `Cmd + P` and search for **"Hugo Sync: Open Publication Center"**.
2. The modal scans your local vault and queries GitHub's remote tree in seconds.
3. Review the categorized summary (Changed, New, Synced, Deleted).
4. Click **Publish to GitHub**.
5. Your notes are compiled, bundled into a single Git commit, and pushed to your repository immediately!

---

## 🛠️ Development

Want to contribute or customize the plugin for your own setup?

```bash
# Clone repository
git clone https://github.com/rubanbalaji-g/obsidian-hugo-sync-modal.git
cd obsidian-hugo-sync-modal

# Install dependencies
npm install

# Watch mode for local development
npm run dev

# Production build
npm run build
```

---

## 📄 License

MIT License © [Dr. Rubanbalaji](https://github.com/rubanbalaji-g)