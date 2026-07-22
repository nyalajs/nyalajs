# Nyala Release Guide

## Quick Release (Automated)

```bash
# Run the release script
./scripts/release.sh
```

This will:
1. ✅ Check git status
2. ✅ Run linting
3. ✅ Build all packages
4. ✅ Run tests
5. ✅ Apply changesets
6. ✅ Publish to npm
7. ✅ Push tags

## Manual Release (Step by Step)

### 1. Pre-Release Checks

```bash
# Ensure you're on main branch
git checkout main
git pull origin main

# Check for uncommitted changes
git status

# Install dependencies
npm install

# Build everything
npm run build

# Run tests
npm test

# Run linting
npm run lint
```

### 2. Create Changeset

```bash
# Add a changeset
npx changeset add
```

Answer the prompts:
- Select packages that changed (use space to select)
- Choose version bump type (major, minor, patch)
- Write summary of changes

### 3. Version Packages

```bash
# This updates package.json versions and creates CHANGELOGs
npx changeset version

# Review changes
git diff

# Commit version changes
git add .
git commit -m "chore: version packages for release"
```

### 4. Final Build & Test

```bash
# Build with new versions
npm run build

# Test generated projects
nyala new test-mvc --template=mvc
cd test-mvc
npm install
npm run build
npm run dev
# Verify it works, then cleanup
cd .. && rm -rf test-mvc

# Same for saas
nyala new test-saas --template=saas
cd test-saas
npm install
npm run build
npm run dev
cd .. && rm -rf test-saas
```

### 5. Publish to NPM

```bash
# Make sure you're logged in
npm whoami

# If not, login
npm login

# Publish all packages
npx changeset publish

# This will:
# - Build packages
# - Publish to npm
# - Create git tags
```

### 6. Push to GitHub

```bash
# Push commits and tags
git push origin main --follow-tags
```

### 7. Create GitHub Release

Go to GitHub:
1. Navigate to repository
2. Click "Releases" → "Draft a new release"
3. Select the newly created tag (e.g., v1.0.0)
4. Title: "v1.0.0 - Production Release"
5. Copy content from CHANGELOG.md
6. Add additional notes:

```markdown
# Nyala v1.0.0 - Production Release 🚀

First production-ready release with complete starter templates!

## 🎉 Highlights

- **MVC Starter Template** - Production-ready with auth & CRUD
- **SaaS Starter Template** - Multi-tenant with data isolation
- **Enhanced CLI** - Easy project creation with templates
- **2,800+ lines** of documentation

## 📦 Installation

```bash
npm install -g @nyalajs/cli
nyala new my-app
```

## 🚀 Templates

Choose from:
- `mvc` - Full MVC architecture (recommended)
- `saas` - Multi-tenant SaaS
- `basic` - Minimal setup

## 📚 Documentation

- [Getting Started](./docs/getting-started.md)
- [MVC Architecture](./templates/mvc-starter/docs/ARCHITECTURE.md)
- [Multi-Tenancy](./templates/saas-starter/docs/MULTI_TENANCY.md)
- [Quick Reference](./QUICK_REFERENCE.md)

## 🐛 Bug Fixes

See [CHANGELOG.md](./CHANGELOG.md) for full details.

## 💥 Breaking Changes

CLI now defaults to `mvc` template. Use `--template=basic` for minimal setup.

## 🙏 Thanks

Thanks to all contributors who made this release possible!
```

### 8. Announce Release

#### Social Media

**Twitter/X:**
```
🚀 Nyala v1.0.0 is here!

Production-ready TypeScript framework with:
✅ MVC & SaaS starter templates
✅ Multi-tenancy support
✅ Complete auth system
✅ 2,800+ lines of docs

Get started: npm i -g @nyalajs/cli

#nodejs #typescript #webdev
```

**LinkedIn:**
```
Excited to announce Nyala v1.0.0! 🎉

After months of development, we're launching production-ready starter templates:

🔹 MVC Starter - Clean architecture with authentication
🔹 SaaS Starter - Multi-tenant with data isolation
🔹 Enhanced CLI - One command to start

Perfect for building modern TypeScript applications.

Try it: npm install -g @nyalajs/cli

#typescript #nodejs #webdevelopment #opensource
```

**Dev.to Article:**

Title: "Introducing Nyala: Laravel-Style Framework for TypeScript"

```markdown
# Introducing Nyala v1.0.0

Nyala is a production-ready TypeScript framework inspired by Laravel...

[Full article with examples, screenshots, code samples]
```

#### Community Channels

- Post in relevant Discord servers
- Share on Reddit (r/node, r/typescript, r/webdev)
- Post on Hacker News
- Share in relevant Slack communities

