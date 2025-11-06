/**
 * Call interceptor for routing method calls to MCP servers
 */

import type { MCPRegistry } from '../mcp/registry.js';
import { ConnectionError } from '../types/errors.js';

/**
 * Context information for intercepted calls
 */
export interface CallContext {
  /** Target namespace or server ID */
  target: string;
  /** Method name being called */
  method: string;
  /** Arguments passed to the method */
  args: unknown[];
  /** Timestamp when the call was made */
  timestamp: number;
  /** Unique call ID for tracking */
  callId: string;
}

/**
 * Result of call interception
 */
export interface InterceptionResult {
  /** Whether the call should proceed */
  proceed: boolean;
  /** Modified arguments if any */
  args?: unknown[];
  /** Result to return instead of proceeding (if proceed is false) */
  result?: unknown;
  /** Error to throw instead of proceeding (if proceed is false) */
  error?: Error;
}

/**
 * Middleware function for call interception
 */
export type CallMiddleware = (
  context: CallContext,
  next: () => Promise<unknown>
) => Promise<unknown>;

/**
 * Interface for call interceptors
 */
export interface ICallInterceptor {
  /**
   * Intercept a method call and route it appropriately
   */
  intercept(target: string, method: string, args: unknown[]): Promise<unknown>;
  
  /**
   * Add middleware to the interception pipeline
   */
  use(middleware: CallMiddleware): void;
  
  /**
   * Remove middleware from the interception pipeline
   */
  removeMiddleware(middleware: CallMiddleware): void;
}

/**
 * Implementation of call interceptor with middleware support
 */
export class CallInterceptor implements ICallInterceptor {
  private middlewares: CallMiddleware[] = [];
  private callCounter = 0;

  constructor(private readonly registry: MCPRegistry) {}

  /**
   * Intercept a method call and route it through middleware pipeline
   */
  async intercept(target: string, method: string, args: unknown[]): Promise<unknown> {
    const callId = this.generateCallId();
    const context: CallContext = {
      target,
      method,
      args,
      timestamp: Date.now(),
      callId
    };

    // Execute middleware pipeline
    return this.executeMiddlewarePipeline(context, 0);
  }

  /**
   * Add middleware to the interception pipeline
   */
  use(middleware: CallMiddleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * Remove middleware from the interception pipeline
   */
  removeMiddleware(middleware: CallMiddleware): void {
    const index = this.middlewares.indexOf(middleware);
    if (index >= 0) {
      this.middlewares.splice(index, 1);
    }
  }

  /**
   * Execute the middleware pipeline recursively
   */
  private async executeMiddlewarePipeline(
    context: CallContext,
    index: number
  ): Promise<unknown> {
    // If we've reached the end of the middleware chain, execute the actual call
    if (index >= this.middlewares.length) {
      return this.executeCall(context);
    }

    const middleware = this.middlewares[index];
    const next = () => this.executeMiddlewarePipeline(context, index + 1);

    return middleware(context, next);
  }

  /**
   * Execute the actual MCP tool call
   */
  private async executeCall(context: CallContext): Promise<unknown> {
    const { target, method, args } = context;

    try {
      // Check if the target is a server ID or a tool name
      if (this.registry.isServerConnected(target)) {
        // Target is a server ID, method is the tool name
        return await this.registry.callTool(method, args[0]);
      } else {
        // Target might be a namespaced tool name (server.tool)
        const toolName = target.includes('.') ? target : method;
        return await this.registry.callTool(toolName, args[0]);
      }
    } catch (error) {
      throw new ConnectionError(
        `Failed to execute call ${context.callId}: ${target}.${method}`,
        target,
        { callId: context.callId, method, args },
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Generate a unique call ID
   */
  private generateCallId(): string {
    return `call_${Date.now()}_${++this.callCounter}`;
  }
}

/**
 * Built-in middleware for logging calls
 */
export function createLoggingMiddleware(
  logger: (message: string, context?: any) => void = console.log
): CallMiddleware {
  return async (context: CallContext, next: () => Promise<unknown>) => {
    const startTime = Date.now();
    
    logger(`[${context.callId}] Starting call: ${context.target}.${context.method}`, {
      args: context.args,
      timestamp: context.timestamp
    });

    try {
      const result = await next();
      const duration = Date.now() - startTime;
      
      logger(`[${context.callId}] Call completed in ${duration}ms`, {
        result: typeof result,
        duration
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger(`[${context.callId}] Call failed after ${duration}ms`, {
        error: error instanceof Error ? error.message : String(error),
        duration
      });
      
      throw error;
    }
  };
}

/**
 * Built-in middleware for argument validation
 */
export function createValidationMiddleware(
  validator: (target: string, method: string, args: unknown[]) => boolean | string
): CallMiddleware {
  return async (context: CallContext, next: () => Promise<unknown>) => {
    const validationResult = validator(context.target, context.method, context.args);
    
    if (validationResult === false) {
      throw new Error(`Validation failed for ${context.target}.${context.method}`);
    }
    
    if (typeof validationResult === 'string') {
      throw new Error(`Validation failed for ${context.target}.${context.method}: ${validationResult}`);
    }
    
    return next();
  };
}

/**
 * Built-in middleware for rate limiting
 */
export function createRateLimitMiddleware(
  maxCallsPerSecond: number
): CallMiddleware {
  const callTimes: number[] = [];
  
  return async (context: CallContext, next: () => Promise<unknown>) => {
    const now = Date.now();
    
    // Remove calls older than 1 second
    while (callTimes.length > 0 && callTimes[0] < now - 1000) {
      callTimes.shift();
    }
    
    // Check if we've exceeded the rate limit
    if (callTimes.length >= maxCallsPerSecond) {
      throw new Error(`Rate limit exceeded: maximum ${maxCallsPerSecond} calls per second`);
    }
    
    callTimes.push(now);
    return next();
  };
}