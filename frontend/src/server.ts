import { AngularNodeAppEngine, createNodeRequestHandler, isMainModule, writeResponseToNodeResponse } from '@angular/ssr/node';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const SITE_URL = 'https://gentsallaku.it';
const BACKEND_URL =
  process.env['BACKEND_URL'] ?? 'http://localhost:3001';
const API_URL = `${BACKEND_URL}/api/v1`;

export function app(): ReturnType<typeof express> {
  const server = express();
  const serverDistFolder = dirname(fileURLToPath(import.meta.url));
  const browserDistFolder = resolve(serverDistFolder, '../browser');
  const angularApp = new AngularNodeAppEngine();

  // ── Security headers ─────────────────────────────────────────────────────────
  server.use((_req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    );
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' https://www.googletagmanager.com https://www.google-analytics.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
        "img-src 'self' data: https:",
        "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
        "connect-src 'self' https: wss:",
        "object-src 'none'",
        "frame-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "upgrade-insecure-requests",
      ].join('; '),
    );
    next();
  });

  // ── Dynamic sitemap.xml ───────────────────────────────────────────────────────
  server.get('/sitemap.xml', async (_req, res) => {
    interface PostEntry {
      slug: string;
      updatedAt?: string;
      publishedAt?: string;
    }
    let posts: PostEntry[] = [];
    try {
      const r = await fetch(`${API_URL}/blog?published=true`);
      if (r.ok) posts = (await r.json()) as PostEntry[];
    } catch {
      /* fallback to empty list */
    }

    const today = new Date().toISOString().split('T')[0];
    const staticUrls = [
      { loc: `${SITE_URL}/`, changefreq: 'weekly', priority: '1.0', lastmod: today },
      { loc: `${SITE_URL}/blog`, changefreq: 'daily', priority: '0.9', lastmod: today },
      { loc: `${SITE_URL}/projects`, changefreq: 'monthly', priority: '0.8', lastmod: today },
      { loc: `${SITE_URL}/services`, changefreq: 'monthly', priority: '0.8', lastmod: today },
      { loc: `${SITE_URL}/contact`, changefreq: 'yearly', priority: '0.5', lastmod: today },
    ];
    const blogUrls = posts
      .filter(p => p.slug)
      .map(p => ({
        loc: `${SITE_URL}/blog/${p.slug}`,
        changefreq: 'weekly',
        priority: '0.7',
        lastmod: (p.updatedAt ?? p.publishedAt ?? today).split('T')[0],
      }));

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...[...staticUrls, ...blogUrls].map(
        u =>
          `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
      ),
      '</urlset>',
    ].join('\n');

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  });

  // ── API proxy → backend ──────────────────────────────────────────────────────
  server.use(
    '/api',
    createProxyMiddleware({
      target: BACKEND_URL,
      changeOrigin: true,
    }),
  );

  // ── Static assets (hashed filenames → 1-year cache) ──────────────────────────
  server.use(
    express.static(browserDistFolder, {
      maxAge: '1y',
      index: false,
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else if (filePath.includes('/i18n/')) {
          res.setHeader('Cache-Control', 'public, max-age=600, must-revalidate');
        }
      },
    }),
  );

  // ── Skip SSR for admin routes (auth-protected, not indexed) ──────────────────
  server.use('/dashboard', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(join(browserDistFolder, 'index.html'));
  });

  // ── Angular SSR for all public routes ────────────────────────────────────────
  server.use('/**', (req, res, next) => {
    angularApp
      .handle(req)
      .then(response => {
        if (response) {
          writeResponseToNodeResponse(response, res);
        } else {
          next();
        }
      })
      .catch(next);
  });

  return server;
}

if (isMainModule(import.meta.url)) {
  const port = process.env['PORT'] ?? 4000;
  app().listen(port, () =>
    console.log(`Angular SSR server listening on http://localhost:${port}`),
  );
}

export const reqHandler = createNodeRequestHandler(app);
