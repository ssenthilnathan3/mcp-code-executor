/**
 * MCP Bridge module - provides call interception and routing to MCP servers
 */

export * from './mcp-bridge.ts';
export * from './call-interceptor.js';
export * from './api-factory.js';

// Re-export key types for convenience
export type {
  CallContext,
  InterceptionResult,
  CallMiddleware,
  ICallInterceptor
} from './call-interceptor.js';

export type {
  ProxyConfig,
  IMCPBridge
} from './mcp-bridge.js';

export type {
  ApiGenerationConfig,
  IApiFactory
} from './api-factory.js';