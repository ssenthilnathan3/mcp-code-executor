# MCP Code Executor

A secure TypeScript-first runtime that enables LLMs to interact with Model Context Protocol (MCP) tools through generated TypeScript APIs instead of raw JSON schemas.

## Overview

The MCP Code Executor transforms MCP tool schemas into idiomatic TypeScript APIs and executes agent-authored code in a sandboxed Deno runtime. It transparently routes API calls to MCP servers while returning clean results without context bloat.

### Key Features

- **Type-first Development**: Generate strongly-typed TypeScript APIs from MCP schemas
- **Secure Execution**: Run untrusted code in isolated Deno sandbox with restricted permissions
- **Multi-server Support**: Connect to multiple MCP servers simultaneously with namespace management
- **Developer-friendly**: Generated APIs follow TypeScript conventions with comprehensive JSDoc
- **CLI Interface**: Simple commands for API generation and script execution

## Architecture

The system follows a pipeline architecture:

```
MCP Schema Discovery → TypeScript Generation → API Bridge → Sandboxed Execution
```

### Core Components

- **MCP Layer**: Handles connections to MCP servers and schema discovery
- **Generation Layer**: Transforms MCP schemas into TypeScript APIs  
- **Bridge Layer**: Intercepts API calls and routes them to MCP servers
- **Runtime Layer**: Executes code securely in Deno sandbox

## Installation

### Prerequisites

- Node.js 18+ for the main runtime
- Deno 1.40+ for sandboxed code execution
- TypeScript 5.4+ for development

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd mcp-code-executor
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

4. Install Deno (if not already installed):
```bash
# Using curl
curl -fsSL https://deno.land/install.sh | sh

# Using npm
npm install -g @deno/cli

# Using Homebrew (macOS)
brew install deno
```

## Usage

### CLI Commands

#### Generate TypeScript APIs

```bash
# Generate APIs from configured MCP servers
mcp-executor generate

# Generate with custom config
mcp-executor generate --config ./custom-config.json
```

#### Execute Scripts

```bash
# Run a TypeScript script in the sandbox
mcp-executor run ./scripts/my-script.ts

# Run with custom execution options
mcp-executor run ./scripts/my-script.ts --timeout 30000 --memory-limit 512
```

### Configuration

Create a configuration file (e.g., `mcp-config.json`):

```json
{
  "servers": [
    {
      "id": "filesystem",
      "url": "stdio://path/to/filesystem-server",
      "timeout": 10000
    },
    {
      "id": "web-search", 
      "url": "stdio://path/to/search-server",
      "timeout": 15000
    }
  ],
  "generation": {
    "outputDir": "./generated",
    "includeDocumentation": true,
    "namespacePrefix": "MCP"
  },
  "runtime": {
    "timeout": 30000,
    "memoryLimit": 512,
    "permissions": {
      "read": ["./generated"],
      "write": ["./output"],
      "net": false
    }
  }
}
```

### Library Usage

```typescript
import { MCPExecutor, MCPExecutorConfig } from 'mcp-code-executor';

const config: MCPExecutorConfig = {
  servers: [
    { id: 'fs', url: 'stdio://filesystem-server' }
  ],
  generation: {
    outputDir: './generated'
  }
};

const executor = new MCPExecutor(config);

// Generate APIs
await executor.generateAPIs();

// Execute code
const result = await executor.execute(`
  import { fs } from './generated/fs';
  
  const files = await fs.listFiles('/home/user');
  return files.length;
`);

console.log('Result:', result.result);
```

## Development

### Project Structure

```
src/                    # Source code
├── mcp/               # MCP server connections and schema handling
├── generator/         # TypeScript API generation
├── bridge/            # API call interception and routing  
├── runtime/           # Deno sandbox execution
├── types/             # Type definitions and interfaces
├── utils/             # Shared utilities
└── cli/               # Command-line interface

tests/                 # Test files (mirrors src structure)
├── mcp/               # MCP layer tests
├── generator/         # Code generation tests
├── bridge/            # Bridge layer tests
├── runtime/           # Runtime execution tests
└── utils/             # Utility function tests
```

For detailed folder structure documentation, see [FOLDER_STRUCTURE.md](./FOLDER_STRUCTURE.md).

### Scripts

```bash
# Development with watch mode
npm run dev

# Run tests
npm test

# Run tests once
npm run test:run

# Lint code
npm run lint

# Format code  
npm run format

# Clean build artifacts
npm run clean
```

### Testing

The project uses Vitest for testing with comprehensive coverage:

- Unit tests for individual components
- Integration tests for full pipeline
- Security tests for sandbox isolation
- Performance tests for execution limits

```bash
# Run all tests
npm test

# Run specific test file
npm test -- src/mcp/registry.test.ts

# Run tests with coverage
npm test -- --coverage
```

## Security

The MCP Code Executor prioritizes security through multiple layers:

- **Deno Sandbox**: Restricted permissions prevent unauthorized system access
- **Timeout Enforcement**: Prevents infinite loops and resource exhaustion  
- **Memory Limits**: Controls resource usage during execution
- **Network Isolation**: Blocks unauthorized network requests
- **Input Validation**: Validates all schemas and configurations

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Run the test suite
5. Submit a pull request

## License

MIT License - see LICENSE file for details.