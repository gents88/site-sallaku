## Google Search Console — Quick steps

1. Add and verify your site (https://gentsallaku.it) in Google Search Console.
   - Prefer verifying the `https://gentsallaku.it/` property.
   - Use the `HTML tag` verification: copy the meta tag and paste into `index.html` <head> (replace PASTE_GOOGLE_SEARCH_CONSOLE_TOKEN_HERE).

2. Submit sitemap
   - In Search Console, go to "Sitemaps" and submit: `https://gentsallaku.it/sitemap.xml`.

3. Check coverage & URL inspection
   - Use URL Inspection to request indexing for `/` and `/en/` and `/sq/` after publishing.

4. Social preview
   - Use the Rich Results test and the Social Preview tool to validate `og:image` and structured data.

5. Notes
   - Keep `robots.txt` Allow: / and correct `Sitemap:` URL.
   - Protect admin pages (e.g., /stats.html) with auth and exclude from sitemap if private.
