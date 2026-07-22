#!/bin/bash

# Build script for Nyala Framework
# Builds all packages in correct dependency order

set -e

echo "🚀 Building Nyala Framework..."
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Build core first (no dependencies)
echo -e "${BLUE}Building @nyala/core...${NC}"
cd packages/core
npm run build
cd ../..
echo -e "${GREEN}✓ @nyala/core built${NC}"
echo ""

# Build packages that depend on core
echo -e "${BLUE}Building @nyala/config...${NC}"
cd packages/config
npm run build
cd ../..
echo -e "${GREEN}✓ @nyala/config built${NC}"
echo ""

# Build http (depends on core)
echo -e "${BLUE}Building @nyala/http...${NC}"
cd packages/http
npm run build
cd ../..
echo -e "${GREEN}✓ @nyala/http built${NC}"
echo ""

# Build packages that depend on core + http
echo -e "${BLUE}Building @nyala/security...${NC}"
cd packages/security
npm run build
cd ../..
echo -e "${GREEN}✓ @nyala/security built${NC}"
echo ""

echo -e "${BLUE}Building @nyala/tenancy...${NC}"
cd packages/tenancy
npm run build
cd ../..
echo -e "${GREEN}✓ @nyala/tenancy built${NC}"
echo ""

echo -e "${BLUE}Building @nyala/audit...${NC}"
cd packages/audit
npm run build
cd ../..
echo -e "${GREEN}✓ @nyala/audit built${NC}"
echo ""

echo -e "${BLUE}Building @nyala/observability...${NC}"
cd packages/observability
npm run build
cd ../..
echo -e "${GREEN}✓ @nyala/observability built${NC}"
echo ""

# Build CLI (no dependencies on other packages)
echo -e "${BLUE}Building @nyala/cli...${NC}"
cd packages/cli
npm run build
cd ../..
echo -e "${GREEN}✓ @nyala/cli built${NC}"
echo ""

echo -e "${GREEN}✨ All packages built successfully!${NC}"
echo ""
echo "Next steps:"
echo "  cd examples/basic-app"
echo "  npm install"
echo "  npm run dev"
