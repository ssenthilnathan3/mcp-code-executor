/**
 * Unit tests for MCPClient
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCPClient } from '../../src/mcp/client.js';
import { ConnectionError, SchemaError } from '../../src/types/errors.js';

// Mock the MCP SDK
const mockSdkClient = {
  connect: vi.fn(),
  close: vi.fn(),
  request: vi.fn()
};

const mockTransport = {};

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn(() => mockSdkClient)
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn(() => mockTransport)
}));

describe('MCPClient', () => {
  let client: MCPClient;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Reset mock implementations
    mockSdkClient.connect.mockResolvedValue(undefined);
    mockSdkClient.close.mockResolvedValue(undefined);
    mockSdkClient.request.mockResolvedValue(undefined);
    
    client = new MCPClient('test-server', 'test-command', 30000, 3);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create client with default parameters', () => {
      const defaultClient = new MCPClient('server1', 'command');
      expect(defaultClient.getServerId()).toBe('server1');
      expect(defaultClient.getServerUrl()).toBe('command');
    });

    it('should create client with custom parameters', () => {
      const customClient = new MCPClient('server2', 'custom-command', 60000, 5);
      expect(customClient.getServerId()).toBe('server2');
      expect(customClient.getServerUrl()).toBe('custom-command');
    });
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      mockSdkClient.connect.mockResolvedValue(undefined);
      
      await client.connect();
      
      expect(mockSdkClient.connect).toHaveBeenCalledWith(mockTransport);
      expect(client.isConnected()).toBe(true);
    });

    it('should throw ConnectionError on connection failure', async () => {
      const error = new Error('Connection failed');
      mockSdkClient.connect.mockRejectedValue(error);
      
      await expect(client.connect()).rejects.toThrow(ConnectionError);
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should disconnect successfully when connected', async () => {
      // First connect
      await client.connect();
      expect(client.isConnected()).toBe(true);
      
      // Then disconnect
      mockSdkClient.close.mockResolvedValue(undefined);
      await client.disconnect();
      
      expect(mockSdkClient.close).toHaveBeenCalled();
      expect(client.isConnected()).toBe(false);
    });

    it('should handle disconnect when not connected', async () => {
      expect(client.isConnected()).toBe(false);
      
      await client.disconnect();
      
      expect(mockSdkClient.close).not.toHaveBeenCalled();
    });

    it('should throw ConnectionError on disconnect failure', async () => {
      await client.connect();
      
      const error = new Error('Disconnect failed');
      mockSdkClient.close.mockRejectedValue(error);
      
      await expect(client.disconnect()).rejects.toThrow(ConnectionError);
    });
  });

  describe('getServerInfo', () => {
    it('should return server info when connected', async () => {
      await client.connect();
      
      const info = await client.getServerInfo();
      
      expect(info).toEqual({
        id: 'test-server',
        url: 'test-command',
        connected: true,
        name: 'test-server',
        version: '1.0.0'
      });
    });

    it('should throw ConnectionError when not connected', async () => {
      await expect(client.getServerInfo()).rejects.toThrow(ConnectionError);
    });
  });

  describe('listTools', () => {
    it('should list tools successfully when connected', async () => {
      await client.connect();
      
      const mockTools = [
        {
          name: 'test-tool',
          description: 'A test tool',
          inputSchema: {
            type: 'object',
            properties: {
              param1: { type: 'string' }
            }
          }
        }
      ];
      
      mockSdkClient.request.mockResolvedValue({ tools: mockTools });
      
      const tools = await client.listTools();
      
      expect(tools).toEqual([
        {
          name: 'test-tool',
          description: 'A test tool',
          inputSchema: {
            type: 'object',
            properties: {
              param1: { type: 'string' }
            }
          },
          outputSchema: undefined,
          serverId: 'test-server'
        }
      ]);
      
      expect(mockSdkClient.request).toHaveBeenCalledWith({
        method: 'tools/list',
        params: {}
      }, {});
    });

    it('should throw ConnectionError when not connected', async () => {
      await expect(client.listTools()).rejects.toThrow(ConnectionError);
    });

    it('should throw SchemaError on request failure', async () => {
      await client.connect();
      
      const error = new Error('Request failed');
      mockSdkClient.request.mockRejectedValue(error);
      
      await expect(client.listTools()).rejects.toThrow(SchemaError);
    });
  });

  describe('callTool', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should call tool successfully', async () => {
      const mockResult = { content: 'Tool result' };
      mockSdkClient.request.mockResolvedValue(mockResult);
      
      const result = await client.callTool('test-tool', { param1: 'value1' });
      
      expect(result).toBe('Tool result');
      expect(mockSdkClient.request).toHaveBeenCalledWith({
        method: 'tools/call',
        params: {
          name: 'test-tool',
          arguments: { param1: 'value1' }
        }
      }, {});
    });

    it('should handle empty arguments', async () => {
      const mockResult = { content: 'Tool result' };
      mockSdkClient.request.mockResolvedValue(mockResult);
      
      const result = await client.callTool('test-tool', undefined);
      
      expect(result).toBe('Tool result');
      expect(mockSdkClient.request).toHaveBeenCalledWith({
        method: 'tools/call',
        params: {
          name: 'test-tool',
          arguments: {}
        }
      }, {});
    });

    it('should retry on failure', async () => {
      mockSdkClient.request
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockRejectedValueOnce(new Error('Second attempt failed'))
        .mockResolvedValueOnce({ content: 'Success on third attempt' });
      
      const result = await client.callTool('test-tool', { param1: 'value1' });
      
      expect(result).toBe('Success on third attempt');
      expect(mockSdkClient.request).toHaveBeenCalledTimes(3);
    });

    it('should throw ConnectionError after max retries', async () => {
      mockSdkClient.request.mockRejectedValue(new Error('Always fails'));
      
      await expect(client.callTool('test-tool', {})).rejects.toThrow(ConnectionError);
      expect(mockSdkClient.request).toHaveBeenCalledTimes(3); // Default retries
    });
  });

  describe('getters', () => {
    it('should return correct server ID', () => {
      expect(client.getServerId()).toBe('test-server');
    });

    it('should return correct server URL', () => {
      expect(client.getServerUrl()).toBe('test-command');
    });
  });
});