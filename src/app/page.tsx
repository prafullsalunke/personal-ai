"use client";

import React, { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { ArrowUp, Loader2, Copy, Check, Trash2, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface QueuedMessage {
  id: string;
  text: string;
  timestamp: number;
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
  const { messages, status, sendMessage, error, setMessages } = useChat();
  const [input, setInput] = useState("");
  const [messageQueue, setMessageQueue] = useState<QueuedMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isUserTyping, setIsUserTyping] = useState(false);
  const [messageAnimation, setMessageAnimation] = useState<string | null>(null);
  const [isImproving, setIsImproving] = useState(false);
  const [inputHeight, setInputHeight] = useState(48);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const clearConversation = () => {
    setMessages([]);
    setMessageQueue([]);
    localStorage.removeItem("chat-messages");
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);

    // Typing detection
    setIsUserTyping(true);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      setIsUserTyping(false);
    }, 1000);
  };

  const improvePrompt = async () => {
    if (!input.trim() || isImproving) return;

    setIsImproving(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              id: "improve-prompt",
              role: "user",
              parts: [
                {
                  type: "text",
                  text: `Please improve this prompt to be more clear, specific, and effective. Keep the core intent but make it better structured and more likely to get a good response:

"${input.trim()}"

Return only the improved prompt, nothing else.`,
                },
              ],
            },
          ],
        }),
      });

      if (response.ok) {
        const reader = response.body?.getReader();
        let improvedPrompt = "";

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (line.startsWith("0:")) {
                try {
                  const data = JSON.parse(line.slice(2));
                  if (data.content?.[0]?.text) {
                    improvedPrompt += data.content[0].text;
                  }
                } catch {
                  // Ignore parsing errors
                }
              }
            }
          }
        }

        if (improvedPrompt.trim()) {
          setInput(improvedPrompt.trim());
        }
      }
    } catch (error) {
      console.error("Failed to improve prompt:", error);
    } finally {
      setIsImproving(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, messageQueue]);

  // Load messages from localStorage on mount
  useEffect(() => {
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
      sendMessage({ text: nextMessage.text });
    }
  }, [status, messageQueue, sendMessage]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
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
      sendMessage({ text: messageText });
    } else {
      // Add to queue if AI is busy
      const queuedMessage: QueuedMessage = {
        id: messageId,
        text: messageText,
        timestamp: Date.now(),
      };
      setMessageQueue((prev) => [...prev, queuedMessage]);
    }
  };

  return (
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
            <h1 className="text-xl font-semibold text-slate-800">
              AI Assistant
            </h1>
            {messageQueue.length > 0 && (
              <p className="text-sm text-slate-500 mt-1">
                {messageQueue.length} message
                {messageQueue.length > 1 ? "s" : ""} queued
              </p>
            )}
          </div>
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
                Start a conversation by typing your message below. I&apos;m here
                to assist you with any questions or tasks.
              </p>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto">
            {/* Regular Messages */}
            {messages.map((message, messageIndex) => (
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
                  className={`px-4 py-6 md:px-6 md:py-8 transition-all duration-300 ease-out ${
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
                        {message.parts?.map((part, index) => {
                          // text parts:
                          if (part.type === "text") {
                            return (
                              <div key={index}>
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={
                                    {
                                      code: ({
                                        className,
                                        children,
                                        ...props
                                      }) => {
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
                                {index < (message.parts?.length || 1) - 1 && (
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
                                {index < (message.parts?.length || 1) - 1 && (
                                  <div className="my-6 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent"></div>
                                )}
                              </div>
                            );
                          }

                          return null;
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Queued Messages */}
            {messageQueue.map((queuedMessage) => (
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
            ))}

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

            {/* Loading Indicator */}
            {status !== "ready" && !error && (
              <div className="px-4 py-6 md:px-6 md:py-8 bg-slate-50/80">
                <div className="flex gap-4 md:gap-6">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 md:w-9 md:h-9 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-full flex items-center justify-center shadow-lg border-2 border-white/20 relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-emerald-300/30 to-cyan-400/30 rounded-full animate-pulse"></div>
                      <div className="w-2 h-2 md:w-2.5 md:h-2.5 bg-white rounded-full relative z-10"></div>
                      <div className="absolute top-1 right-1 w-1 h-1 bg-white/60 rounded-full animate-pulse"></div>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"></div>
                        <div
                          className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"
                          style={{ animationDelay: "0.1s" }}
                        ></div>
                        <div
                          className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"
                          style={{ animationDelay: "0.2s" }}
                        ></div>
                      </div>
                      <span className="text-sm text-slate-500 ml-2">
                        Thinking...
                      </span>
                    </div>
                  </div>
                </div>
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
              className={`relative bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden ${
                isSending ? "scale-[0.98] shadow-lg border-blue-300" : ""
              }`}
            >
              <div className="flex items-end">
                <div className="flex-1 relative">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleInputChange}
                    placeholder="Ask me anything..."
                    className={`w-full resize-none border-0 bg-transparent px-4 py-3 md:px-5 md:py-4 pr-20 text-slate-700 placeholder:text-slate-400 focus:ring-0 focus:outline-none text-sm md:text-base leading-relaxed ${
                      typeof window !== "undefined" &&
                      inputHeight > window.innerHeight * 0.3
                        ? "custom-scrollbar"
                        : ""
                    }`}
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
                      maxHeight:
                        typeof window !== "undefined"
                          ? `${window.innerHeight * 0.4}px`
                          : "200px",
                      overflowY:
                        typeof window !== "undefined" &&
                        inputHeight > window.innerHeight * 0.3
                          ? "auto"
                          : "hidden",
                    }}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = "auto";
                      const newHeight = Math.max(
                        48,
                        Math.min(
                          target.scrollHeight,
                          typeof window !== "undefined"
                            ? window.innerHeight * 0.4
                            : 200
                        )
                      );
                      setInputHeight(newHeight);
                      target.style.height = `${newHeight}px`;
                    }}
                  />
                </div>

                <div className="absolute bottom-2 right-2 flex items-center gap-2">
                  {input.trim() && input.length >= 100 && (
                    <button
                      type="button"
                      onClick={improvePrompt}
                      disabled={isImproving}
                      className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:from-gray-300 disabled:to-gray-300 rounded-full transition-all duration-200 flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 shadow-lg"
                      title="Improve prompt with AI"
                    >
                      <Sparkles
                        className={`w-4 h-4 text-white transition-all duration-200 ${
                          isImproving ? "animate-spin" : ""
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
                      <div className="flex items-center gap-0.5">
                        <div className="w-1 h-1 bg-white rounded-full animate-bounce"></div>
                        <div
                          className="w-1 h-1 bg-white rounded-full animate-bounce"
                          style={{ animationDelay: "0.1s" }}
                        ></div>
                        <div
                          className="w-1 h-1 bg-white rounded-full animate-bounce"
                          style={{ animationDelay: "0.2s" }}
                        ></div>
                      </div>
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
  );
}
