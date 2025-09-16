import React from "react";

interface SkeletonLoaderProps {
  lines?: number;
  className?: string;
}

export function SkeletonLoader({ lines = 3, className = "" }: SkeletonLoaderProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <div key={index} className="space-y-2">
          <div className="flex items-center space-x-2">
            {/* Text skeleton lines with varying widths */}
            <div
              className={`h-4 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded animate-pulse`}
              style={{
                width: index === 0 ? "85%" : index === 1 ? "60%" : "75%",
                animationDelay: `${index * 0.1}s`
              }}
            />
          </div>

          {/* Smaller secondary line for some skeleton items */}
          {index < lines - 1 && (
            <div
              className="h-3 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded animate-pulse"
              style={{
                width: index === 0 ? "40%" : "55%",
                animationDelay: `${index * 0.1 + 0.05}s`
              }}
            />
          )}
        </div>
      ))}

      {/* Subtle shimmer effect overlay */}
      <div className="relative">
        <div className="absolute inset-0 -skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer" />
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex items-center space-x-3">
      {/* Avatar placeholder */}
      <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-full animate-pulse" />

      {/* Skeleton content */}
      <div className="flex-1">
        <SkeletonLoader lines={2} />
      </div>
    </div>
  );
}

export function ButtonTypingIndicator() {
  return (
    <div className="flex items-center gap-0.5">
      <div
        className="w-1 h-1 bg-white rounded-full animate-pulse"
        style={{ animationDelay: "0s" }}
      />
      <div
        className="w-1 h-1 bg-white rounded-full animate-pulse"
        style={{ animationDelay: "0.2s" }}
      />
      <div
        className="w-1 h-1 bg-white rounded-full animate-pulse"
        style={{ animationDelay: "0.4s" }}
      />
    </div>
  );
}