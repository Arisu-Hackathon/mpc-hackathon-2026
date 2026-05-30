# SecondRead

SecondRead is a Chrome extension that adds cautious credibility context while someone reads a news article.

## Structure

```text
extension/
  manifest.json
  background.js
  content.js
  sidepanel.html
  sidepanel.css
  sidepanel.js
  Readability.js
  icons/

server/
  server.js
  routes/
    analyze.js
  lib/
    mockAnalysis.js
  package.json
  package-lock.json
```

## Load The Extension

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Click Load unpacked.
4. Select the `extension/` folder.
5. Open a news article, refresh it, then click the SecondRead icon.

After extension code changes, reload the extension in `chrome://extensions` and refresh the article tab.

## Run The Backend

```bash
cd server
npm install
npm run dev
```

The backend runs at `http://localhost:3000`.

The extension sends article data to:

```text
POST http://localhost:3000/api/analyze
```
