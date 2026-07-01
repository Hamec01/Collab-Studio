import React, { useState } from "react";
import { Search, Sparkles, BookOpen, Music, RefreshCw } from "lucide-react";
import { RhymeResult } from "../types";
import { requestRhymes } from "../api/gemini";
import { ApiError } from "../api/client";

interface RhymeFinderProps {
  onUnauthorized?: () => void;
}

export default function RhymeFinder({ onUnauthorized }: RhymeFinderProps) {
  const [word, setWord] = useState("");
  const [context, setContext] = useState("");
  const [language, setLanguage] = useState("Russian");
  const [result, setResult] = useState<RhymeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!word.trim()) return;

    setLoading(true);
    setError("");
    try {
      const data = await requestRhymes({
        word: word.trim(),
        language,
        context: context.trim(),
      });
      setResult(data);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError("Сессия истекла. Войдите снова.");
          onUnauthorized?.();
        }
        else if (err.status === 429) setError("Слишком много запросов. Попробуйте позже.");
        else setError(err.message || "Не удалось получить рифмы");
      } else {
        setError("Ошибка при поиске рифм. Пожалуйста, попробуйте позже.");
      }
    } finally {
      setLoading(false);
    }
  };

  const insertSuggestedLine = (line: string) => {
    // Copy to clipboard or let user copy easily
    navigator.clipboard.writeText(line);
    alert("Строка скопирована в буфер обмена!");
  };

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <div className="bg-indigo-950/50 border border-indigo-900/40 p-1.5 rounded-lg text-indigo-400">
          <Sparkles className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">AI Генератор Рифм & Идей</h3>
          <p className="text-[11px] text-neutral-400">Поиск идеальных рифм и наброски строк</p>
        </div>
      </div>

      <form onSubmit={handleSearch} className="space-y-3">
        <div>
          <div className="relative">
            <input
              type="text"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              placeholder="Введите слово..."
              className="w-full bg-neutral-900 border border-neutral-800 focus:border-indigo-500 rounded-lg py-2 pl-9 pr-3 text-xs text-white focus:outline-none transition-colors"
            />
            <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-2.5" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] font-mono text-neutral-500 mb-1">ЯЗЫК</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-1.5 text-xs text-white focus:outline-none cursor-pointer"
            >
              <option value="Russian">Русский</option>
              <option value="English">English</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-mono text-neutral-500 mb-1 font-semibold text-indigo-400 flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5" /> НАСТРОЕНИЕ / ВАЙБ
            </label>
            <input
              type="text"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="грустный, ретро, поп"
              className="w-full bg-neutral-900 border border-neutral-800 focus:border-indigo-500 rounded-lg p-1.5 text-xs text-white focus:outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !word.trim()}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-900 disabled:text-neutral-600 text-white font-medium p-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          {loading ? (
            <>
              <RefreshCw className="w-3 h-3 animate-spin" />
              Генерируем идеи...
            </>
          ) : (
            <>
              <Sparkles className="w-3 h-3" />
              Найти рифмы & сочинить
            </>
          )}
        </button>
      </form>

      {error && (
        <div className="mt-3 bg-red-950/40 border border-red-950/60 p-2.5 rounded-lg text-red-400 text-[11px] text-center">
          {error}
        </div>
      )}

      <div className="mt-4 flex-1 overflow-y-auto space-y-4 pr-1">
        {result ? (
          <>
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-neutral-400 mb-2 border-b border-neutral-900 pb-1">
                <BookOpen className="w-3 h-3 text-indigo-400" />
                ПОДОБРАННЫЕ РИФМЫ ДЛЯ "{result.word.toUpperCase()}"
              </div>
              {result.rhymes && result.rhymes.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {result.rhymes.map((rhyme, idx) => (
                    <span
                      key={idx}
                      onClick={() => setWord(rhyme)}
                      className="bg-neutral-900 hover:bg-indigo-950/40 border border-neutral-800 hover:border-indigo-900/40 text-xs text-neutral-300 hover:text-white px-2.5 py-1 rounded-md transition-all cursor-pointer font-medium"
                      title="Кликните, чтобы искать рифмы к этому слову"
                    >
                      {rhyme}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-neutral-500 italic">Рифм не найдено</p>
              )}
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-neutral-400 mb-2 border-b border-neutral-900 pb-1">
                <Music className="w-3 h-3 text-teal-400" />
                AI ВАРИАНТЫ СТРОК (Кликните для копирования)
              </div>
              {result.suggestions && result.suggestions.length > 0 ? (
                <div className="space-y-2">
                  {result.suggestions.map((suggestion, idx) => (
                    <div
                      key={idx}
                      onClick={() => insertSuggestedLine(suggestion)}
                      className="bg-neutral-900/50 hover:bg-neutral-900 border border-neutral-900 hover:border-teal-900/30 text-[11px] text-neutral-300 hover:text-white p-2 rounded-lg cursor-pointer transition-all border-l-2 border-l-teal-500/50 relative group"
                    >
                      <p className="italic font-serif leading-relaxed pr-6">{suggestion}</p>
                      <span className="absolute right-2 top-2 text-[8px] bg-neutral-800 text-neutral-400 px-1 py-0.2 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                        копировать
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-neutral-500 italic">Строк не предложено</p>
              )}
            </div>
          </>
        ) : (
          !loading && (
            <div className="h-full flex flex-col items-center justify-center text-center p-4 py-8 border border-dashed border-neutral-800/40 rounded-xl bg-neutral-900/10">
              <Sparkles className="w-8 h-8 text-neutral-700 mb-2 animate-pulse" />
              <p className="text-[11px] text-neutral-400 max-w-[200px]">
                Введите слово, укажите настроение и нажмите кнопку, чтобы AI подобрал созвучные рифмы и набросал поэтические варианты строк!
              </p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
