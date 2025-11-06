## Module Descriptions

### Source Modules (`src/`)

#### `bridge/` - MCP Bridge Layer
- **Purpose**: Intercepts API calls and routes them to appropriate MCP servers
- **Key Components**:
  - `mcp-bridge.ts`: Main bridge implementation with proxy creation
  - `call-interceptor.ts`: Middleware system for call interception
  - `api-factory.ts`: Dynamic API generation from tool schemas

#### `generator/` - Code Generation Layer
- **Purpose**: Transforms MCP tool schemas into TypeScript APIs
- **Key Components**:
  - `typescript-generator.ts`: Main generator orchestrating the process
  - `namespace-manager.ts`: Manages namespaces and resolves naming conflicts
  - `type-mapper.ts`: Converts JSON Schema to TypeScript types
  - `template-builder.ts`: Builds TypeScript code from templates

#### `mcp/` - MCP Client Layer
- **Purpose**: Manages connections to MCP servers and tool schemas
- **Key Components**:
  - `registry.ts`: Central registry for managing multiple MCP servers
  - `client.ts`: Individual MCP server client implementation

#### `runtime/` - Execution Layer
- **Purpose**: Securely executes generated TypeScript code in Deno sandbox
- **Key Components**:
  - `deno-executor.ts`: Secure sandbox executor with resource limits

#### `types/` - Type Definitions
- **Purpose**: Centralized type definitions and error classes
- **Key Components**:
  - `index.ts`: Core interfaces and type definitions
  - `errors.ts`: Structured error classes with categories

#### `utils/` - Utilities
- **Purpose**: Shared utility functions and validation logic
- **Key Components**:
  - `validation.ts`: Configuration and data validation functions
