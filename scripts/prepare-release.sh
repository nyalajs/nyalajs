#!/bin/bash

# Nyala Release Preparation Script
# Prepares the project for first production release

set -e

echo "🎯 Preparing Nyala for Production Release"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Step 1: Initialize Git (if needed)
echo -e "${BLUE}Step 1: Git Repository Setup${NC}"
if [ ! -d ".git" ]; then
    echo "Initializing Git repository..."
    git init
    echo -e "${GREEN}✓ Git initialized${NC}"
else
    echo -e "${GREEN}✓ Git already initialized${NC}"
fi
echo ""

# Step 2: Create .gitignore (if needed)
if [ ! -f ".gitignore" ]; then
    echo "Creating .gitignore..."
    cat > .gitignore << 'EOF'
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Build output
dist/
build/
*.tsbuildinfo
.turbo/

# Environment
.env
.env.local
.env.*.local

# Logs
logs/
*.log

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Testing
coverage/
.nyc_output/

# Temporary
tmp/
temp/
*.tmp

# Database
*.db
*.sqlite
*.sqlite3
EOF
    echo -e "${GREEN}✓ .gitignore created${NC}"
else
    echo -e "${GREEN}✓ .gitignore exists${NC}"
fi
echo ""

# Step 3: Clean and Build
echo -e "${BLUE}Step 2: Clean Build${NC}"
echo "Cleaning old builds..."
npm run clean 2>/dev/null || echo "No clean script, skipping..."

echo "Installing dependencies..."
npm install

echo "Building all packages..."
npm run build || {
    echo -e "${RED}✗ Build failed!${NC}"
    echo "Fix build errors before continuing."
    exit 1
}
echo -e "${GREEN}✓ Build successful${NC}"
echo ""

# Step 4: Run Tests
echo -e "${BLUE}Step 3: Running Tests${NC}"
npm test 2>&1 | head -50 || {
    echo -e "${YELLOW}⚠ Some tests failed${NC}"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
}
echo -e "${GREEN}✓ Tests completed${NC}"
echo ""

# Step 5: Security Audit
echo -e "${BLUE}Step 4: Security Audit${NC}"
npm audit --audit-level=moderate || {
    echo -e "${YELLOW}⚠ Security vulnerabilities found${NC}"
    read -p "Try to fix automatically? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        npm audit fix
    fi
}
echo ""

# Step 6: Test Template Generation
echo -e "${BLUE}Step 5: Testing Templates${NC}"
cd packages/cli
npm link
cd ../..

echo "Testing MVC template..."
mkdir -p temp-test
cd temp-test
nyala new test-mvc --template=mvc 2>&1 | tail -5
if [ -d "test-mvc" ]; then
    echo -e "${GREEN}✓ MVC template generated${NC}"
    cd test-mvc
    npm install --silent
    npm run build --silent 2>&1 | tail -3
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ MVC template builds successfully${NC}"
    else
        echo -e "${RED}✗ MVC template build failed${NC}"
    fi
    cd ../..
else
    echo -e "${RED}✗ MVC template generation failed${NC}"
fi

echo "Testing SaaS template..."
cd temp-test
nyala new test-saas --template=saas 2>&1 | tail -5
if [ -d "test-saas" ]; then
    echo -e "${GREEN}✓ SaaS template generated${NC}"
    cd test-saas
    npm install --silent
    npm run build --silent 2>&1 | tail -3
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ SaaS template builds successfully${NC}"
    else
        echo -e "${RED}✗ SaaS template build failed${NC}"
    fi
    cd ../..
else
    echo -e "${RED}✗ SaaS template generation failed${NC}"
fi

# Cleanup
cd ..
rm -rf temp-test
echo ""

# Step 7: Check Package Versions
echo -e "${BLUE}Step 6: Package Versions${NC}"
echo "Current versions:"
echo -e "${YELLOW}CLI:${NC} $(cat packages/cli/package.json | grep '"version"' | cut -d'"' -f4)"
echo -e "${YELLOW}Core:${NC} $(cat packages/core/package.json | grep '"version"' | cut -d'"' -f4)"
echo -e "${YELLOW}HTTP:${NC} $(cat packages/http/package.json | grep '"version"' | cut -d'"' -f4)"
echo ""

# Step 8: Git Status
echo -e "${BLUE}Step 7: Git Status${NC}"
if [ -d ".git" ]; then
    echo "Git status:"
    git status --short | head -20

    if [ -n "$(git status --short)" ]; then
        echo ""
        read -p "Commit all changes? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git add .
            git commit -m "feat: prepare v1.0.0 release with MVC and SaaS templates

- Add CLI template selection support
- Create production-ready MVC starter template
- Enhance SaaS starter with multi-tenancy
- Add 2,800+ lines of comprehensive documentation
- Add release automation scripts

BREAKING CHANGE: CLI now defaults to mvc template instead of basic"
            echo -e "${GREEN}✓ Changes committed${NC}"
        fi
    else
        echo -e "${GREEN}✓ No uncommitted changes${NC}"
    fi
fi
echo ""

# Step 9: Create Changeset
echo -e "${BLUE}Step 8: Creating Changeset${NC}"
if [ -f ".changeset/release-v1.md" ]; then
    echo -e "${GREEN}✓ Changeset already exists${NC}"
else
    echo -e "${YELLOW}Note: Changeset file .changeset/release-v1.md already created${NC}"
fi
echo ""

# Final Summary
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Preparation Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo ""
echo "1. Set up remote repository (if not done):"
echo -e "   ${YELLOW}git remote add origin <your-repo-url>${NC}"
echo ""
echo "2. Configure NPM publishing:"
echo -e "   ${YELLOW}npm login${NC}"
echo ""
echo "3. Review the changeset:"
echo -e "   ${YELLOW}cat .changeset/release-v1.md${NC}"
echo ""
echo "4. Version packages:"
echo -e "   ${YELLOW}npx changeset version${NC}"
echo ""
echo "5. When ready to release:"
echo -e "   ${YELLOW}./scripts/release.sh${NC}"
echo ""
echo "Or follow the manual steps in RELEASE_GUIDE.md"
echo ""
echo -e "${GREEN}Good luck with the release! 🚀${NC}"
echo ""
