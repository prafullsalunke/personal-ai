"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useChat } from "@ai-sdk/react";
import {
  ArrowUp,
  Loader2,
  Copy,
  Check,
  Trash2,
  Sparkles,
  Settings,
  ChevronDown,
} from "lucide-react";
import { VoiceRecorder } from "@/components/voice-recorder";
import { Confetti } from "@/components/confetti";
import { ToastContainer, useToast } from "@/components/toast";
import { MCPConfig } from "@/components/mcp-config";
import { MCPServer } from "@/types/mcp";
import {
  TypingIndicator,
  ButtonTypingIndicator,
} from "@/components/skeleton-loader";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import * as Accordion from "@radix-ui/react-accordion";

interface QueuedMessage {
  id: string;
  text: string;
  timestamp: number;
}

interface MessagePart {
  type: string;
  text?: string;
  toolName?: string;
  result?: string | object;
  output?: unknown;
}

interface UIMessageWithParts {
  id: string;
  role: string;
  content?: string;
  parts?: MessagePart[];
}

// Custom code block component with copy functionality
interface CodeBlockProps {
  children: React.ReactNode;
  className?: string;
}

const CodeBlock = ({ children, className }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);

  // Extract the actual string content from children
  const codeContent = String(children).replace(/\n$/, "");

  // Extract language from className (e.g., "language-javascript" -> "javascript")
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "text";

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(codeContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="relative group">
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{
          margin: 0,
          borderRadius: "8px",
          fontSize: "14px",
          lineHeight: "1.5",
        }}
        codeTagProps={{
          style: {
            fontFamily: "var(--font-geist-mono), 'Courier New', monospace",
          },
        }}
      >
        {codeContent}
      </SyntaxHighlighter>
      <button
        onClick={copyToClipboard}
        className="absolute top-3 right-3 p-2 bg-gray-800/90 hover:bg-gray-800 border border-gray-600 hover:border-gray-500 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center gap-1 cursor-pointer hover:scale-105 hover:shadow-md active:scale-95"
        title="Copy code"
      >
        {copied ? (
          <>
            <Check className="w-4 h-4 text-green-400" />
            <span className="text-xs text-green-400 font-medium">Copied!</span>
          </>
        ) : (
          <>
            <Copy className="w-4 h-4 text-gray-300" />
            <span className="text-xs text-gray-300 font-medium">Copy</span>
          </>
        )}
      </button>
    </div>
  );
};

