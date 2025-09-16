"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  Settings,
  Server,
  Check,
  X,
  AlertCircle,
  ExternalLink,
  Globe,
  Terminal,
  RefreshCw,
} from "lucide-react";
import { MCPServer } from "@/types/mcp";

interface MCPConfigProps {
  onServersChange: (servers: MCPServer[]) => void;
  initialServers?: MCPServer[];
}

export function MCPConfig({
  onServersChange,
  initialServers = [],
}: MCPConfigProps) {
  const [servers, setServers] = useState<MCPServer[]>(initialServers);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingServer, setEditingServer] = useState<MCPServer | null>(null);
  const [newServer, setNewServer] = useState<Partial<MCPServer>>({
    name: "",
    config: {
      command: "",
      args: [],
      env: {},
      url: "",
      headers: {},
      transport: "stdio",
    },
    enabled: true,
    status: "disconnected",
  });

  // Load servers from backend on mount
  useEffect(() => {
    const loadServers = async () => {
      try {
        const response = await fetch("/api/mcp/servers");
        if (response.ok) {
          const data = await response.json();
          setServers(data.servers || []);
          onServersChange(data.servers || []);
        } else {
          console.error("Failed to load MCP servers from backend");
        }
      } catch (error) {
        console.error("Error loading MCP servers:", error);
      }
    };

    loadServers();
  }, [onServersChange]);

  // Notify parent when servers change
  useEffect(() => {
    onServersChange(servers);
  }, [servers, onServersChange]);


  const saveServerToDatabase = useCallback(async (server: MCPServer) => {
    try {
      const response = await fetch("/api/mcp/save-server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(server),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        console.error("Save server error:", errorData);
        throw new Error(errorData.error || "Failed to save server");
      }

      return true;
    } catch (error) {
      console.error("Save server error:", error);
      throw error;
    }
  }, []);

  const addServer = useCallback(async () => {
    const transport = newServer.config?.transport || "stdio";
    const isValid =
      transport === "stdio"
        ? newServer.name?.trim() && newServer.config?.command?.trim()
        : newServer.name?.trim() && newServer.config?.url?.trim();

    if (!isValid) return;

    const server: MCPServer = {
      id: Date.now().toString(),
      name: newServer.name?.trim() || "",
      config: {
        command: newServer.config?.command?.trim(),
        args: newServer.config?.args || [],
        env: newServer.config?.env || {},
        url: newServer.config?.url?.trim(),
        headers: newServer.config?.headers || {},
        transport: transport,
      },
      enabled: newServer.enabled ?? true,
      status: "disconnected",
      tools: [],
    };

    try {
      await saveServerToDatabase(server);
      setServers((prev) => [...prev, server]);
      setNewServer({
        name: "",
        config: {
          command: "",
          args: [],
          env: {},
          url: "",
          headers: {},
          transport: "stdio",
        },
        enabled: true,
        status: "disconnected",
      });
      setShowAddForm(false);
    } catch (error) {
      alert("Failed to save server configuration: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  }, [newServer, saveServerToDatabase]);

  const updateServer = useCallback(
    (id: string, updates: Partial<MCPServer>) => {
      setServers((prev) => {
        const updated = prev.map((server) =>
          server.id === id ? { ...server, ...updates } : server
        );

        return updated;
      });
    },
    []
  );

  // Separate function to update editing state without affecting the main servers list
  const updateEditingServer = useCallback(
    (updates: Partial<MCPServer>) => {
      if (editingServer) {
        setEditingServer((prev) => prev ? { ...prev, ...updates } : null);
      }
    },
    [editingServer]
  );

  const deleteServer = useCallback(async (id: string) => {
    try {
      const response = await fetch("/api/mcp/delete-server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId: id }),
      });

      if (response.ok) {
        setServers((prev) => prev.filter((server) => server.id !== id));
      } else {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        console.error("Delete server error:", errorData);
        alert("Failed to delete server: " + (errorData.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Delete server error:", error);
      alert("Failed to delete server: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  }, []);

  const testConnection = useCallback(
    async (server: MCPServer) => {
      updateServer(server.id, { status: "connecting" });

      try {
        const response = await fetch("/api/mcp/test-connection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(server),
        });

        if (response.ok) {
          const data = await response.json();
          updateServer(server.id, {
            status: "connected",
            tools: data.tools,
            lastChecked: new Date(),
          });
        } else {
          const errorData = await response
            .json()
            .catch(() => ({ error: "Unknown error" }));
          console.error("MCP connection error:", errorData);
          updateServer(server.id, { status: "error" });
        }
      } catch (error) {
        console.error("MCP connection error:", error);
        updateServer(server.id, { status: "error" });
      }
    },
    [updateServer]
  );

  const refreshAllConnections = useCallback(async () => {
    const enabledServers = servers.filter((server) => server.enabled);

    // Test all enabled servers in parallel
    const refreshPromises = enabledServers.map((server) =>
      testConnection(server)
    );
    await Promise.allSettled(refreshPromises);
  }, [servers, testConnection]);

  const getStatusIcon = (status: MCPServer["status"]) => {
    switch (status) {
      case "connected":
        return <Check className="w-4 h-4 text-green-500" />;
      case "connecting":
        return (
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        );
      case "error":
        return <X className="w-4 h-4 text-red-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: MCPServer["status"]) => {
    switch (status) {
      case "connected":
        return "bg-green-50 border-green-200";
      case "connecting":
        return "bg-blue-50 border-blue-200";
      case "error":
        return "bg-red-50 border-red-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-slate-600" />
          <h3 className="text-lg font-semibold text-slate-800">MCP Servers</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshAllConnections}
            className="flex items-center gap-2 px-3 py-2 bg-slate-500 text-white rounded-lg hover:bg-slate-600 transition-colors"
            title="Refresh all connections"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Server
          </button>
        </div>
      </div>

      {/* Add/Edit Form */}
      {(showAddForm || editingServer) && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-slate-800">
              {editingServer ? "Edit MCP Server" : "Add New MCP Server"}
            </h4>
            <button
              onClick={() => {
                setShowAddForm(false);
                setEditingServer(null);
                setNewServer({
                  name: "",
                  config: {
                    command: "",
                    args: [],
                    env: {},
                    transport: "stdio",
                  },
                  enabled: true,
                  status: "disconnected",
                });
              }}
              className="text-slate-400 hover:text-slate-600"
              title="Close form"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Server Name
              </label>
              <input
                type="text"
                value={editingServer?.name || newServer.name || ""}
                onChange={(e) => {
                  const value = e.target.value;
                  if (editingServer) {
                    updateEditingServer({ name: value });
                  } else {
                    setNewServer((prev) => ({ ...prev, name: value }));
                  }
                }}
                placeholder="zerodha"
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Transport Type
              </label>
              <select
                value={
                  editingServer?.config?.transport ||
                  newServer.config?.transport ||
                  "stdio"
                }
                onChange={(e) => {
                  const value = e.target.value as "stdio" | "sse";
                  if (editingServer) {
                    updateEditingServer({
                      config: { ...editingServer.config, transport: value },
                    });
                  } else {
                    setNewServer((prev) => ({
                      ...prev,
                      config: { ...prev.config!, transport: value },
                    }));
                  }
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Transport Type"
              >
                <option value="stdio">STDIO (Default)</option>
                <option value="sse">SSE (Server-Sent Events)</option>
              </select>
            </div>
          </div>

          <div className="space-y-4">
            {/* STDIO Transport Fields */}
            {(editingServer?.config?.transport ||
              newServer.config?.transport ||
              "stdio") === "stdio" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Command
                  </label>
                  <input
                    type="text"
                    value={
                      editingServer?.config?.command ||
                      newServer.config?.command ||
                      ""
                    }
                    onChange={(e) => {
                      const value = e.target.value;
                      if (editingServer) {
                        updateEditingServer({
                          config: { ...editingServer.config, command: value },
                        });
                      } else {
                        setNewServer((prev) => ({
                          ...prev,
                          config: { ...prev.config!, command: value },
                        }));
                      }
                    }}
                    placeholder="/Users/prafull/.nvm/versions/node/v20.17.0/bin/bun"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Arguments (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={
                      editingServer?.config?.args?.join(", ") ||
                      newServer.config?.args?.join(", ") ||
                      ""
                    }
                    onChange={(e) => {
                      const value = e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean);
                      if (editingServer) {
                        updateEditingServer({
                          config: { ...editingServer.config, args: value },
                        });
                      } else {
                        setNewServer((prev) => ({
                          ...prev,
                          config: { ...prev.config!, args: value },
                        }));
                      }
                    }}
                    placeholder="/Users/prafull/work/repos/zerodha/index.ts"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Environment Variables (JSON format)
                  </label>
                  <textarea
                    value={JSON.stringify(
                      editingServer?.config?.env || newServer.config?.env || {},
                      null,
                      2
                    )}
                    onChange={(e) => {
                      try {
                        const value = JSON.parse(e.target.value);
                        if (editingServer) {
                          updateEditingServer({
                            config: { ...editingServer.config, env: value },
                          });
                        } else {
                          setNewServer((prev) => ({
                            ...prev,
                            config: { ...prev.config!, env: value },
                          }));
                        }
                      } catch {
                        // Invalid JSON, ignore
                      }
                    }}
                    placeholder='{"API_KEY": "your-api-key", "ACCESS_TOKEN": "your-token"}'
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    rows={4}
                  />
                </div>
              </>
            )}

            {/* SSE Transport Fields */}
            {(editingServer?.config?.transport ||
              newServer.config?.transport ||
              "stdio") === "sse" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    URL
                  </label>
                  <input
                    type="text"
                    value={
                      editingServer?.config?.url || newServer.config?.url || ""
                    }
                    onChange={(e) => {
                      const value = e.target.value;
                      if (editingServer) {
                        updateEditingServer({
                          config: { ...editingServer.config, url: value },
                        });
                      } else {
                        setNewServer((prev) => ({
                          ...prev,
                          config: { ...prev.config!, url: value },
                        }));
                      }
                    }}
                    placeholder="https://dev.gupshup.io/convomate-ai/sse"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Headers (JSON format)
                  </label>
                  <textarea
                    value={JSON.stringify(
                      editingServer?.config?.headers ||
                        newServer.config?.headers ||
                        {},
                      null,
                      2
                    )}
                    onChange={(e) => {
                      try {
                        const value = JSON.parse(e.target.value);
                        if (editingServer) {
                          updateEditingServer({
                            config: { ...editingServer.config, headers: value },
                          });
                        } else {
                          setNewServer((prev) => ({
                            ...prev,
                            config: { ...prev.config!, headers: value },
                          }));
                        }
                      } catch {
                        // Invalid JSON, ignore
                      }
                    }}
                    placeholder='{"Authorization": "Bearer your-token"}'
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    rows={4}
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={editingServer?.enabled ?? newServer.enabled ?? true}
                onChange={(e) => {
                  const value = e.target.checked;
                  if (editingServer) {
                    updateEditingServer({ enabled: value });
                  } else {
                    setNewServer((prev) => ({ ...prev, enabled: value }));
                  }
                }}
                className="rounded"
              />
              <span className="text-sm text-slate-700">Enabled</span>
            </label>
          </div>

          <div className="flex gap-2">
            <button
              onClick={editingServer ? async () => {
                try {
                  await saveServerToDatabase(editingServer);
                  setServers((prev) => prev.map(server =>
                    server.id === editingServer.id ? editingServer : server
                  ));
                  setEditingServer(null);
                } catch (error) {
                  alert("Failed to save server configuration: " + (error instanceof Error ? error.message : "Unknown error"));
                }
              } : addServer}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              {editingServer ? "Save Changes" : "Add Server"}
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setEditingServer(null);
                setNewServer({
                  name: "",
                  config: {
                    command: "",
                    args: [],
                    env: {},
                    transport: "stdio",
                  },
                  enabled: true,
                  status: "disconnected",
                });
              }}
              className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Server List */}
      <div className="space-y-3">
        {servers.map((server) => (
          <div
            key={server.id}
            className={`border rounded-lg p-4 ${getStatusColor(server.status)}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {server.config.transport === "sse" ? (
                  <Globe className="w-5 h-5 text-slate-600" />
                ) : (
                  <Terminal className="w-5 h-5 text-slate-600" />
                )}
                <div>
                  <h4 className="font-medium text-slate-800">{server.name}</h4>
                  <p className="text-sm text-slate-600">
                    {server.config.transport === "sse"
                      ? server.config.url
                      : `${server.config.command} ${
                          server.config.args?.join(" ") || ""
                        }`}
                  </p>
                  <p className="text-xs text-slate-500">
                    Transport:{" "}
                    {server.config.transport?.toUpperCase() || "STDIO"}
                  </p>
                  {server.tools && server.tools.length > 0 && (
                    <div className="mt-1">
                      <p className="text-xs text-slate-500">
                        {server.tools.length} tool
                        {server.tools.length !== 1 ? "s" : ""} available:
                      </p>
                      <p className="text-xs text-slate-600 font-medium">
                        {server.tools.map((tool) => tool.name).join(", ")}
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusIcon(server.status)}
                <button
                  onClick={() => testConnection(server)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                  title="Test Connection"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setEditingServer(server)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                  title="Edit Server"
                >
                  <Settings className="w-4 h-4" />
                </button>
                <button
                  onClick={() => deleteServer(server.id)}
                  className="p-1 text-slate-400 hover:text-red-600"
                  title="Delete Server"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {servers.length === 0 && (
        <div className="text-center py-8 text-slate-500">
          <Server className="w-12 h-12 mx-auto mb-4 text-slate-300" />
          <p>No MCP servers configured</p>
          <p className="text-sm">Add a server to enable MCP tools</p>
        </div>
      )}
    </div>
  );
}
