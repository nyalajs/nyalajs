# Contributing to Nyala

Thank you for your interest in contributing to Nyala!

## Development Setup

```bash
# Clone repository
git clone https://github.com/nyalajs/nyala.git
cd nyala

# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test
```

## Project Structure

```
nyala/
├── packages/           # Framework packages
│   ├── core/          # Kernel, DI, modules
│   ├── http/          # HTTP adapter
│   ├── security/      # Auth & authorization
│   ├── tenancy/       # Multi-tenancy
│   ├── audit/         # Audit logging
│   ├── observability/ # Logging, metrics
│   ├── config/        # Configuration
│   └── cli/           # CLI tool
├── templates/         # Starter templates
├── examples/          # Example applications
└── docs/              # Documentation
```

## Development Workflow

1. **Create a branch** from `main`
2. **Make your changes** with tests
3. **Run tests** - `npm test`
4. **Build** - `npm run build`
5. **Submit PR** with clear description

## Testing Requirements

- Unit tests for all new features
- Property-based tests for core logic
- Integration tests for HTTP endpoints
- Minimum 80% code coverage

## Code Style

- Use TypeScript strict mode
- Follow existing code patterns
- Add JSDoc comments for public APIs
- Use meaningful variable names

## Commit Messages

Follow conventional commits:

```
feat: add new feature
fix: fix bug
docs: update documentation
test: add tests
refactor: refactor code
```

## Pull Request Process

1. Update documentation
2. Add tests
3. Ensure CI passes
4. Request review
5. Address feedback

## Questions?

Join our [Discord](https://discord.gg/nyalajs) or open a [Discussion](https://github.com/nyalajs/nyala/discussions).
