/**
 * MCP Bridge for creating proxy objects and routing calls to MCP servers
 */

import type { MCPRegistry } from '../mcp/registry.js';
import { CallInterceptor, type ICallInterceptor, type CallMiddleware } from './call-interceptor.js';
import { ConnectionError } from '../types/errors.js';

/**
 * Configuration for proxy object creation
 */
export interface ProxyConfig {
  /** Namespace for the proxy */
  namespace: string;
  /** Whether to include metadata in the proxy */
  includeMetadata?: boolean;
  /** Custom property handlers */
  propertyHandlers?: Record<string, (args: unknown[]) => Promise<unknown>>;
}

/**
 * Interface for the MCP Bridge
 */
export interface IMCPBridge {
  /**
   * Create a proxy object for a namespace
   */
  createProxy<T = any>(namespace: string, config?: Partial<ProxyConfig>): T;
  
  /**
   * Intercept a method call and route it to the appropriate server
   */
  interceptCall(target: string, method: string, args: unknown[]): Promise<unknown>;
  
  /**
   * Register a call interceptor middleware
   */
  registerInterceptor(interceptor: CallMiddleware): void;
  
  /**
   * Remove a call interceptor middleware
   */
  removeInterceptor(interceptor: CallMiddleware): void;
  
  /**
   * Get the underlying call interceptor
   */
  getInterceptor(): ICallInterceptor;
}

/**
 * MCP Bridge implementation that creates proxy objects and routes calls
 */
export class MCPBridge implements IMCPBridge {
  private interceptor: CallInterceptor;
  private proxyCache = new Map<string, any>();

  constructor(private readonly registry: MCPRegistry) {
    this.interceptor = new CallInterceptor(registry);
  }

  /**
   * Create a proxy object for a namespace that intercepts method calls
   */
  createProxy<T = any>(namespace: string, config?: Partial<ProxyConfig>): T {
    // Check cache first
    const cacheKey = `${namespace}:${JSON.stringify(config || {})}`;
    if (this.proxyCache.has(cacheKey)) {
      return this.proxyCache.get(cacheKey);
    }

    const proxyConfig: ProxyConfig = {
      namespace,
      includeMetadata: false,
      propertyHandlers: {},
      ...config
    };

    // Get tools for this namespace/server
    const tools = this.registry.getToolSchemasForServer(namespace);
    const toolNames = new Set(tools.map(tool => tool.name));

    const proxy = new Proxy({} as T, {
      get: (target: any, property: string | symbol) => {
        if (typeof property !== 'string') {
          return undefined;
        }

        // Handle special properties
        if (property === '__namespace') {
          return proxyConfig.namespace;
        }

        if (property === '__tools') {
          return proxyConfig.includeMetadata ? tools : undefined;
        }

        if (property === 'toString') {
          return () => `[MCPProxy:${proxyConfig.namespace}]`;
        }

        if (property === 'valueOf') {
          return () => proxyConfig.namespace;
        }

        // Handle custom property handlers
        if (proxyConfig.propertyHandlers && proxyConfig.propertyHandlers[property]) {
          return proxyConfig.propertyHandlers[property];
        }

        // Check if this is a known tool
        const toolName = toolNames.has(property) ? property : `${namespace}.${property}`;
        
        // Return a function that will intercept the call
        return (...args: unknown[]) => {
          return this.interceptCall(namespace, toolName, args);
        };
      },

      has: (target: any, property: string | symbol) => {
        if (typeof property !== 'string') {
          return false;
        }

        // Special properties
        if (['__namespace', '__tools', 'toString', 'valueOf'].includes(property)) {
          return true;
        }

        // Custom handlers
        if (proxyConfig.propertyHandlers && proxyConfig.propertyHandlers[property]) {
          return true;
        }

        // Check if it's a known tool or always return true for potential tools
        return toolNames.has(property) || toolNames.has(`${namespace}.${property}`) || true;
      },

      ownKeys: () => {
        const keys = ['__namespace', 'toString', 'valueOf'];
        
        if (proxyConfig.includeMetadata) {
          keys.push('__tools');
        }
        
        // Add custom handler keys
        if (proxyConfig.propertyHandlers) {
          keys.push(...Object.keys(proxyConfig.propertyHandlers));
        }
        
        // Add tool names
        keys.push(...Array.from(toolNames));
        
        return keys;
      },

      getOwnPropertyDescriptor: (target: any, property: string | symbol) => {
        if (typeof property !== 'string') {
          return undefined;
        }

        // Check if the property exists
        const hasProperty = ['__namespace', '__tools', 'toString', 'valueOf'].includes(property) ||
          (proxyConfig.propertyHandlers && proxyConfig.propertyHandlers[property]) ||
          toolNames.has(property) ||
          toolNames.has(`${namespace}.${property}`);

        if (hasProperty) {
          return {
            enumerable: true,
            configurable: true,
            writable: false,
            value: undefined // The actual value will be computed by the get trap
          };
        }

        return undefined;
      }
    });

    // Cache the proxy
    this.proxyCache.set(cacheKey, proxy);
    
    return proxy;
  }

  /**
   * Intercept a method call and route it to the appropriate server
   */
  async interceptCall(target: string, method: string, args: unknown[]): Promise<unknown> {
    try {
      return await this.interceptor.intercept(target, method, args);
    } catch (error) {
      throw new ConnectionError(
        `Bridge call failed: ${target}.${method}`,
        target,
        { method, args },
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Register a call interceptor middleware
   */
  registerInterceptor(middleware: CallMiddleware): void {
    this.interceptor.use(middleware);
  }

  /**
   * Remove a call interceptor middleware
   */
  removeInterceptor(middleware: CallMiddleware): void {
    this.interceptor.removeMiddleware(middleware);
  }

  /**
   * Get the underlying call interceptor
   */
  getInterceptor(): ICallInterceptor {
    return this.interceptor;
  }

  /**
   * Clear the proxy cache
   */
  clearCache(): void {
    this.proxyCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.proxyCache.size,
      keys: Array.from(this.proxyCache.keys())
    };
  }

  /**
   * Create a typed proxy with better TypeScript support
   */
  createTypedProxy<T extends Record<string, (...args: any[]) => Promise<any>>>(
    namespace: string,
    toolDefinitions: Record<keyof T, { args: any[]; returnType: any }>,
    config?: Partial<ProxyConfig>
  ): T {
    const proxy = this.createProxy<T>(namespace, config);
    
    // The proxy already handles the method calls correctly,
    // this method just provides better TypeScript typing
    return proxy;
  }

  /**
   * Batch create proxies for multiple namespaces
   */
  createProxies<T extends Record<string, any>>(
    namespaces: string[],
    config?: Partial<ProxyConfig>
  ): Record<string, T> {
    const proxies: Record<string, T> = {};
    
    for (const namespace of namespaces) {
      proxies[namespace] = this.createProxy<T>(namespace, config);
    }
    
    return proxies;
  }

  /**
   * Check if a namespace has any available tools
   */
  hasTools(namespace: string): boolean {
    const tools = this.registry.getToolSchemasForServer(namespace);
    return tools.length > 0;
  }

  /**
   * Get available tool names for a namespace
   */
  getAvailableTools(namespace: string): string[] {
    const tools = this.registry.getToolSchemasForServer(namespace);
    return tools.map(tool => tool.name);
  }
}