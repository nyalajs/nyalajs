# Deployment Guide

This guide covers deploying the Nyala documentation website to Vercel.

## Prerequisites

- GitHub account with access to `nyalajs/nyalajs` repository
- Vercel account (sign up at [vercel.com](https://vercel.com) - free for open source)

## Deploy to Vercel (Recommended)

### Method 1: Vercel Dashboard (Easiest)

1. **Go to Vercel**
   - Visit [vercel.com](https://vercel.com)
   - Sign in with your GitHub account

2. **Import Project**
   - Click "Add New..." → "Project"
   - Select "Import Git Repository"
   - Choose `nyalajs/nyalajs` from your repositories
   - Click "Import"

3. **Configure Project**
   - **Project Name**: `nyala-docs` (or your preferred name)
   - **Framework Preset**: Other
   - **Root Directory**: `website`
   - **Build Command**: `npm run docs:build`
   - **Output Directory**: `docs/.vitepress/dist`
   - **Install Command**: `npm install`
   - **Node.js Version**: 18.x (default is fine)

4. **Deploy**
   - Click "Deploy"
   - Wait 2-3 minutes for the build to complete
   - Your site will be live at `https://nyala-docs.vercel.app`

5. **Set Up Custom Domain (Optional)**
   - After deployment, go to Project Settings → Domains
   - Add your custom domain (e.g., `docs.nyalajs.com`)
   - Follow DNS configuration instructions
   - Vercel will automatically provision SSL certificate

### Method 2: Vercel CLI

```bash
# Install Vercel CLI globally
npm install -g vercel

# Login to Vercel
vercel login

# From the repository root, deploy
vercel --cwd website

# For production deployment
vercel --prod --cwd website

# Follow the prompts:
# - Link to existing project? No
# - What's the name of your project? nyala-docs
# - In which directory is your code? ./
# - Override build settings? No
```

### Automatic Deployments

Once set up, Vercel will automatically:
- Deploy every push to `main` branch → Production
- Deploy pull requests → Preview deployments
- Show deployment status in GitHub

## Environment Variables (If Needed)

If you need to add environment variables:

1. Go to Project Settings → Environment Variables
2. Add variables for Production/Preview/Development
3. Common variables:
   - `NODE_VERSION`: 18.x
   - `NPM_VERSION`: 9.x (optional)

## Deployment Status

After deployment, you can:
- View deployment logs in Vercel dashboard
- Check build output and errors
- See performance metrics
- Configure custom domains
- Set up deployment hooks

## Custom Domain Setup

### Option 1: Vercel DNS (Easiest)

1. In Vercel Dashboard → Project Settings → Domains
2. Add domain: `docs.nyalajs.com`
3. Choose "Use Vercel Nameservers"
4. Update your domain registrar's nameservers to:
   - `ns1.vercel-dns.com`
   - `ns2.vercel-dns.com`

### Option 2: Custom DNS

1. Add domain in Vercel: `docs.nyalajs.com`
2. Add DNS records at your domain registrar:
   ```
   Type: CNAME
   Name: docs
   Value: cname.vercel-dns.com
   ```

3. Vercel will automatically provision SSL certificate

## Troubleshooting

### Build Fails

Check the build logs in Vercel dashboard. Common issues:
- Missing dependencies: Ensure `package.json` is correct
- Wrong Node version: Set to 18.x in project settings
- Build command errors: Verify commands work locally first

### Test Build Locally

```bash
cd website
npm install
npm run docs:build
npm run docs:preview
```

### Preview Build Output

The built site is in `website/docs/.vitepress/dist/`

### Update Deployment

Just push to GitHub - Vercel will automatically rebuild and deploy.

## Monitoring

Vercel provides:
- Real-time deployment logs
- Performance analytics
- Bandwidth usage
- Visitor analytics (premium)

## Support

- [Vercel Documentation](https://vercel.com/docs)
- [VitePress Documentation](https://vitepress.dev)
- [GitHub Issues](https://github.com/nyalajs/nyalajs/issues)

---

**Quick Commands:**

```bash
# Deploy to preview
vercel --cwd website

# Deploy to production
vercel --prod --cwd website

# Check deployment
vercel ls

# View logs
vercel logs
```

**Your documentation will be live at:**
- Vercel URL: `https://nyala-docs.vercel.app`
- Custom domain (after setup): `https://docs.nyalajs.com`
