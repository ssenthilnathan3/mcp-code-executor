/**
 * Tests for CallInterceptor
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CallInterceptor, createLoggingMiddleware, createValidationMiddleware, createRateLimitMiddleware } from '../../src/bridge/call-interceptor.js';
import { MCPRegistry } from '../../src/mcp/registry.js';
import type { MCPServerConfig } from '../../src/types/index.js';

// Mock MCPRegistry
vi.mock('../mcp/registry.js');

describe('CallInterceptor', () => {
  let registry: MCPRegistry;
  let interceptor: CallInterceptor;

  beforeEach(() => {
    registry = new MCPRegistry();
    interceptor = new CallInterceptor(registry);
    
    // Setup registry mocks
    vi.mocked(registry.isServerConnected).mockReturnValue(true);
    vi.mocked(registry.callTool).mockResolvedValue({ result: 'test-result' });
  });

  describe('basic interception', () => {
    it('should intercept and route calls to registry', async () => {
      const result = await interceptor.intercept('server1', 'testTool', [{ param: 'value' }]);
      
      expect(registry.callTool).toHaveBeenCalledWith('testTool', { param: 'value' });
      expect(result).toEqual({ result: 'test-result' });
    });

    it('should handle namespaced tool names', async () => {
      vi.mocked(registry.isServerConnected).mockReturnValue(false);
      
      const result = await interceptor.intercept('server1.testTool', 'method', [{ param: 'value' }]);
      
      expect(registry.callTool).toHaveBeenCalledWith('server1.testTool', { param: 'value' });
      expect(result).toEqual({ result: 'test-result' });
    });

    it('should generate unique call IDs', async () => {
      const callIds: string[] = [];
      
      // Mock middleware to capture call IDs
      interceptor.use(async (context, next) => {
        callIds.push(context.callId);
        return next();
      });
      
      await interceptor.intercept('server1', 'tool1', []);
      await interceptor.intercept('server1', 'tool2', []);
      
      expect(callIds).toHaveLength(2);
      expect(callIds[0]).not.toBe(callIds[1]);
      expect(callIds[0]).toMatch(/^call_\d+_\d+$/);
      expect(callIds[1]).toMatch(/^call_\d+_\d+$/);
    });
  });

  describe('middleware support', () => {
    it('should execute middleware in order', async () => {
      const executionOrder: string[] = [];
      
      interceptor.use(async (context, next) => {
        executionOrder.push('middleware1-start');
        const result = await next();
        executionOrder.push('middleware1-end');
        return result;
      });
      
      interceptor.use(async (context, next) => {
        executionOrder.push('middleware2-start');
        const result = await next();
        executionOrder.push('middleware2-end');
        return result;
      });
      
      await interceptor.intercept('server1', 'testTool', []);
      
      expect(executionOrder).toEqual([
        'middleware1-start',
        'middleware2-start',
        'middleware2-end',
        'middleware1-end'
      ]);
    });

    it('should allow middleware to modify context', async () => {
      let capturedContext: any;
      
      interceptor.use(async (context, next) => {
        capturedContext = { ...context };
        return next();
      });
      
      await interceptor.intercept('server1', 'testTool', [{ original: 'value' }]);
      
      expect(capturedContext).toMatchObject({
        target: 'server1',
        method: 'testTool',
        args: [{ original: 'value' }],
        timestamp: expect.any(Number),
        callId: expect.any(String)
      });
    });

    it('should allow middleware to short-circuit execution', async () => {
      interceptor.use(async (context, next) => {
        if (context.method === 'blockedTool') {
          return { blocked: true };
        }
        return next();
      });
      
      const result = await interceptor.intercept('server1', 'blockedTool', []);
      
      expect(result).toEqual({ blocked: true });
      expect(registry.callTool).not.toHaveBeenCalled();
    });

    it('should remove middleware correctly', async () => {
      const middleware = vi.fn(async (context, next) => next());
      
      interceptor.use(middleware);
      await interceptor.intercept('server1', 'testTool', []);
      expect(middleware).toHaveBeenCalledTimes(1);
      
      interceptor.removeMiddleware(middleware);
      await interceptor.intercept('server1', 'testTool', []);
      expect(middleware).toHaveBeenCalledTimes(1); // Not called again
    });
  });

  describe('error handling', () => {
    it('should propagate registry errors', async () => {
      const error = new Error('Registry error');
      vi.mocked(registry.callTool).mockRejectedValue(error);
      
      await expect(interceptor.intercept('server1', 'testTool', [])).rejects.toThrow('Failed to execute call');
    });

    it('should handle middleware errors', async () => {
      interceptor.use(async () => {
        throw new Error('Middleware error');
      });
      
      await expect(interceptor.intercept('server1', 'testTool', [])).rejects.toThrow('Middleware error');
    });
  });
});

describe('Built-in Middleware', () => {
  describe('createLoggingMiddleware', () => {
    it('should log call start and completion', async () => {
      const logger = vi.fn();
      const middleware = createLoggingMiddleware(logger);
      
      const mockNext = vi.fn().mockResolvedValue('test-result');
      const context = {
        callId: 'test-call-1',
        target: 'server1',
        method: 'testTool',
        args: [{ param: 'value' }],
        timestamp: Date.now()
      };
      
      const result = await middleware(context, mockNext);
      
      expect(result).toBe('test-result');
      expect(logger).toHaveBeenCalledTimes(2);
      expect(logger).toHaveBeenNthCalledWith(1, '[test-call-1] Starting call: server1.testTool', expect.any(Object));
      expect(logger).toHaveBeenNthCalledWith(2, expect.stringMatching(/\[test-call-1\] Call completed in \d+ms/), expect.any(Object));
    });

    it('should log errors', async () => {
      const logger = vi.fn();
      const middleware = createLoggingMiddleware(logger);
      
      const error = new Error('Test error');
      const mockNext = vi.fn().mockRejectedValue(error);
      const context = {
        callId: 'test-call-1',
        target: 'server1',
        method: 'testTool',
        args: [],
        timestamp: Date.now()
      };
      
      await expect(middleware(context, mockNext)).rejects.toThrow('Test error');
      
      expect(logger).toHaveBeenCalledTimes(2);
      expect(logger).toHaveBeenNthCalledWith(2, expect.stringMatching(/\[test-call-1\] Call failed after \d+ms/), expect.any(Object));
    });
  });

  describe('createValidationMiddleware', () => {
    it('should pass validation and continue', async () => {
      const validator = vi.fn().mockReturnValue(true);
      const middleware = createValidationMiddleware(validator);
      
      const mockNext = vi.fn().mockResolvedValue('test-result');
      const context = {
        callId: 'test-call-1',
        target: 'server1',
        method: 'testTool',
        args: [{ param: 'value' }],
        timestamp: Date.now()
      };
      
      const result = await middleware(context, mockNext);
      
      expect(result).toBe('test-result');
      expect(validator).toHaveBeenCalledWith('server1', 'testTool', [{ param: 'value' }]);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should fail validation with boolean false', async () => {
      const validator = vi.fn().mockReturnValue(false);
      const middleware = createValidationMiddleware(validator);
      
      const mockNext = vi.fn();
      const context = {
        callId: 'test-call-1',
        target: 'server1',
        method: 'testTool',
        args: [],
        timestamp: Date.now()
      };
      
      await expect(middleware(context, mockNext)).rejects.toThrow('Validation failed for server1.testTool');
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should fail validation with error message', async () => {
      const validator = vi.fn().mockReturnValue('Invalid arguments');
      const middleware = createValidationMiddleware(validator);
      
      const mockNext = vi.fn();
      const context = {
        callId: 'test-call-1',
        target: 'server1',
        method: 'testTool',
        args: [],
        timestamp: Date.now()
      };
      
      await expect(middleware(context, mockNext)).rejects.toThrow('Validation failed for server1.testTool: Invalid arguments');
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('createRateLimitMiddleware', () => {
    it('should allow calls within rate limit', async () => {
      const middleware = createRateLimitMiddleware(5); // 5 calls per second
      
      const mockNext = vi.fn().mockResolvedValue('test-result');
      const context = {
        callId: 'test-call-1',
        target: 'server1',
        method: 'testTool',
        args: [],
        timestamp: Date.now()
      };
      
      // Make 3 calls - should all succeed
      for (let i = 0; i < 3; i++) {
        const result = await middleware(context, mockNext);
        expect(result).toBe('test-result');
      }
      
      expect(mockNext).toHaveBeenCalledTimes(3);
    });

    it('should block calls exceeding rate limit', async () => {
      const middleware = createRateLimitMiddleware(2); // 2 calls per second
      
      const mockNext = vi.fn().mockResolvedValue('test-result');
      const context = {
        callId: 'test-call-1',
        target: 'server1',
        method: 'testTool',
        args: [],
        timestamp: Date.now()
      };
      
      // Make 2 calls - should succeed
      await middleware(context, mockNext);
      await middleware(context, mockNext);
      
      // Third call should fail
      await expect(middleware(context, mockNext)).rejects.toThrow('Rate limit exceeded: maximum 2 calls per second');
      
      expect(mockNext).toHaveBeenCalledTimes(2);
    });

    it('should reset rate limit after time window', async () => {
      vi.useFakeTimers();
      
      const middleware = createRateLimitMiddleware(1); // 1 call per second
      
      const mockNext = vi.fn().mockResolvedValue('test-result');
      const context = {
        callId: 'test-call-1',
        target: 'server1',
        method: 'testTool',
        args: [],
        timestamp: Date.now()
      };
      
      // Make first call
      await middleware(context, mockNext);
      
      // Second call should fail
      await expect(middleware(context, mockNext)).rejects.toThrow('Rate limit exceeded');
      
      // Advance time by 1.1 seconds
      vi.advanceTimersByTime(1100);
      
      // Third call should succeed
      await middleware(context, mockNext);
      
      expect(mockNext).toHaveBeenCalledTimes(2);
      
      vi.useRealTimers();
    });
  });
});