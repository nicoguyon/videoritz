"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Film, Key } from "lucide-react";

export default function LoginPage() {
  const [key, setKey] = useState("");
  const [error, setError] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Test the key by calling health with it
    const res = await fetch("/api/health", {
      headers: { "x-api-key": key },
    });

    if (res.ok) {
      // Set cookie for future requests
      document.cookie = `videoritz_key=${key}; path=/; max-age=31536000; SameSite=Lax`;
      router.push("/");
    } else {
      setError(true);
    }
  };

  return (
    <main className="min-h-screen bg-[#0D1F3C] text-white flex items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-6 p-8">
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#D4A76A] to-[#E8D5B0] flex items-center justify-center shadow-lg shadow-[#D4A76A]/25">
            <Film size={28} className="text-[#0D1F3C]" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-semibold text-[#D4A76A]">VideoRitz</h1>
          <p className="text-sm text-[#C8B891]/80">Entrez votre cle d&apos;acces</p>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Key size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C8B891]/50" />
            <input
              type="password"
              value={key}
              onChange={(e) => { setKey(e.target.value); setError(false); }}
              placeholder="Cle API"
              className="w-full h-12 bg-[#152847] border border-[#1B2A4A] rounded-xl pl-10 pr-4 text-sm outline-none transition-all focus:border-[#D4A76A] focus:ring-2 focus:ring-[#D4A76A]/20 placeholder:text-[#C8B891]/40"
              autoFocus
            />
          </div>
          {error && (
            <p className="text-xs text-[#C83040]">Cle invalide</p>
          )}
        </div>

        <button
          type="submit"
          disabled={!key.trim()}
          className="w-full h-12 bg-gradient-to-r from-[#D4A76A] to-[#E8D5B0] text-[#0D1F3C] rounded-xl text-sm font-semibold transition-all hover:shadow-lg hover:shadow-[#D4A76A]/30 disabled:opacity-50 cursor-pointer"
        >
          Acceder
        </button>
      </form>
    </main>
  );
}
