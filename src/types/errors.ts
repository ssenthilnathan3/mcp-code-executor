/**
 * Error handling types and classes for MCP Code Executor
 */

/**
 * Categories of errors that can occur in the system
 */
export enum ErrorCategory {
  CONNECTION = 'connection',
  SCHEMA = 'schema', 
  GENERATION = 'generation',
  RUNTIME = 'runtime',
  SECURITY = 'security',
  VALIDATION = 'validation',
  CONFIGURATION = 'configuration'
}

/**
 * Base error class for all MCP Code Executor errors
 */
export class MCPExecutorError extends Error {
  constructor(
    message: string,
    public readonly category: ErrorCategory,
    public readonly context?: Record<string, unknown>,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'MCPExecutorError';
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MCPExecutorError);
    }
  }

  /**
   * Convert error to JSON for logging/serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      context: this.context,
      stack: this.stack,
      cause: this.cause?.message
    };
  }
}

/**
 * Error related to MCP server connections
 */
export class ConnectionError extends MCPExecutorError {
  constructor(
    message: string,
    public readonly serverId?: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message, ErrorCategory.CONNECTION, { serverId, ...context }, cause);
    this.name = 'ConnectionError';
  }
}

/**
 * Error related to JSON Schema processing
 */
export class SchemaError extends MCPExecutorError {
  constructor(
    message: string,
    public readonly schemaPath?: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message, ErrorCategory.SCHEMA, { schemaPath, ...context }, cause);
    this.name = 'SchemaError';
  }
}

/**
 * Error related to TypeScript code generation
 */
export class GenerationError extends MCPExecutorError {
  constructor(
    message: string,
    public readonly toolName?: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message, ErrorCategory.GENERATION, { toolName, ...context }, cause);
    this.name = 'GenerationError';
  }
}

/**
 * Error related to code execution in the sandbox
 */
export class RuntimeError extends MCPExecutorError {
  constructor(
    message: string,
    public readonly exitCode?: number,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message, ErrorCategory.RUNTIME, { exitCode, ...context }, cause);
    this.name = 'RuntimeError';
  }
}

/**
 * Error related to security violations
 */
export class SecurityError extends MCPExecutorError {
  constructor(
    message: string,
    public readonly violation?: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message, ErrorCategory.SECURITY, { violation, ...context }, cause);
    this.name = 'SecurityError';
  }
}

/**
 * Error related to configuration validation
 */
export class ValidationError extends MCPExecutorError {
  constructor(
    message: string,
    public readonly field?: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message, ErrorCategory.VALIDATION, { field, ...context }, cause);
    this.name = 'ValidationError';
  }
}

/**
 * Error related to configuration issues
 */
export class ConfigurationError extends MCPExecutorError {
  constructor(
    message: string,
    public readonly configPath?: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message, ErrorCategory.CONFIGURATION, { configPath, ...context }, cause);
    this.name = 'ConfigurationError';
  }
}

/**
 * Union type for execution-specific errors
 */
export type ExecutionError = RuntimeError | SecurityError | ValidationError;

/**
 * Union type for all possible errors
 */
export type AnyMCPError = 
  | ConnectionError 
  | SchemaError 
  | GenerationError 
  | RuntimeError 
  | SecurityError 
  | ValidationError 
  | ConfigurationError;