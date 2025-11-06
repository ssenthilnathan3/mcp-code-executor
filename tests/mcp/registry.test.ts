/**
 * Unit tests for MCPRegistry
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCPRegistry, type ConnectionEvent } from '../../src/mcp/registry.js';
import { MCPClient } from '../../src/mcp/client.js';
import { ConnectionError, SchemaError } from '../../src/types/errors.js';
import type { MCPServerConfig, ToolSchema } from '../../src/types/index.js';

// Mock MCPClient
vi.mock('./client.js', () => ({
  MCPClient: vi.fn()
}));

describe('MCPRegistry', () => {
  let registry: MCPRegistry;
  let mockClient1: any;
  let mockClient2: any;
  let connectionEvents: ConnectionEvent[];

  const serverConfig1: MCPServerConfig = {
    id: 'server1',
    url: 'command1',
    timeout: 30000,
    retries: 3
  };

  const serverConfig2: MCPServerConfig = {
    id: 'server2',
    url: 'command2',
    timeout: 60000,
    retries: 5
  };

  const mockTools1: ToolSchema[] = [
    {
      name: 'tool1',
      description: 'Tool 1',
      inputSchema: { type: 'object' },
      serverId: 'server1'
    },
    {
      name: 'shared-tool',
      description: 'Shared tool from server1',
      inputSchema: { type: 'object' },
      serverId: 'server1'
    }
  ];

  const mockTools2: ToolSchema[] = [
    {
      name: 'tool2',
      description: 'Tool 2',
      inputSchema: { type: 'object' },
      serverId: 'server2'
    },
    {
      name: 'shared-tool',
      description: 'Shared tool from server2',
      inputSchema: { type: 'object' },
      serverId: 'server2'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create mock clients
    mockClient1 = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn().mockReturnValue(false),
      getServerInfo: vi.fn().mockResolvedValue({
        id: 'server1',
        url: 'command1',
        connected: true,
        name: 'server1',
        version: '1.0.0'
      }),
      listTools: vi.fn().mockResolvedValue(mockTools1),
      callTool: vi.fn().mockResolvedValue('result1'),
      getServerId: vi.fn().mockReturnValue('server1'),
      getServerUrl: vi.fn().mockReturnValue('command1')
    };

    mockClient2 = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn().mockReturnValue(false),
      getServerInfo: vi.fn().mockResolvedValue({
        id: 'server2',
        url: 'command2',
        connected: true,
        name: 'server2',
        version: '1.0.0'
      }),
      listTools: vi.fn().mockResolvedValue(mockTools2),
      callTool: vi.fn().mockResolvedValue('result2'),
      getServerId: vi.fn().mockReturnValue('server2'),
      getServerUrl: vi.fn().mockReturnValue('command2')
    };

    // Mock MCPClient constructor
    const MockedMCPClient = MCPClient as any;
    MockedMCPClient.mockImplementation((id: string) => {
      if (id === 'server1') return mockClient1;
      if (id === 'server2') return mockClient2;
      throw new Error(`Unexpected server ID: ${id}`);
    });

    registry = new MCPRegistry();
    connectionEvents = [];
    
    // Set up connection event listener
    registry.onConnectionChange((event) => {
      connectionEvents.push(event);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('addServer', () => {
    it('should add server successfully', () => {
      registry.addServer(serverConfig1);
      
      expect(registry.getServerIds()).toContain('server1');
      expect(MCPClient).toHaveBeenCalledWith('server1', 'command1', 30000, 3);
    });

    it('should throw error for duplicate server ID', () => {
      registry.addServer(serverConfig1);
      
      expect(() => registry.addServer(serverConfig1)).toThrow(ConnectionError);
    });
  });

  describe('removeServer', () => {
    it('should remove server successfully', async () => {
      registry.addServer(serverConfig1);
      mockClient1.isConnected.mockReturnValue(true);
      
      await registry.removeServer('server1');
      
      expect(mockClient1.disconnect).toHaveBeenCalled();
      expect(registry.getServerIds()).not.toContain('server1');
    });

    it('should handle removal of non-existent server', async () => {
      await expect(registry.removeServer('non-existent')).resolves.not.toThrow();
    });

    it('should continue removal even if disconnect fails', async () => {
      registry.addServer(serverConfig1);
      mockClient1.isConnected.mockReturnValue(true);
      mockClient1.disconnect.mockRejectedValue(new Error('Disconnect failed'));
      
      // Should not throw, just log warning
      await registry.removeServer('server1');
      
      expect(registry.getServerIds()).not.toContain('server1');
    });
  });

  describe('connect', () => {
    beforeEach(() => {
      registry.addServer(serverConfig1);
      registry.addServer(serverConfig2);
    });

    it('should connect to specific server successfully', async () => {
      mockClient1.isConnected.mockReturnValue(true);
      
      await registry.connect('server1');
      
      expect(mockClient1.connect).toHaveBeenCalled();
      expect(mockClient1.listTools).toHaveBeenCalled();
      expect(connectionEvents).toContainEqual({
        serverId: 'server1',
        connected: true
      });
    });

    it('should throw error for non-existent server', async () => {
      await expect(registry.connect('non-existent')).rejects.toThrow(ConnectionError);
    });

    it('should handle connection failure', async () => {
      const error = new Error('Connection failed');
      mockClient1.connect.mockRejectedValue(error);
      
      await expect(registry.connect('server1')).rejects.toThrow();
      expect(connectionEvents).toContainEqual({
        serverId: 'server1',
        connected: false,
        error
      });
    });
  });

  describe('connectAll', () => {
    beforeEach(() => {
      registry.addServer(serverConfig1);
      registry.addServer(serverConfig2);
    });

    it('should connect to all servers successfully', async () => {
      mockClient1.isConnected.mockReturnValue(true);
      mockClient2.isConnected.mockReturnValue(true);
      
      await registry.connectAll();
      
      expect(mockClient1.connect).toHaveBeenCalled();
      expect(mockClient2.connect).toHaveBeenCalled();
      expect(mockClient1.listTools).toHaveBeenCalled();
      expect(mockClient2.listTools).toHaveBeenCalled();
      
      expect(connectionEvents).toContainEqual({
        serverId: 'server1',
        connected: true
      });
      expect(connectionEvents).toContainEqual({
        serverId: 'server2',
        connected: true
      });
    });

    it('should throw error if any connection fails', async () => {
      mockClient1.isConnected.mockReturnValue(true);
      mockClient2.connect.mockRejectedValue(new Error('Server2 failed'));
      
      await expect(registry.connectAll()).rejects.toThrow(ConnectionError);
    });
  });

  describe('disconnect', () => {
    beforeEach(async () => {
      registry.addServer(serverConfig1);
      registry.addServer(serverConfig2);
      
      mockClient1.isConnected.mockReturnValue(true);
      mockClient2.isConnected.mockReturnValue(true);
      
      await registry.connectAll();
      connectionEvents.length = 0; // Clear connection events from setup
    });

    it('should disconnect from specific server', async () => {
      await registry.disconnect('server1');
      
      expect(mockClient1.disconnect).toHaveBeenCalled();
      expect(connectionEvents).toContainEqual({
        serverId: 'server1',
        connected: false
      });
    });

    it('should disconnect from all servers', async () => {
      await registry.disconnectAll();
      
      expect(mockClient1.disconnect).toHaveBeenCalled();
      expect(mockClient2.disconnect).toHaveBeenCalled();
      
      expect(connectionEvents).toContainEqual({
        serverId: 'server1',
        connected: false
      });
      expect(connectionEvents).toContainEqual({
        serverId: 'server2',
        connected: false
      });
    });
  });

  describe('tool schema management', () => {
    beforeEach(async () => {
      registry.addServer(serverConfig1);
      registry.addServer(serverConfig2);
      
      mockClient1.isConnected.mockReturnValue(true);
      mockClient2.isConnected.mockReturnValue(true);
      
      await registry.connectAll();
    });

    it('should aggregate tool schemas from all servers', () => {
      const schemas = registry.getToolSchemas();
      
      expect(schemas.size).toBe(4); // tool1, tool2, shared-tool, and server2.shared-tool (conflict resolved)
      expect(schemas.has('tool1')).toBe(true);
      expect(schemas.has('tool2')).toBe(true);
      expect(schemas.has('shared-tool')).toBe(true); // First server wins
      expect(schemas.has('server2.shared-tool')).toBe(true); // Conflict resolution
    });

    it('should get schemas for specific server', () => {
      const server1Schemas = registry.getToolSchemasForServer('server1');
      
      expect(server1Schemas).toHaveLength(2);
      expect(server1Schemas.map(s => s.name)).toContain('tool1');
      expect(server1Schemas.map(s => s.name)).toContain('shared-tool');
    });

    it('should get specific tool schema', () => {
      const schema = registry.getToolSchema('tool1');
      
      expect(schema).toBeDefined();
      expect(schema?.name).toBe('tool1');
      expect(schema?.serverId).toBe('server1');
    });
  });

  describe('callTool', () => {
    beforeEach(async () => {
      registry.addServer(serverConfig1);
      registry.addServer(serverConfig2);
      
      mockClient1.isConnected.mockReturnValue(true);
      mockClient2.isConnected.mockReturnValue(true);
      
      await registry.connectAll();
    });

    it('should call tool on correct server', async () => {
      const result = await registry.callTool('tool1', { param: 'value' });
      
      expect(result).toBe('result1');
      expect(mockClient1.callTool).toHaveBeenCalledWith('tool1', { param: 'value' });
    });

    it('should throw error for non-existent tool', async () => {
      await expect(registry.callTool('non-existent', {})).rejects.toThrow(SchemaError);
    });

    it('should throw error if server is not connected', async () => {
      mockClient1.isConnected.mockReturnValue(false);
      
      await expect(registry.callTool('tool1', {})).rejects.toThrow(ConnectionError);
    });
  });

  describe('connection status', () => {
    beforeEach(() => {
      registry.addServer(serverConfig1);
      registry.addServer(serverConfig2);
    });

    it('should check server connection status', () => {
      mockClient1.isConnected.mockReturnValue(true);
      mockClient2.isConnected.mockReturnValue(false);
      
      expect(registry.isServerConnected('server1')).toBe(true);
      expect(registry.isServerConnected('server2')).toBe(false);
      expect(registry.isServerConnected('non-existent')).toBe(false);
    });

    it('should get connected servers info', async () => {
      mockClient1.isConnected.mockReturnValue(true);
      mockClient2.isConnected.mockReturnValue(false);
      
      const connectedServers = await registry.getConnectedServers();
      
      expect(connectedServers).toHaveLength(1);
      expect(connectedServers[0].id).toBe('server1');
    });
  });

  describe('event listeners', () => {
    it('should add and remove connection listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      
      registry.onConnectionChange(listener1);
      registry.onConnectionChange(listener2);
      
      registry.addServer(serverConfig1);
      
      // Trigger an event
      registry['emitConnectionEvent']({ serverId: 'server1', connected: true });
      
      expect(listener1).toHaveBeenCalledWith({ serverId: 'server1', connected: true });
      expect(listener2).toHaveBeenCalledWith({ serverId: 'server1', connected: true });
      
      // Remove one listener
      registry.removeConnectionListener(listener1);
      
      registry['emitConnectionEvent']({ serverId: 'server1', connected: false });
      
      expect(listener1).toHaveBeenCalledTimes(1); // Not called again
      expect(listener2).toHaveBeenCalledTimes(2); // Called again
    });

    it('should handle listener errors gracefully', () => {
      const errorListener = vi.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      const goodListener = vi.fn();
      
      registry.onConnectionChange(errorListener);
      registry.onConnectionChange(goodListener);
      
      // Should not throw despite listener error
      expect(() => {
        registry['emitConnectionEvent']({ serverId: 'test', connected: true });
      }).not.toThrow();
      
      expect(errorListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalled();
    });
  });
});