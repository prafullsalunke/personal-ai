import Database from 'better-sqlite3';
import path from 'path';
import { MCPServer, MCPTool } from '@/types/mcp';

// Create database file in the project root
const dbPath = path.join(process.cwd(), 'mcp-tools.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    config TEXT NOT NULL, -- JSON string
    enabled BOOLEAN DEFAULT 1,
    status TEXT DEFAULT 'disconnected',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS mcp_tools (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    input_schema TEXT NOT NULL, -- JSON string
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES mcp_servers (id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_tools_server_id ON mcp_tools (server_id);
  CREATE INDEX IF NOT EXISTS idx_tools_name ON mcp_tools (name);
`);

// Prepared statements for better performance
const insertServer = db.prepare(`
  INSERT OR REPLACE INTO mcp_servers (id, name, config, enabled, status, updated_at)
  VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
`);

const insertTool = db.prepare(`
  INSERT OR REPLACE INTO mcp_tools (id, server_id, name, description, input_schema)
  VALUES (?, ?, ?, ?, ?)
`);

const getServer = db.prepare(`
  SELECT * FROM mcp_servers WHERE id = ?
`);

const getServers = db.prepare(`
  SELECT * FROM mcp_servers ORDER BY created_at DESC
`);

const getEnabledServers = db.prepare(`
  SELECT * FROM mcp_servers WHERE enabled = 1 ORDER BY created_at DESC
`);

const getToolsByServer = db.prepare(`
  SELECT * FROM mcp_tools WHERE server_id = ?
`);

const getAllTools = db.prepare(`
  SELECT t.*, s.name as server_name, s.status as server_status
  FROM mcp_tools t
  JOIN mcp_servers s ON t.server_id = s.id
  WHERE s.enabled = 1 AND s.status = 'connected'
  ORDER BY s.name, t.name
`);

const updateServerStatus = db.prepare(`
  UPDATE mcp_servers SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
`);

const deleteServer = db.prepare(`
  DELETE FROM mcp_servers WHERE id = ?
`);

const deleteToolsByServer = db.prepare(`
  DELETE FROM mcp_tools WHERE server_id = ?
`);

// Database operations
export class MCPDatabase {
    // Server operations
    static saveServer(server: MCPServer): void {
        insertServer.run(
            server.id,
            server.name,
            JSON.stringify(server.config),
            server.enabled ? 1 : 0,
            server.status
        );
    }

    static getServer(id: string): MCPServer | null {
        const row = getServer.get(id) as {
            id: string;
            name: string;
            config: string;
            enabled: number;
            status: string;
        } | undefined;
        if (!row) return null;

        return {
            id: row.id,
            name: row.name,
            config: JSON.parse(row.config),
            enabled: Boolean(row.enabled),
            status: row.status as 'disconnected' | 'connecting' | 'connected' | 'error',
            tools: [] // Will be loaded separately
        };
    }

    static getAllServers(): MCPServer[] {
        const rows = getServers.all() as Array<{
            id: string;
            name: string;
            config: string;
            enabled: number;
            status: string;
        }>;
        return rows.map(row => ({
            id: row.id,
            name: row.name,
            config: JSON.parse(row.config),
            enabled: Boolean(row.enabled),
            status: row.status as 'disconnected' | 'connecting' | 'connected' | 'error',
            tools: [] // Will be loaded separately
        }));
    }

    static getEnabledServers(): MCPServer[] {
        const rows = getEnabledServers.all() as Array<{
            id: string;
            name: string;
            config: string;
            enabled: number;
            status: string;
        }>;
        return rows.map(row => ({
            id: row.id,
            name: row.name,
            config: JSON.parse(row.config),
            enabled: Boolean(row.enabled),
            status: row.status as 'disconnected' | 'connecting' | 'connected' | 'error',
            tools: [] // Will be loaded separately
        }));
    }

    static updateServerStatus(id: string, status: string): void {
        updateServerStatus.run(status, id);
    }

    static deleteServer(id: string): void {
        deleteToolsByServer.run(id);
        deleteServer.run(id);
    }

    // Tool operations
    static saveTools(serverId: string, tools: MCPTool[]): void {
        // Delete existing tools for this server
        deleteToolsByServer.run(serverId);

        // Insert new tools
        const insertToolTransaction = db.transaction((tools: MCPTool[]) => {
            for (const tool of tools) {
                insertTool.run(
                    `${serverId}_${tool.name}`, // Unique tool ID
                    serverId,
                    tool.name,
                    tool.description,
                    JSON.stringify(tool.inputSchema)
                );
            }
        });

        insertToolTransaction(tools);
    }

    static getToolsByServer(serverId: string): MCPTool[] {
        const rows = getToolsByServer.all(serverId) as Array<{
            name: string;
            description: string;
            input_schema: string;
        }>;
        return rows.map(row => ({
            name: row.name,
            description: row.description || '',
            inputSchema: JSON.parse(row.input_schema)
        }));
    }

    static getAllAvailableTools(): Array<MCPTool & { serverId: string; serverName: string }> {
        const rows = getAllTools.all() as Array<{
            name: string;
            description: string;
            input_schema: string;
            server_id: string;
            server_name: string;
        }>;
        return rows.map(row => ({
            name: row.name,
            description: row.description || '',
            inputSchema: JSON.parse(row.input_schema),
            serverId: row.server_id,
            serverName: row.server_name
        }));
    }

    // Utility methods
    static getServerWithTools(id: string): MCPServer | null {
        const server = this.getServer(id);
        if (!server) return null;

        server.tools = this.getToolsByServer(id);
        return server;
    }

    static getAllServersWithTools(): MCPServer[] {
        const servers = this.getAllServers();
        return servers.map(server => {
            server.tools = this.getToolsByServer(server.id);
            return server;
        });
    }

    static getEnabledServersWithTools(): MCPServer[] {
        const servers = this.getEnabledServers();
        return servers.map(server => {
            server.tools = this.getToolsByServer(server.id);
            return server;
        });
    }
}

// Close database connection on process exit
process.on('exit', () => {
    db.close();
});

process.on('SIGINT', () => {
    db.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    db.close();
    process.exit(0);
});

export default db;