export default function Page() {
  const [useOpenAI, setUseOpenAI] = useState(false);

  // AI SDK hook (only used when useOpenAI is false)
  const aiSdkChat = useChat({
    id: "ai-sdk-chat",
  });

  // Custom OpenAI state management
  const [openAIMessages, setOpenAIMessages] = useState<
    Array<{ id: string; role: string; content: string }>
  >([]);
  const [openAIStatus, setOpenAIStatus] = useState<"idle" | "loading">("idle");
  const [openAIError, setOpenAIError] = useState<Error | undefined>();

  // Custom OpenAI send function
  const sendOpenAIMessage = useCallback(
    async (message: { role: string; content: string }) => {
      setOpenAIStatus("loading");
      setOpenAIError(undefined);

      // Add user message immediately
      const userMessage = { ...message, id: `user-${Date.now()}` };
      setOpenAIMessages((prev) => [...prev, userMessage]);

      try {
        const response = await fetch("/api/chat-openai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [...openAIMessages, userMessage] }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let assistantContent = "";

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            // Parse AI SDK streaming format
            const lines = chunk.split("\n").filter((line) => line.trim());
            for (const line of lines) {
              if (line.startsWith('0:"')) {
                const content = line.slice(3, -1).replace(/\\"/g, '"');
                assistantContent += content;
              }
            }
          }
        }

        // Add assistant response
        const assistantMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: assistantContent,
        };
        setOpenAIMessages((prev) => [...prev, assistantMessage]);
      } catch (error) {
        console.error("OpenAI API error:", error);
        setOpenAIError(
          error instanceof Error ? error : new Error("Unknown error")
        );
      } finally {
        setOpenAIStatus("idle");
      }
    },
    [openAIMessages]
  );

  // Conditional hook usage
  const messages = useOpenAI ? openAIMessages : aiSdkChat.messages;
  const status = useOpenAI ? openAIStatus : aiSdkChat.status;
  const error = useOpenAI ? openAIError : aiSdkChat.error;
  const setMessages = useOpenAI ? setOpenAIMessages : aiSdkChat.setMessages;

  // Clear messages when switching APIs
  useEffect(() => {
    if (useOpenAI) {
      setOpenAIMessages([]);
    } else {
      aiSdkChat.setMessages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useOpenAI]);
  const [input, setInput] = useState("");
  const [messageQueue, setMessageQueue] = useState<QueuedMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isUserTyping, setIsUserTyping] = useState(false);
  const [messageAnimation, setMessageAnimation] = useState<string | null>(null);
  const [isImproving, setIsImproving] = useState(false);
  const [inputHeight, setInputHeight] = useState(48);
  const [isClient, setIsClient] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [isReplacingText, setIsReplacingText] = useState(false);
  const [fadeInText, setFadeInText] = useState(false);
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [showMCPConfig, setShowMCPConfig] = useState(false);
  const [mcpConfigLoading, setMcpConfigLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toasts, removeToast, error: showError } = useToast();

  const refreshMCPConnections = useCallback(async () => {
    // Load servers from backend and refresh their connections
    try {
      const response = await fetch("/api/mcp/servers");
      if (response.ok) {
        const data = await response.json();
        const servers = data.servers || [];
        setMcpServers(servers);

        // Refresh all enabled servers
        const enabledServers = servers.filter(
          (server: MCPServer) => server.enabled
        );
        const refreshPromises = enabledServers.map(
          async (server: MCPServer) => {
            try {
              const response = await fetch("/api/mcp/test-connection", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(server),
              });

              if (response.ok) {
                const data = await response.json();
                return {
                  ...server,
                  status: "connected" as const,
                  tools: data.tools,
                  lastChecked: new Date(),
                };
              } else {
                return { ...server, status: "error" as const };
              }
            } catch {
              return { ...server, status: "error" as const };
            }
          }
        );

        const updatedServers = await Promise.allSettled(refreshPromises);
        const newServers = updatedServers.map((result, index) =>
          result.status === "fulfilled" ? result.value : servers[index]
        );

        setMcpServers(newServers);

        // Update the database with the new connection statuses
        for (const server of newServers) {
          try {
            await fetch("/api/mcp/save-server", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(server),
            });
          } catch (error) {
            console.warn(
              "Failed to save server status for",
              server.name,
              error
            );
          }
        }
      } else {
        console.error("Failed to load servers from backend");
      }
    } catch (error) {
      console.error("Failed to refresh MCP connections:", error);
    }
  }, []);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setMessageQueue([]);
    localStorage.removeItem("chat-messages");
  }, [setMessages]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);

      // Typing detection
      setIsUserTyping(true);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        setIsUserTyping(false);
      }, 1000);
    },
    []
  );

  // Auto-resize textarea when input changes
  useEffect(() => {
    if (textareaRef.current) {
      const target = textareaRef.current;
      const currentHeight = target.style.height;
      target.style.height = "auto";
      const newHeight = Math.max(
        48,
        Math.min(target.scrollHeight, isClient ? window.innerHeight * 0.4 : 200)
      );

      // Only update if height actually changed
      if (currentHeight !== `${newHeight}px`) {
        setInputHeight(newHeight);
        target.style.height = `${newHeight}px`;
      }
    }
  }, [input, isClient]);

  const improvePrompt = useCallback(async () => {
    if (!input.trim() || isImproving || isReplacingText) return;

    const originalPrompt = input.trim();
    setIsImproving(true);

    try {
      const response = await fetch("/api/enhance-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: originalPrompt,
        }),
      });

      if (response.ok) {
        const data = await response.json();

        if (data.success && data.enhancedPrompt) {
          // Start the replacement animation
          setIsReplacingText(true);

          // Clear input first
          setInput("");

          // Trigger confetti
          setShowConfetti(true);

          // Set the enhanced prompt and trigger fade-in
          setTimeout(() => {
            setInput(data.enhancedPrompt);
            setFadeInText(true);

            // Complete the animation
            setTimeout(() => {
              setIsReplacingText(false);
              setFadeInText(false);
            }, 1000);
          }, 300);
        } else {
          throw new Error(data.error || "No enhanced prompt received");
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to enhance prompt");
      }
    } catch (error) {
      console.error("Failed to improve prompt:", error);
      // Restore original input on error
      setInput(originalPrompt);
      setIsReplacingText(false);
      setFadeInText(false);
    } finally {
      setIsImproving(false);
    }
  }, [input, isImproving, isReplacingText]);

  const handleVoiceTranscription = useCallback((transcription: string) => {
    // Add the transcribed text to the input
    setInput((prev) => prev + (prev ? " " : "") + transcription);
  }, []);

  const handleVoiceError = useCallback(
    (error: string) => {
      showError("Transcription Failed", error);
    },
    [showError]
  );

  const handleMCPServersChange = useCallback((servers: MCPServer[]) => {
    setMcpServers(servers);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, messageQueue, scrollToBottom]);

  // Set client-side flag and load messages from localStorage on mount
  useEffect(() => {
    setIsClient(true);
    if (typeof window !== "undefined") {
      const savedMessages = localStorage.getItem("chat-messages");
      if (savedMessages) {
        try {
          const parsedMessages = JSON.parse(savedMessages);
          if (parsedMessages.length > 0) {
            setMessages(parsedMessages);
          }
        } catch (error) {
          console.error("Failed to load saved messages:", error);
        }
      }
    }
  }, [setMessages]);

  // Persist messages to localStorage
  useEffect(() => {
    if (typeof window !== "undefined" && messages.length > 0) {
      localStorage.setItem("chat-messages", JSON.stringify(messages));
    }
  }, [messages]);

  // Process message queue when AI is ready
  useEffect(() => {
    if (status === "ready" && messageQueue.length > 0) {
      const nextMessage = messageQueue[0];
      setMessageQueue((prev) => prev.slice(1));
      aiSdkChat.sendMessage({ text: nextMessage.text });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, messageQueue]);

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!input.trim()) return;

      const messageText = input.trim();

      // Add send animation
      setIsSending(true);
      setIsUserTyping(false);
      const messageId = Date.now().toString();
      setMessageAnimation(messageId);

      // Clear input with animation
      setInput("");

      // Reset animations after delay
      setTimeout(() => {
        setIsSending(false);
        setMessageAnimation(null);
      }, 600);

      if (status === "ready") {
        // Send immediately if AI is ready
        if (useOpenAI) {
          sendOpenAIMessage({ role: "user", content: messageText });
        } else {
          aiSdkChat.sendMessage({ text: messageText });
        }
      } else {
        // Add to queue if AI is busy
        const queuedMessage: QueuedMessage = {
          id: messageId,
          text: messageText,
          timestamp: Date.now(),
        };
        setMessageQueue((prev) => [...prev, queuedMessage]);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input, status, sendOpenAIMessage, useOpenAI]
  );

  // Memoize message rendering to prevent unnecessary re-renders
  const renderedMessages = useMemo(
    () =>
      messages.map((message, messageIndex) => (
        <div key={message.id}>
          {/* Message separator */}
          {messageIndex > 0 && (
            <div className="px-4 md:px-6">
              <div className="max-w-4xl mx-auto">
                <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent my-4"></div>
              </div>
            </div>
          )}
          <div
            className={`px-4 py-6 md:px-6 md:py-3 transition-all duration-300 ease-out ${
              message.role === "assistant" ? "bg-slate-50/80" : ""
            } ${messageAnimation === message.id ? "animate-pulse" : ""}`}
          >
            <div className="flex gap-4 md:gap-6">
              <div className="flex-shrink-0">
                {message.role === "user" ? (
                  <div className="w-8 h-8 md:w-9 md:h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 border-2 border-white/20">
                    <div className="w-3 h-3 md:w-4 md:h-4 bg-white rounded-full opacity-90"></div>
                  </div>
                ) : (
                  <div className="w-8 h-8 md:w-9 md:h-9 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 border-2 border-white/20 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-300/30 to-cyan-400/30 rounded-full"></div>
                    <div className="w-2 h-2 md:w-2.5 md:h-2.5 bg-white rounded-full relative z-10"></div>
                    <div className="absolute top-1 right-1 w-1 h-1 bg-white/60 rounded-full animate-pulse"></div>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="prose prose-slate max-w-none">
                  {(message as UIMessageWithParts).parts?.map(
                    (part: MessagePart, index: number) => {
                      // text parts:
                      if (part.type === "text") {
                        return (
                          <div key={index}>
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={
                                {
                                  code: ({ className, children, ...props }) => {
                                    // If there's a className with language-, it's a code block
                                    const isCodeBlock =
                                      className &&
                                      className.startsWith("language-");

                                    if (!isCodeBlock) {
                                      return (
                                        <code
                                          className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-sm font-mono"
                                          {...props}
                                        >
                                          {children}
                                        </code>
                                      );
                                    }
                                    return (
                                      <CodeBlock className={className}>
                                        {children}
                                      </CodeBlock>
                                    );
                                  },
                                } as Components
                              }
                            >
                              {part.text}
                            </ReactMarkdown>
                            {/* Gradient separator bar */}
                            {index <
                              ((message as UIMessageWithParts).parts?.length ||
                                1) -
                                1 && (
                              <div className="my-6 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent"></div>
                            )}
                          </div>
                        );
                      }

                      // reasoning parts:
                      if (part.type === "reasoning") {
                        return (
                          <div key={index}>
                            <details className="mt-4 mb-4">
                              <summary className="cursor-pointer text-sm font-medium text-slate-600 hover:text-slate-800 mb-2">
                                🧠 View reasoning process
                              </summary>
                              <pre className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap">
                                {part.text}
                              </pre>
                            </details>
                            {/* Gradient separator bar */}
                            {index <
                              ((message as UIMessageWithParts).parts?.length ||
                                1) -
                                1 && (
                              <div className="my-6 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent"></div>
                            )}
                          </div>
                        );
                      }

                      // tool call parts (legacy format):
                      if (part.type === "tool-call") {
                        const toolId = `${message.id}-legacy-tool-${index}`;
                        const toolName =
                          (part as { toolName?: string }).toolName || "Unknown";

                        return (
                          <div key={index} className="my-4">
                            <Accordion.Root type="single" collapsible>
                              <Accordion.Item
                                value={toolId}
                                className="bg-blue-50 border border-blue-200 rounded-lg"
                              >
                                <Accordion.Trigger className="w-full flex items-center justify-between p-4 hover:bg-blue-100 transition-colors rounded-lg group">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                    <span className="text-sm font-medium text-blue-800">
                                      Tool: {toolName}
                                    </span>
                                  </div>
                                  <ChevronDown className="w-4 h-4 text-blue-600 transition-transform group-data-[state=open]:rotate-180" />
                                </Accordion.Trigger>
                                <Accordion.Content className="px-4 pb-4 border-t border-blue-200">
                                  <div className="mt-3">
                                    {(part as { result?: string | object })
                                      .result && (
                                      <>
                                        {typeof (
                                          part as { result?: string | object }
                                        ).result === "string" ? (
                                          <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={
                                              {
                                                code: ({
                                                  className,
                                                  children,
                                                  ...props
                                                }) => {
                                                  const isCodeBlock =
                                                    className &&
                                                    className.startsWith(
                                                      "language-"
                                                    );
                                                  if (!isCodeBlock) {
                                                    return (
                                                      <code
                                                        className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-sm font-mono"
                                                        {...props}
                                                      >
                                                        {children}
                                                      </code>
                                                    );
                                                  }
                                                  return (
                                                    <CodeBlock
                                                      className={className}
                                                    >
                                                      {children}
                                                    </CodeBlock>
                                                  );
                                                },
                                              } as Components
                                            }
                                          >
                                            {String(
                                              (
                                                part as {
                                                  result?: string | object;
                                                }
                                              ).result
                                            )}
                                          </ReactMarkdown>
                                        ) : (
                                          <div>
                                            {typeof (
                                              part as {
                                                result?: string | object;
                                              }
                                            ).result === "object" ? (
                                              <pre className="text-xs text-blue-700 overflow-x-auto whitespace-pre-wrap bg-blue-25 p-2 rounded">
                                                {JSON.stringify(
                                                  (
                                                    part as {
                                                      result?: string | object;
                                                    }
                                                  ).result,
                                                  null,
                                                  2
                                                )}
                                              </pre>
                                            ) : (
                                              <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={
                                                  {
                                                    code: ({
                                                      className,
                                                      children,
                                                      ...props
                                                    }) => {
                                                      const isCodeBlock =
                                                        className &&
                                                        className.startsWith(
                                                          "language-"
                                                        );
                                                      if (!isCodeBlock) {
                                                        return (
                                                          <code
                                                            className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-sm font-mono"
                                                            {...props}
                                                          >
                                                            {children}
                                                          </code>
                                                        );
                                                      }
                                                      return (
                                                        <CodeBlock
                                                          className={className}
                                                        >
                                                          {children}
                                                        </CodeBlock>
                                                      );
                                                    },
                                                  } as Components
                                                }
                                              >
                                                {String(
                                                  (
                                                    part as {
                                                      result?: string | object;
                                                    }
                                                  ).result
                                                )}
                                              </ReactMarkdown>
                                            )}
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </Accordion.Content>
                              </Accordion.Item>
                            </Accordion.Root>
                            {/* Gradient separator bar */}
                            {index <
                              ((message as UIMessageWithParts).parts?.length ||
                                1) -
                                1 && (
                              <div className="my-6 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent"></div>
                            )}
                          </div>
                        );
                      }

                      // Handle new AI SDK tool format (tool-{toolName}):
                      if (part.type && part.type.startsWith("tool-")) {
                        const toolId = `${message.id}-sdk-tool-${index}`;
                        const toolName = part.type.replace("tool-", "");

                        // Extract text content from tool output
                        let textContent = "";

                        if (
                          typeof (part as { output?: unknown }).output ===
                          "string"
                        ) {
                          textContent =
                            (part as { output?: string }).output || "";
                        } else if (
                          Array.isArray((part as { output?: unknown }).output)
                        ) {
                          // Handle array format like [{"type": "text", "text": "..."}]
                          textContent = (
                            (
                              part as {
                                output?: Array<{ type: string; text?: string }>;
                              }
                            ).output || []
                          )
                            .filter(
                              (item) =>
                                item &&
                                typeof item === "object" &&
                                item.type === "text"
                            )
                            .map((item) => item.text || "")
                            .join("");
                        } else if (
                          (part as { output?: unknown }).output &&
                          typeof (part as { output?: unknown }).output ===
                            "object" &&
                          (part as { output?: unknown }).output !== null &&
                          "text" in
                            ((part as { output?: unknown }).output as object)
                        ) {
                          // Handle single object format like {"type": "text", "text": "..."}
                          textContent = String(
                            (part as { output?: { text?: string } }).output
                              ?.text || ""
                          );
                        } else if (
                          (part as { output?: unknown }).output &&
                          typeof (part as { output?: unknown }).output ===
                            "object"
                        ) {
                          // Handle raw object output - convert to readable format
                          try {
                            textContent = JSON.stringify(
                              (part as { output?: unknown }).output,
                              null,
                              2
                            );
                          } catch {
                            textContent = String(
                              (part as { output?: unknown }).output
                            );
                          }
                        }

                        return (
                          <div key={index} className="my-4">
                            <Accordion.Root type="single" collapsible>
                              <Accordion.Item
                                value={toolId}
                                className="bg-blue-50 border border-blue-200 rounded-lg"
                              >
                                <Accordion.Trigger className="w-full flex items-center justify-between p-4 hover:bg-blue-100 transition-colors rounded-lg group">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                    <span className="text-sm font-medium text-blue-800">
                                      Tool: {toolName}
                                    </span>
                                  </div>
                                  <ChevronDown className="w-4 h-4 text-blue-600 transition-transform group-data-[state=open]:rotate-180" />
                                </Accordion.Trigger>
                                <Accordion.Content className="px-4 pb-4 border-t border-blue-200">
                                  <div className="mt-3">
                                    {textContent ? (
                                      <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        components={
                                          {
                                            code: ({
                                              className,
                                              children,
                                              ...props
                                            }) => {
                                              const isCodeBlock =
                                                className &&
                                                className.startsWith(
                                                  "language-"
                                                );
                                              if (!isCodeBlock) {
                                                return (
                                                  <code
                                                    className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-sm font-mono"
                                                    {...props}
                                                  >
                                                    {children}
                                                  </code>
                                                );
                                              }
                                              return (
                                                <CodeBlock
                                                  className={className}
                                                >
                                                  {children}
                                                </CodeBlock>
                                              );
                                            },
                                          } as Components
                                        }
                                      >
                                        {textContent}
                                      </ReactMarkdown>
                                    ) : (
                                      <pre className="text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap bg-slate-50 p-2 rounded">
                                        {JSON.stringify(
                                          (part as { output?: unknown }).output,
                                          null,
                                          2
                                        )}
                                      </pre>
                                    )}
                                  </div>
                                </Accordion.Content>
                              </Accordion.Item>
                            </Accordion.Root>
                            {/* Gradient separator bar */}
                            {index <
                              ((message as UIMessageWithParts).parts?.length ||
                                1) -
                                1 && (
                              <div className="my-6 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent"></div>
                            )}
                          </div>
                        );
                      }

                      // Skip step-start and other control parts silently
                      if (part.type === "step-start") {
                        return null;
                      }

                      // Log truly unhandled parts for debugging, but don't render them
                      return null;
                    }
                  )}

                  {/* Fallback for messages without parts or with empty parts */}
                  {(!(message as UIMessageWithParts).parts ||
                    (message as UIMessageWithParts).parts?.length === 0) &&
                    (message as { content?: string | object }).content && (
                      <div>
                        {typeof (message as { content?: string | object })
                          .content === "string" ? (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={
                              {
                                code: ({ className, children, ...props }) => {
                                  const isCodeBlock =
                                    className &&
                                    className.startsWith("language-");
                                  if (!isCodeBlock) {
                                    return (
                                      <code
                                        className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-sm font-mono"
                                        {...props}
                                      >
                                        {children}
                                      </code>
                                    );
                                  }
                                  return (
                                    <CodeBlock className={className}>
                                      {children}
                                    </CodeBlock>
                                  );
                                },
                              } as Components
                            }
                          >
                            {String(
                              (message as { content?: string | object }).content
                            )}
                          </ReactMarkdown>
                        ) : (
                          <p>
                            {String(
                              (message as { content?: string | object }).content
                            )}
                          </p>
                        )}
                      </div>
                    )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )),
    [messages, messageAnimation]
  );

  const renderedQueuedMessages = useMemo(
    () =>
      messageQueue.map((queuedMessage) => (
        <div
          key={queuedMessage.id}
          className="px-4 py-6 md:px-6 md:py-8 bg-white"
        >
          <div className="flex gap-4 md:gap-6">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 md:w-9 md:h-9 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center shadow-lg border-2 border-white/20 opacity-60">
                <div className="w-3 h-3 md:w-4 md:h-4 bg-white rounded-full opacity-90"></div>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">
                  Queued
                </span>
                <Loader2 className="w-3 h-3 text-amber-600 animate-spin" />
              </div>
              <div className="prose prose-slate max-w-none opacity-70">
                <p>{queuedMessage.text}</p>
              </div>
            </div>
          </div>
        </div>
      )),
    [messageQueue]
  );

  return (
    <>
      <Confetti
        trigger={showConfetti}
        onComplete={() => setShowConfetti(false)}
      />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div
        className="flex flex-col h-screen"
        style={{ background: "var(--background)" }}
      >
        {/* Header */}
        <div
          className="border-b border-slate-200 px-4 py-4 md:px-6 md:py-5"
          style={{ background: "var(--chat-bg)" }}
        >
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-slate-800">Nexus AI</h1>
              {messageQueue.length > 0 && (
                <p className="text-sm text-slate-500 mt-1">
                  {messageQueue.length} message
                  {messageQueue.length > 1 ? "s" : ""} queued
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setUseOpenAI(!useOpenAI)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 ${
                  useOpenAI
                    ? "bg-green-100 text-green-700 hover:bg-green-200"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
                title={`Currently using: ${
                  useOpenAI ? "OpenAI Native" : "AI SDK"
                }`}
              >
                {useOpenAI ? "OpenAI" : "AI SDK"}
              </button>
              <button
                onClick={async () => {
                  if (!showMCPConfig) {
                    // Open immediately and show loading
                    setShowMCPConfig(true);
                    setMcpConfigLoading(true);
                    await refreshMCPConnections();
                    setMcpConfigLoading(false);
                  } else {
                    setShowMCPConfig(false);
                  }
                }}
                className={`p-2 rounded-lg transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95 ${
                  showMCPConfig
                    ? "text-blue-600 bg-blue-100 hover:text-blue-700 hover:bg-blue-200"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                }`}
                title="MCP Settings & Refresh"
              >
                <Settings className="w-5 h-5" />
              </button>
              {messages.length > 0 && (
                <button
                  onClick={clearConversation}
                  className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95"
                  title="Clear conversation"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* MCP Configuration Panel */}
        {showMCPConfig && (
          <div className="border-b border-slate-200 px-4 py-4 md:px-6 md:py-5 bg-slate-50">
            <div className="max-w-4xl mx-auto">
              {mcpConfigLoading ? (
                <div className="space-y-4">
                  {/* Header skeleton */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 bg-slate-300 rounded animate-pulse"></div>
                      <div className="h-6 w-32 bg-slate-300 rounded animate-pulse"></div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-10 w-20 bg-slate-300 rounded-lg animate-pulse"></div>
                      <div className="h-10 w-28 bg-slate-300 rounded-lg animate-pulse"></div>
                    </div>
                  </div>

                  {/* Server list skeleton */}
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div
                        key={index}
                        className="border rounded-lg p-4 bg-white"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-5 h-5 bg-slate-300 rounded animate-pulse"></div>
                            <div className="space-y-2">
                              <div className="h-4 w-24 bg-slate-300 rounded animate-pulse"></div>
                              <div className="h-3 w-48 bg-slate-200 rounded animate-pulse"></div>
                              <div className="h-3 w-32 bg-slate-200 rounded animate-pulse"></div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 bg-slate-300 rounded-full animate-pulse"></div>
                            <div className="w-8 h-8 bg-slate-300 rounded animate-pulse"></div>
                            <div className="w-8 h-8 bg-slate-300 rounded animate-pulse"></div>
                            <div className="w-8 h-8 bg-slate-300 rounded animate-pulse"></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <MCPConfig
                  onServersChange={handleMCPServersChange}
                  initialServers={mcpServers}
                />
              )}
            </div>
          </div>
        )}

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 && messageQueue.length === 0 ? (
            <div className="flex items-center justify-center h-full px-4">
              <div className="text-center max-w-md">
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg border-4 border-white/20 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-300/30 to-cyan-400/30 rounded-full animate-pulse"></div>
                  <div className="w-4 h-4 bg-white rounded-full relative z-10"></div>
                  <div className="absolute top-2 right-2 w-2 h-2 bg-white/60 rounded-full animate-pulse"></div>
                </div>
                <h2 className="text-2xl font-semibold text-slate-700 mb-3">
                  How can I help you today?
                </h2>
                <p className="text-slate-500 leading-relaxed">
                  Start a conversation by typing your message below. I&apos;m
                  here to assist you with any questions or tasks.
                </p>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto">
              {/* Regular Messages */}
              {renderedMessages}

              {/* Queued Messages */}
              {renderedQueuedMessages}

              {/* Error Display */}
              {error && (
                <div className="px-4 py-6 md:px-6 md:py-8 bg-red-50/80">
                  <div className="flex gap-4 md:gap-6">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 md:w-9 md:h-9 bg-gradient-to-br from-red-500 to-rose-600 rounded-full flex items-center justify-center shadow-lg border-2 border-white/20 relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-red-400/30 to-rose-500/30 rounded-full"></div>
                        <div className="w-2 h-2 md:w-2.5 md:h-2.5 bg-white rounded-full relative z-10"></div>
                        <div className="absolute top-1 right-1 w-1 h-1 bg-white/60 rounded-full"></div>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="bg-red-100 border border-red-200 rounded-lg p-4">
                        <h4 className="text-sm font-medium text-red-800 mb-2">
                          ⚠️ Something went wrong
                        </h4>
                        <p className="text-sm text-red-700">
                          {error.message ||
                            "An error occurred while processing your request. Please try again."}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Modern Skeleton Loading */}
              {status !== "ready" && !error && (
                <div className="px-4 py-6 md:px-6 md:py-8 bg-slate-50/80">
                  <TypingIndicator />
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div
          className="border-t border-slate-200 px-4 py-4 md:px-6 md:py-5"
          style={{ background: "transparent" }}
        >
          <div className="max-w-4xl mx-auto">
            <form onSubmit={handleSubmit} className="relative">
              <div
                className={`relative bg-white border rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden ${
                  isSending
                    ? "scale-[0.98] shadow-lg border-blue-300"
                    : isReplacingText
                    ? "border-green-300 shadow-lg bg-gradient-to-r from-green-50 to-emerald-50"
                    : "border-slate-200"
                }`}
              >
                <div className="flex items-end">
                  <div className="flex-1 relative">
                    <textarea
                      ref={textareaRef}
                      value={input}
                      onChange={handleInputChange}
                      placeholder="Ask me anything..."
                      className={`w-full resize-none border-0 bg-transparent px-4 py-3 md:px-5 md:py-4 pr-20 text-slate-700 placeholder:text-slate-400 focus:ring-0 focus:outline-none text-sm md:text-base leading-relaxed transition-all duration-500 ${
                        isClient && inputHeight > 200 ? "custom-scrollbar" : ""
                      } ${fadeInText ? "animate-fade-in" : ""}`}
                      rows={1}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSubmit({
                            preventDefault: () => {},
                          } as React.FormEvent<HTMLFormElement>);
                        }
                      }}
                      style={{
                        height: `${inputHeight}px`,
                        minHeight: "48px",
                        maxHeight: isClient
                          ? `${window.innerHeight * 0.4}px`
                          : "200px",
                        overflowY:
                          isClient && inputHeight > 200 ? "auto" : "hidden",
                      }}
                    />
                  </div>

                  <div className="absolute bottom-2 right-2 flex items-center gap-2">
                    {/* Voice Recorder */}
                    <VoiceRecorder
                      onTranscription={handleVoiceTranscription}
                      onError={handleVoiceError}
                      disabled={isSending}
                    />

                    {input.trim() && input.length >= 50 && (
                      <button
                        type="button"
                        onClick={improvePrompt}
                        disabled={isImproving || isReplacingText}
                        className={`w-10 h-10 rounded-full transition-all duration-200 flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 shadow-lg ${
                          isReplacingText
                            ? "bg-gradient-to-r from-green-500 to-emerald-500"
                            : isImproving
                            ? "bg-gradient-to-r from-purple-500 to-pink-500"
                            : "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                        } ${
                          isImproving || isReplacingText ? "opacity-75" : ""
                        }`}
                        title={
                          isReplacingText
                            ? "Enhancing prompt..."
                            : isImproving
                            ? "Improving prompt..."
                            : "Improve prompt with AI"
                        }
                      >
                        <Sparkles
                          className={`w-4 h-4 text-white transition-all duration-200 ${
                            isImproving
                              ? "animate-spin"
                              : isReplacingText
                              ? "animate-pulse"
                              : ""
                          }`}
                        />
                      </button>
                    )}

                    <button
                      type="submit"
                      disabled={!input.trim()}
                      className={`w-10 h-10 transition-all duration-200 flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 rounded-full shadow-lg ${
                        input.trim()
                          ? isSending
                            ? "bg-blue-500"
                            : "bg-blue-500 hover:bg-blue-600"
                          : "bg-slate-200"
                      }`}
                    >
                      {isUserTyping && input.trim() ? (
                        <ButtonTypingIndicator />
                      ) : (
                        <ArrowUp
                          className={`w-4 h-4 transition-all duration-200 ${
                            input.trim() ? "text-white" : "text-slate-400"
                          }`}
                        />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {messageQueue.length > 0 && (
                <div className="mt-3 flex items-center justify-center">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <span className="text-xs text-amber-700 font-medium">
                      {messageQueue.length} message
                      {messageQueue.length > 1 ? "s" : ""} in queue
                    </span>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
