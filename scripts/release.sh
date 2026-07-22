#!/bin/bash

# Nyala Release Script
# This script automates the release process

set -e

echo "🚀 Nyala Release Script"
echo "======================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if on main branch
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
    echo -e "${YELLOW}Warning: Not on main branch (current: $BRANCH)${NC}"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check for uncommitted changes
if [[ -n $(git status -s) ]]; then
    echo -e "${RED}Error: Uncommitted changes detected${NC}"
    echo "Please commit or stash changes before releasing"
    exit 1
fi

echo -e "${GREEN}✓ Git status clean${NC}"

# Pull latest changes
echo ""
echo "Pulling latest changes..."
git pull origin main

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install

# Run linting
echo ""
echo "Running linter..."
npm run lint || {
    echo -e "${RED}✗ Linting failed${NC}"
    exit 1
}
echo -e "${GREEN}✓ Linting passed${NC}"

# Build all packages
echo ""
echo "Building all packages..."
npm run build || {
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
}
echo -e "${GREEN}✓ Build successful${NC}"

# Run tests
echo ""
echo "Running tests..."
npm test || {
    echo -e "${YELLOW}Warning: Some tests failed${NC}"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
}
echo -e "${GREEN}✓ Tests passed${NC}"

# Version bump (if changesets exist)
echo ""
echo "Checking for changesets..."
if [ -d ".changeset" ] && [ "$(ls -A .changeset/*.md 2>/dev/null | wc -l)" -gt 0 ]; then
    echo "Applying changesets..."
    npx changeset version

    # Commit version changes
    if [[ -n $(git status -s) ]]; then
        git add .
        git commit -m "chore: version packages"
    fi
else
    echo -e "${YELLOW}No changesets found. Skipping version bump.${NC}"
fi

# Show what will be published
echo ""
echo -e "${YELLOW}Packages to be published:${NC}"
npm run build
npx changeset status

# Confirm release
echo ""
read -p "Ready to publish? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Release cancelled"
    exit 1
fi

# Publish packages
echo ""
echo "Publishing packages..."
npx changeset publish || {
    echo -e "${RED}✗ Publish failed${NC}"
    exit 1
}

echo -e "${GREEN}✓ Packages published successfully${NC}"

# Push changes and tags
echo ""
echo "Pushing changes and tags..."
git push origin main --follow-tags

echo ""
echo -e "${GREEN}🎉 Release complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Create GitHub release from the new tag"
echo "2. Announce on social media"
echo "3. Update documentation site"
echo ""
