# Nyala Documentation Deployment Guide

## Quick Deploy

### Vercel (Recommended)

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
cd website
vercel
```

3. Follow prompts and your site will be live!

### Netlify

1. Build the site:
```bash
cd website
npm install
npm run docs:build
```

2. Deploy `docs/.vitepress/dist` folder to Netlify

Or use Netlify CLI:
```bash
npm i -g netlify-cli
netlify deploy --prod --dir=docs/.vitepress/dist
```

## Automated Deployment

### GitHub Actions (Recommended)

Create `.github/workflows/deploy-docs.yml`:

```yaml
name: Deploy Documentation

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: npm
          cache-dependency-path: website/package-lock.json

      - name: Install dependencies
        run: cd website && npm ci

      - name: Build documentation
        run: cd website && npm run docs:build

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: website/docs/.vitepress/dist

  deploy:
    environment:
fy.toml` in website folder:

```toml
[build]
  base = "website"
  command = "npm run docs:build"
  publish = "docs/.vitepress/dist"

[build.environment]
  NODE_VERSION = "18"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

## Custom Domain

### Vercel

1. Go to project settings
2. Add custom domain
3. Update DNS records as shown

### Netlify

1. Go to Domain settings
2. Add custom domain
3. Configure DNS:
```
A Record: @ → 75.2.60.5
CNAME: www → your-site.netlify.app
```

### GitHub Pages

1. Go to Settings → Pages
2. Add custom domain
3. Create CNAME record:
```
CNAME: docs → yourusername.github.io
```

## Environment Variables

If needed, add to deployment platform:

```env
NODE_ENV=production
BASE_URL=https://docs.nyalajs.com
```

## Build Optimization

### Speed Up Builds

```json
{
  "scripts": {
    "docs:build": "vitepress build docs --minify"
  }
}
```

### Cache Dependencies

GitHub Actions caching:
```yaml
- uses: actions/cache@v3
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
```

## Performance

### CDN Configuration

Recommended headers:
```
Cache-Control: public, max-age=31536000, immutable  # For assets
Cache-Control: public, max-age=0, must-revalidate   # For HTML
```

### Compression

Enable gzip/brotli compression:

Vercel: Automatic
Netlify: Automatic
Custom: Use nginx/cloudflare

## Monitoring

### Analytics

Add to `website/docs/.vitepress/config.ts`:

```typescript
export default defineConfig({
  head: [
    ['script', {
      async: true,
      src: 'https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID'
    }],
    ['script', {}, `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'GA_MEASUREMENT_ID');
    `]
  ]
})
```

### Uptime Monitoring

Use services like:
- UptimeRobot (free)
- Pingdom
- StatusCake

## Troubleshooting

### Build Fails

1. Clear cache:
```bash
rm -rf node_modules package-lock.json
npm install
```

2. Check Node version:
```bash
node --version  # Should be 18+
```

### 404 on Routes

Add redirect rules:

**Vercel** - Create `vercel.json`:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**Netlify** - Already handled in `netlify.toml`

### Slow Build

1. Enable caching
2. Use shallow git clone
3. Optimize images
4. Minimize dependencies

## Security

### HTTPS

All platforms provide free SSL:
- Vercel: Automatic
- Netlify: Automatic
- GitHub Pages: Enable in settings

### Security Headers

Add to deployment config:

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=()
```

## Rollback

### Vercel

```bash
vercel rollback
```

Or use dashboard to select previous deployment.

### Netlify

Use dashboard to restore previous deploy.

### GitHub Pages

Revert the commit that triggered the deploy.

## Costs

All options have free tiers:

| Platform | Free Tier | Bandwidth | Build Minutes |
|----------|-----------|-----------|---------------|
| Vercel | ✅ | 100GB/month | 6000 min/month |
| Netlify | ✅ | 100GB/month | 300 min/month |
| GitHub Pages | ✅ | 100GB/month | Unlimited |

## Best Practices

1. **Use CDN**: All platforms provide this
2. **Enable Compression**: gzip/brotli
3. **Optimize Images**: Use WebP format
4. **Cache Assets**: Long cache times for static files
5. **Monitor Performance**: Use Lighthouse
6. **Set Up Alerts**: For downtime
7. **Use HTTPS**: Always
8. **Backup**: Keep deployment configs in git

## Support

- **VitePress**: https://vitepress.dev
- **Vercel**: https://vercel.com/docs
- **Netlify**: https://docs.netlify.com
- **GitHub Pages**: https://docs.github.com/pages

## Next Steps

1. Choose deployment platform
2. Set up automated deployments
3. Configure custom domain
4. Add analytics
5. Set up monitoring
6. Test on mobile devices
7. Check search functionality
8. Monitor performance

---

**Ready to Deploy**: The documentation is production-ready and can be deployed immediately to any platform!
