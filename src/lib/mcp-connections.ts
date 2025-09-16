import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ChildProcess } from 'child_process';

// Shared connection manager for MCP servers
class MCPConnectionManager {
    private connections = new Map<string, { client: Client; process: ChildProcess | null }>();

    setConnection(serverId: string, client: Client, process: ChildProcess | null) {
        console.log(`Setting connection for server ${serverId}`);
        this.connections.set(serverId, { client, process });
        console.log(`Connection set. Total connections: ${this.connections.size}`);
    }

    getConnection(serverId: string) {
        return this.connections.get(serverId);
    }

    deleteConnection(serverId: string) {
        const connection = this.connections.get(serverId);
        if (connection) {
            try {
                connection.client.close();
                if (connection.process) {
                    connection.process.kill();
                }
            } catch (error) {
                console.warn('Error cleaning up connection:', error);
            }
            this.connections.delete(serverId);
        }
    }

    hasConnection(serverId: string): boolean {
        return this.connections.has(serverId);
    }

    getAllConnections() {
        return this.connections;
    }
}

// Export a singleton instance
export const mcpConnectionManager = new MCPConnectionManager();
