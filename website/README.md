# Nyala Documentation Website

Enterprise-grade documentation site built with VitePress.

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run docs:dev

# Visit http://localhost:5173
```

## Building

```bash
# Build for production
npm run docs:build

# Preview production build
npm run docs:preview
```

## Project Structure

```
website/
├── docs/
│   ├── .vitepress/
│   │   └── config.ts          # VitePress configuration
│   ├── index.md               # Homepage
│   ├── introduction.md        # Introduction
│   ├── installation.md        # Installation guide
│   ├── getting-started.md     # Tutorial
│   ├── quick-start.md         # Quick start
│   ├── configuration.md       # Configuration
│   ├── concepts/              # Core concepts
│   ├── building-blocks/       # Framework components
│   ├── features/              # Framework features
│   ├── multi-tenancy/         # Multi-tenancy guide
│   └── ...                    # Other sections
├── package.json
└── README.md
```

## Deployment

### Vercel (Recommended)

**Option 1: Vercel Dashboard**
1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "Add New Project"
3. Import `nyalajs/nyalajs` from GitHub
4. Configure project:
   - **Root Directory**: `website`
   - **Build Command**: `npm run docs:build`
   - **Output Directory**: `docs/.vitepress/dist`
   - **Install Command**: `npm install`
5. Click "Deploy"

**Option 2: Vercel CLI**
```bash
# Install Vercel CLI
npm i -g vercel

# From repository root
vercel --cwd website

# For production
vercel --prod --cwd website
```

The project is pre-configured with `vercel.json` in the root directory.

### Netlify

```bash
# Build command
npm run docs:build

# Publish directory
docs/.vitepress/dist
```

### GitHub Pages

Add to `.github/workflows/deploy-docs.yml`:

```yaml
name: Deploy Documentation

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install dependencies
        run: cd website && npm install

      - name: Build
        run: cd website && npm run docs:build

      - name: Deploy
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: website/docs/.vitepress/dist
```

## Features

- ✅ Professional design
- ✅ Responsive layout
- ✅ Search functionality
- ✅ Syntax highlighting
- ✅ Dark mode support
- ✅ Mobile-friendly
- ✅ Fast performance
- ✅ SEO optimized

## Documentation Statistics

- **Total Pages**: 24 (40% complete)
- **Sections**: 10
- **Code Examples**: 300+
- **Words**: 50,000+

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

## License

MIT © Nyala Framework Team
