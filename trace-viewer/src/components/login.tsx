"use client";

import { useState } from "react";
import { Rocket } from "lucide-react";

const CORRECT_PASSWORD = "V0x2Th3M00n!";

interface LoginProps {
  onAuthenticated: () => void;
}

export default function Login({ onAuthenticated }: LoginProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (password === CORRECT_PASSWORD) {
      setError(false);
      onAuthenticated();
    } else {
      setError(true);
      setIsShaking(true);
      setPassword("");
      setTimeout(() => setIsShaking(false), 500);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-neutral-900 to-stone-950 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Ambient lighting effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-white/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-white/5 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white/[0.02] rounded-full blur-3xl"></div>
      </div>

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10">
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl shadow-2xl p-10">
          {/* Header */}
          <div className="text-center space-y-6 mb-10">
            <div className="relative inline-block">
              {/* Glow effect behind rocket */}
              <div className="absolute inset-0 bg-white/20 rounded-full blur-2xl scale-150"></div>
              <div className="relative inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-white to-gray-300 rounded-full shadow-2xl">
                <Rocket className="w-10 h-10 text-black" />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.3em] text-white/50">
                VOX Trace Observatory
              </p>
              <h1 className="text-4xl font-bold tracking-tight text-white">
                Access Required
              </h1>
            </div>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-white/70 mb-3"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(false);
                }}
                className={`w-full px-4 py-3.5 border-2 bg-white/5 backdrop-blur-sm text-white placeholder:text-white/30 focus:outline-none focus:bg-white/10 transition rounded-lg ${
                  error
                    ? "border-white/40"
                    : "border-white/20 focus:border-white/40"
                } ${isShaking ? "animate-shake" : ""}`}
                placeholder="Enter password"
                autoFocus
              />
              {error && (
                <p className="mt-2.5 text-sm text-white/60">
                  Incorrect password
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-white text-black font-semibold py-3.5 rounded-lg hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-black/50 transition transform hover:scale-[1.01] active:scale-[0.99] shadow-xl"
            >
              Launch
            </button>
          </form>
        </div>
      </div>

      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); }
          20%, 40%, 60%, 80% { transform: translateX(8px); }
        }
        .animate-shake {
          animation: shake 0.5s;
        }
      `}</style>
    </div>
  );
}
