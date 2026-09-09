// Expo's Metro-based web exporter (this app doesn't use expo-router, so its
// "Custom Root HTML" mechanism doesn't apply) generates dist/index.html from a
// built-in template with no supported override hook - verified directly by dropping
// a apps/desktop/web/index.html template and rebuilding: it was silently ignored.
// So instead of fighting the exporter, this runs AFTER "expo export --platform web"
// and patches the real output in place, adding what a static template would have:
// a real description, canonical link, Open Graph/Twitter tags so shared links show a
// proper preview instead of nothing, and an iOS Smart App Banner pointing at the
// App Store listing.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexPath = resolve(__dirname, "../dist/index.html");

const SITE_URL = "https://tribaliliga.com";
const TITLE = "Tribali Liga";
const DESCRIPTION =
  "Fantasy liga amaterskog fudbala - prati svoj tim, live utakmice, tabele i vesti gradskih liga na jednom mestu.";

let html = readFileSync(indexPath, "utf8");

html = html.replace('<html lang="en">', '<html lang="sr">');
// app.json's expo.name ("Tribali Liga Desktop") is an internal build label, not
// something a visitor or a search result should ever see.
html = html.replace(/<title>.*?<\/title>/, `<title>${TITLE}</title>`);

// Apple's own Smart App Banner - Safari on iOS/iPadOS shows a dismissible "Open in
// App" strip at the top of the page linking straight to this App Store listing. Site
// keeps working normally underneath for anyone who ignores or dismisses it.
const APPLE_APP_ID = "6808205474";

const metaTags = `
    <meta name="apple-itunes-app" content="app-id=${APPLE_APP_ID}" />
    <meta name="description" content="${DESCRIPTION}" />
    <link rel="canonical" href="${SITE_URL}/" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${TITLE}" />
    <meta property="og:title" content="${TITLE}" />
    <meta property="og:description" content="${DESCRIPTION}" />
    <meta property="og:url" content="${SITE_URL}/" />
    <meta property="og:image" content="${SITE_URL}/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="sr_RS" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${TITLE}" />
    <meta name="twitter:description" content="${DESCRIPTION}" />
    <meta name="twitter:image" content="${SITE_URL}/og-image.png" />
`;

html = html.replace("</title>", "</title>" + metaTags);

writeFileSync(indexPath, html);
console.log("inject-seo: patched dist/index.html with description + Open Graph/Twitter tags + iOS Smart App Banner");
