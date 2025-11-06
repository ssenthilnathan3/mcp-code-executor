/**
 * Tests for MCPBridge
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCPBridge } from '../../src/bridge/mcp-bridge.js';
import { MCPRegistry } from '../../src/mcp/registry.js';
import type { ToolSchema } from '../../src/types/index.js';

// Mock MCPRegistry
vi.mock('../mcp/registry.js');

describe('MCPBridge', () => {
  let registry: MCPRegistry;
  let bridge: MCPBridge;

  const mockTools: ToolSchema[] = [
    {
      name: 'getTool',
      description: 'Get something',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } } },
      serverId: 'server1'
    },
    {
      name: 'postTool',
      description: 'Post something',
      inputSchema: { type: 'object', properties: { data: { type: 'object' } } },
      serverId: 'server1'
    }
  ];

  beforeEach(() => {
    registry = new MCPRegistry();
    bridge = new MCPBridge(registry);
    
    // Setup registry mocks
    vi.mocked(registry.getToolSchemasForServer).mockReturnValue(mockTools);
    vi.mocked(registry.callTool).mockResolvedValue({ result: 'test-result' });
  });

  describe('proxy creation', () => {
    it('should create a proxy object', () => {
      const proxy = bridge.createProxy('server1');
      
      expect(proxy).toBeDefined();
      expect(typeof proxy).toBe('object');
    });

    it('should cache proxy objects', () => {
      const proxy1 = bridge.createProxy('server1');
      const proxy2 = bridge.createProxy('server1');
      
      expect(proxy1).toBe(proxy2);
    });

    it('should create different proxies for different namespaces', () => {
      const proxy1 = bridge.createProxy('server1');
      const proxy2 = bridge.createProxy('server2');
      
      expect(proxy1).not.toBe(proxy2);
    });

    it('should create different proxies for different configs', () => {
      const proxy1 = bridge.createProxy('server1', { includeMetadata: true });
      const proxy2 = bridge.createProxy('server1', { includeMetadata: false });
      
      expect(proxy1).not.toBe(proxy2);
    });
  });

  describe('proxy behavior', () => {
    it('should expose special properties', () => {
      const proxy = bridge.createProxy('server1');
      
      expect(proxy.__namespace).toBe('server1');
      expect(proxy.toString()).toBe('[MCPProxy:server1]');
      expect(proxy.valueOf()).toBe('server1');
    });

    it('should expose tools metadata when configured', () => {
      const proxy = bridge.createProxy('server1', { includeMetadata: true });
      
      expect(proxy.__tools).toEqual(mockTools);
    });

    it('should not expose tools metadata by default', () => {
      const proxy = bridge.createProxy('server1');
      
      expect(proxy.__tools).toBeUndefined();
    });

    it('should handle custom property handlers', () => {
      const customHandler = vi.fn().mockResolvedValue('custom-result');
      const proxy = bridge.createProxy('server1', {
        propertyHandlers: {
          customMethod: customHandler
        }
      });
      
      expect(proxy.customMethod).toBe(customHandler);
    });

    it('should return functions for tool names', () => {
      const proxy = bridge.createProxy('server1');
      
      expect(typeof proxy.getTool).toBe('function');
      expect(typeof proxy.postTool).toBe('function');
    });

    it('should return functions for unknown properties (potential tools)', () => {
      const proxy = bridge.createProxy('server1');
      
      expect(typeof proxy.unknownTool).toBe('function');
    });
  });

  describe('proxy method calls', () => {
    it('should intercept and route method calls', async () => {
      const proxy = bridge.createProxy('server1');
      
      const result = await proxy.getTool({ id: 'test-id' });
      
      expect(result).toEqual({ result: 'test-result' });
      expect(registry.callTool).toHaveBeenCalledWith('getTool', { id: 'test-id' });
    });

    it('should handle multiple arguments', async () => {
      const proxy = bridge.createProxy('server1');
      
      await proxy.getTool({ id: 'test-id' }, 'extra-arg');
      
      // The interceptor should receive all arguments as an array
      expect(bridge.getInterceptor().intercept).toBeDefined();
    });

    it('should handle calls to unknown tools', async () => {
      const proxy = bridge.createProxy('server1');
      
      await proxy.unknownTool({ param: 'value' });
      
      // Should still attempt to call through the interceptor
      expect(registry.callTool).toHaveBeenCalled();
    });
  });

  describe('proxy introspection', () => {
    it('should support "has" trap for known tools', () => {
      const proxy = bridge.createProxy('server1');
      
      expect('getTool' in proxy).toBe(true);
      expect('postTool' in proxy).toBe(true);
      expect('unknownTool' in proxy).toBe(true); // Always returns true for potential tools
    });

    it('should support "has" trap for special properties', () => {
      const proxy = bridge.createProxy('server1');
      
      expect('__namespace' in proxy).toBe(true);
      expect('toString' in proxy).toBe(true);
      expect('valueOf' in proxy).toBe(true);
    });

    it('should support "ownKeys" trap', () => {
      const proxy = bridge.createProxy('server1', { includeMetadata: true });
      
      const keys = Object.keys(proxy);
      
      expect(keys).toContain('__namespace');
      expect(keys).toContain('__tools');
      expect(keys).toContain('toString');
      expect(keys).toContain('valueOf');
      expect(keys).toContain('getTool');
      expect(keys).toContain('postTool');
    });

    it('should support property descriptors', () => {
      const proxy = bridge.createProxy('server1');
      
      const descriptor = Object.getOwnPropertyDescriptor(proxy, 'getTool');
      
      expect(descriptor).toEqual({
        enumerable: true,
        configurable: true,
        writable: false,
        value: undefined // Value is computed by get trap
      });
    });
  });

  describe('middleware integration', () => {
    it('should register middleware', () => {
      const middleware = vi.fn();
      
      bridge.registerInterceptor(middleware);
      
      expect(bridge.getInterceptor().use).toBeDefined();
    });

    it('should remove middleware', () => {
      const middleware = vi.fn();
      
      bridge.registerInterceptor(middleware);
      bridge.removeInterceptor(middleware);
      
      expect(bridge.getInterceptor().removeMiddleware).toBeDefined();
    });
  });

  describe('utility methods', () => {
    it('should clear cache', () => {
      bridge.createProxy('server1');
      bridge.createProxy('server2');
      
      let stats = bridge.getCacheStats();
      expect(stats.size).toBe(2);
      
      bridge.clearCache();
      
      stats = bridge.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('should provide cache statistics', () => {
      bridge.createProxy('server1');
      bridge.createProxy('server2', { includeMetadata: true });
      
      const stats = bridge.getCacheStats();
      
      expect(stats.size).toBe(2);
      expect(stats.keys).toHaveLength(2);
      expect(stats.keys[0]).toContain('server1');
      expect(stats.keys[1]).toContain('server2');
    });

    it('should check if namespace has tools', () => {
      expect(bridge.hasTools('server1')).toBe(true);
      
      vi.mocked(registry.getToolSchemasForServer).mockReturnValue([]);
      expect(bridge.hasTools('empty-server')).toBe(false);
    });

    it('should get available tool names', () => {
      const toolNames = bridge.getAvailableTools('server1');
      
      expect(toolNames).toEqual(['getTool', 'postTool']);
    });

    it('should create multiple proxies at once', () => {
      const proxies = bridge.createProxies(['server1', 'server2']);
      
      expect(proxies.server1).toBeDefined();
      expect(proxies.server2).toBeDefined();
      expect(proxies.server1.__namespace).toBe('server1');
      expect(proxies.server2.__namespace).toBe('server2');
    });
  });

  describe('typed proxy creation', () => {
    interface TestAPI {
      getTool(args: { id: string }): Promise<{ result: string }>;
      postTool(args: { data: object }): Promise<{ success: boolean }>;
    }

    it('should create typed proxy', () => {
      const proxy = bridge.createTypedProxy<TestAPI>('server1', {
        getTool: { args: [{ id: 'string' }], returnType: { result: 'string' } },
        postTool: { args: [{ data: 'object' }], returnType: { success: 'boolean' } }
      });
      
      expect(proxy).toBeDefined();
      expect(typeof proxy.getTool).toBe('function');
      expect(typeof proxy.postTool).toBe('function');
    });
  });

  describe('error handling', () => {
    it('should handle interceptor errors', async () => {
      const error = new Error('Interceptor error');
      vi.spyOn(bridge.getInterceptor(), 'intercept').mockRejectedValue(error);
      
      const proxy = bridge.createProxy('server1');
      
      await expect(proxy.getTool({ id: 'test' })).rejects.toThrow('Bridge call failed');
    });

    it('should propagate registry errors through interceptor', async () => {
      const registryError = new Error('Registry error');
      vi.mocked(registry.callTool).mockRejectedValue(registryError);
      
      const proxy = bridge.createProxy('server1');
      
      await expect(proxy.getTool({ id: 'test' })).rejects.toThrow();
    });
  });
});