### 9. Verify Release

```bash
# Install globally
npm install -g @nyalajs/cli

# Check version
nyala --version

# Test creating projects
mkdir test-release
cd test-release

# Test MVC
nyala new test-mvc --template=mvc
cd test-mvc
npm install
npm run dev
# Verify works
cd ..

# Test SaaS
nyala new test-saas --template=saas
cd test-saas
npm install
npm run dev
# Verify works

# Cleanup
cd ../..
rm -rf test-release
```

### 10. Monitor Post-Release

#### First 24 Hours

- Monitor npm download stats
- Watch GitHub issues
- Check Twitter mentions
- Respond to questions quickly

#### First Week

- Gather feedback
- Note bug reports
- Plan hotfixes if needed
- Start planning next release

## Hotfix Release

If critical bug found:

```bash
# 1. Create hotfix branch
git checkout -b hotfix/v1.0.1

# 2. Fix the bug
# ... make changes ...

# 3. Create changeset
npx changeset add
# Select "patch" for hotfix

# 4. Version
npx changeset version

# 5. Commit
git add .
git commit -m "fix: critical bug in CLI template copying"

# 6. Publish
npm run build
npx changeset publish

# 7. Push
git push origin hotfix/v1.0.1 --follow-tags

# 8. Merge to main
git checkout main
git merge hotfix/v1.0.1
git push origin main

# 9. Create GitHub release for hotfix
```

## Version Number Guidelines

### Semantic Versioning

- **Major (1.0.0 → 2.0.0)**: Breaking changes
- **Minor (1.0.0 → 1.1.0)**: New features, backwards compatible
- **Patch (1.0.0 → 1.0.1)**: Bug fixes

### When to Bump

**Major:**
- Breaking API changes
- Removed features
- Changed CLI commands

**Minor:**
- New features
- New templates
- Enhanced functionality

**Patch:**
- Bug fixes
- Documentation updates
- Performance improvements

## Release Schedule

### Regular Releases

- **Major**: Yearly (v1.0.0, v2.0.0)
- **Minor**: Monthly (v1.1.0, v1.2.0)
- **Patch**: As needed (v1.0.1, v1.0.2)

### Pre-Release Versions

For beta testing:
```bash
# Publish beta
npm publish --tag beta

# Users install with
npm install -g @nyalajs/cli@beta
```

## Rollback Procedure

If release has critical issues:

```bash
# 1. Deprecate bad version
npm deprecate @nyalajs/cli@1.0.0 "Critical bug, use 1.0.1 instead"

# 2. Publish hotfix ASAP
# Follow hotfix procedure above

# 3. Announce on all channels
# Post warning on GitHub, Twitter, Discord
```

## Post-Release Checklist

- [ ] Packages published to npm
- [ ] GitHub release created
- [ ] Documentation site updated
- [ ] Announcement posted
- [ ] Twitter/social media shared
- [ ] Dev.to article published
- [ ] Discord announcement
- [ ] Email newsletter sent (if applicable)
- [ ] Issues monitored
- [ ] Download stats tracked
- [ ] Feedback collected

## Troubleshooting

### "Already published"

Version already exists on npm:
```bash
# Bump version manually
npm version patch
npm publish
```

### "Not logged in"

```bash
npm login
# Enter credentials
npm whoami  # Verify
```

### "Permission denied"

Not a collaborator on npm package:
```bash
# Package owner must add you
npm owner add <username> @nyalajs/cli
```

### Build fails

```bash
# Clean and rebuild
npm run clean
npm install
npm run build
```

## Release Automation (Future)

### GitHub Actions

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    branches:
      - main

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run build
      - run: npm test
      - uses: changesets/action@v1
        with:
          publish: npx changeset publish
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Support Plan

### Response Times

- **Critical bugs**: Fix within 24h
- **Major bugs**: Fix within 1 week
- **Minor bugs**: Fix in next release
- **Feature requests**: Consider for future

### Communication

- Monitor GitHub issues daily
- Respond to questions within 24h
- Weekly community update
- Monthly roadmap review

## Success Metrics

Track:
- npm download count
- GitHub stars
- Issues opened/closed
- Community size
- Documentation views

## Next Release Planning

After v1.0.0:

**v1.1.0 (Minor)**
- GraphQL support
- WebSocket integration
- Additional middleware
- Performance improvements

**v1.2.0 (Minor)**
- New templates (microservices)
- Enhanced CLI features
- Better error messages

**v2.0.0 (Major)**
- Full rewrite considerations
- Breaking changes if needed
- New architecture patterns

---

**Ready to release?** Start with `./scripts/release.sh` or follow the manual steps above!
