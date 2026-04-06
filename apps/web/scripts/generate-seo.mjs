import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const publicDir = path.join(appRoot, 'public');

const ENV_FILES = [
  path.join(appRoot, '.env.production.local'),
  path.join(appRoot, '.env.production'),
  path.join(appRoot, '.env.local'),
  path.join(appRoot, '.env'),
  path.join(appRoot, '..', '..', '.env.production.local'),
  path.join(appRoot, '..', '..', '.env.production'),
  path.join(appRoot, '..', '..', '.env.local'),
  path.join(appRoot, '..', '..', '.env'),
];

const ROUTES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/templates', changefreq: 'weekly', priority: '0.9' },
  { path: '/blog', changefreq: 'weekly', priority: '0.9' },
  { path: '/pricing', changefreq: 'weekly', priority: '0.85' },
  { path: '/changelog', changefreq: 'weekly', priority: '0.8' },
  { path: '/contact', changefreq: 'monthly', priority: '0.7' },
];

function getDynamicRoutes() {
  const allRoutes = [...ROUTES];
  try {
    const blogPostsFile = path.join(appRoot, 'src', 'content', 'blogPosts.ts');
    const blogPostsContent = fs.readFileSync(blogPostsFile, 'utf8');
    const slugRegex = /slug:\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = slugRegex.exec(blogPostsContent)) !== null) {
      const slug = match[1];
      const blogPath = `/blog/${slug}`;
      if (!allRoutes.find(r => r.path === blogPath)) {
        allRoutes.push({ path: blogPath, changefreq: 'monthly', priority: '0.8' });
      }
    }
  } catch (e) {
    console.error('[generate-seo] Error reading blog posts for sitemap', e);
  }
  return allRoutes;
}

function readEnvValue(key) {
  for (const filePath of ENV_FILES) {
    if (!fs.existsSync(filePath)) continue;
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const name = trimmed.slice(0, eqIndex).trim();
      if (name !== key) continue;
      return trimmed.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return '';
}

function normalizeSiteUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return 'https://eazyui.vercel.app';
  return trimmed.replace(/\/+$/, '');
}

function resolveSiteUrl() {
  const envSiteUrl = process.env.VITE_SITE_URL || readEnvValue('VITE_SITE_URL');
  const frontendUrl = process.env.FRONTEND_URL || readEnvValue('FRONTEND_URL');
  const vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || '';
  const vercelPreviewUrl = process.env.VERCEL_URL || '';

  if (envSiteUrl) return normalizeSiteUrl(envSiteUrl);
  if (frontendUrl) return normalizeSiteUrl(frontendUrl);
  if (vercelProductionUrl) return normalizeSiteUrl(`https://${vercelProductionUrl}`);
  if (vercelPreviewUrl) return normalizeSiteUrl(`https://${vercelPreviewUrl}`);
  return normalizeSiteUrl('');
}

function buildSitemapXml(siteUrl) {
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = getDynamicRoutes().map(({ path: routePath, changefreq, priority }) => {
    const url = `${siteUrl}${routePath === '/' ? '' : routePath}`;
    return [
      '  <url>',
      `    <loc>${url}</loc>`,
      `    <lastmod>${lastmod}</lastmod>`,
      `    <changefreq>${changefreq}</changefreq>`,
      `    <priority>${priority}</priority>`,
      '  </url>',
    ].join('\n');
  }).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
    '',
  ].join('\n');
}

function buildRobotsTxt(siteUrl) {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /app',
    'Disallow: /auth',
    'Disallow: /workspace',
    '',
    `Sitemap: ${siteUrl}/sitemap.xml`,
    '',
  ].join('\n');
}

const siteUrl = resolveSiteUrl();

fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), buildSitemapXml(siteUrl), 'utf8');
fs.writeFileSync(path.join(publicDir, 'robots.txt'), buildRobotsTxt(siteUrl), 'utf8');

console.log(`[generate-seo] Generated sitemap.xml and robots.txt for ${siteUrl}`);
