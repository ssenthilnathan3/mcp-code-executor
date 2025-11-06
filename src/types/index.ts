/**
 * Core data models and interfaces for MCP Code Executor
 */

// Re-export error types
export * from './errors.js';
import type { ExecutionError, GenerationError } from './errors.js';

/**
 * JSON Schema representation for tool input/output definitions
 */
export interface JSONSchema {
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  enum?: unknown[];
  description?: string;
  default?: unknown;
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  allOf?: JSONSchema[];
  additionalProperties?: boolean | JSONSchema;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  format?: string;
}

/**
 * Schema definition for an MCP tool
 */
export interface ToolSchema {
  /** Unique name of the tool */
  name: string;
  /** Human-readable description of what the tool does */
  description: string;
  /** JSON Schema defining the expected input parameters */
  inputSchema: JSONSchema;
  /** Optional JSON Schema defining the expected output format */
  outputSchema?: JSONSchema;
  /** ID of the MCP server that provides this tool */
  serverId: string;
}

/**
 * Definition of a namespace containing related tools
 */
export interface NamespaceDefinition {
  /** Name of the namespace */
  name: string;
  /** ID of the MCP server this namespace represents */
  serverId: string;
  /** Tools included in this namespace */
  tools: ToolSchema[];
  /** Import statements needed for this namespace */
  imports: string[];
  /** Export statements for this namespace */
  exports: string[];
}

/**
 * Metrics collected during code execution
 */
export interface ExecutionMetrics {
  /** Execution duration in milliseconds */
  duration: number;
  /** Memory used in bytes */
  memoryUsed: number;
  /** Number of API calls made during execution */
  apiCallCount: number;
}

/**
 * Result of code execution in the sandbox
 */
export interface ExecutionResult {
  /** Whether the execution completed successfully */
  success: boolean;
  /** The result value if execution succeeded */
  result?: unknown;
  /** Error information if execution failed */
  error?: ExecutionError;
  /** Performance and usage metrics */
  metrics: ExecutionMetrics;
}

/**
 * Information about an MCP server
 */
export interface MCPServerInfo {
  /** Unique identifier for the server */
  id: string;
  /** Server URL or connection string */
  url: string;
  /** Whether the server is currently connected */
  connected: boolean;
  /** Server name if provided */
  name?: string;
  /** Server version if available */
  version?: string;
}

/**
 * Configuration for an individual MCP server connection
 */
export interface MCPServerConfig {
  /** Unique identifier for this server */
  id: string;
  /** Server URL or connection string */
  url: string;
  /** Connection timeout in milliseconds */
  timeout?: number;
  /** Number of retry attempts for failed connections */
  retries?: number;
  /** Optional server name for display purposes */
  name?: string;
}

/**
 * Configuration for TypeScript code generation
 */
export interface GenerationConfig {
  /** Output directory for generated TypeScript files */
  outputDir: string;
  /** Optional prefix for generated namespaces */
  namespacePrefix?: string;
  /** Whether to include JSDoc documentation in generated code */
  includeDocumentation: boolean;
  /** Target TypeScript version for generated code */
  typeScriptVersion: string;
  /** Whether to generate strict type definitions */
  strictTypes?: boolean;
}

/**
 * Configuration for the Deno runtime sandbox
 */
export interface RuntimeConfig {
  /** Execution timeout in milliseconds */
  timeout: number;
  /** Memory limit in bytes */
  memoryLimit: number;
  /** Deno permissions configuration */
  permissions: DenoPermissions;
  /** List of allowed modules for import */
  allowedModules: string[];
  /** Whether to enable debugging features */
  enableDebugging?: boolean;
}

/**
 * Deno permission configuration
 */
export interface DenoPermissions {
  /** Allow network access */
  allowNet?: boolean | string[];
  /** Allow file system read access */
  allowRead?: boolean | string[];
  /** Allow file system write access */
  allowWrite?: boolean | string[];
  /** Allow environment variable access */
  allowEnv?: boolean | string[];
  /** Allow subprocess execution */
  allowRun?: boolean | string[];
  /** Allow high-resolution time measurement */
  allowHrtime?: boolean;
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  /** Log level (debug, info, warn, error) */
  level: 'debug' | 'info' | 'warn' | 'error';
  /** Output format (json, text) */
  format: 'json' | 'text';
  /** Whether to include timestamps */
  includeTimestamp: boolean;
  /** Whether to include stack traces in error logs */
  includeStackTrace: boolean;
}

/**
 * Main configuration for the MCP Code Executor
 */
export interface MCPExecutorConfig {
  /** MCP server configurations */
  servers: MCPServerConfig[];
  /** TypeScript generation settings */
  generation: GenerationConfig;
  /** Runtime sandbox settings */
  runtime: RuntimeConfig;
  /** Logging configuration */
  logging: LoggingConfig;
}

/**
 * Options for code execution
 */
export interface ExecutionOptions {
  /** Execution timeout override */
  timeout?: number;
  /** Memory limit override */
  memoryLimit?: number;
  /** Custom permissions for this execution */
  permissions?: DenoPermissions;
  /** Whether to capture detailed metrics */
  captureMetrics?: boolean;
}

/**
 * Type definition generated from JSON Schema
 */
export interface TypeDefinition {
  /** TypeScript type string */
  typeString: string;
  /** Whether this is an interface definition */
  isInterface: boolean;
  /** Name of the type if it's a named interface */
  name?: string;
  /** Dependencies on other types */
  dependencies: string[];
}

/**
 * Result of TypeScript generation process
 */
export interface GenerationResult {
  /** Whether generation completed successfully */
  success: boolean;
  /** Generated file paths */
  generatedFiles: string[];
  /** Any warnings encountered during generation */
  warnings: string[];
  /** Error information if generation failed */
  error?: GenerationError;
}