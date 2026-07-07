import React, { useState } from "react";

type AgeAcknowledgementModalProps = {
  onConfirm: () => Promise<void>;
};

export default function AgeAcknowledgementModal({ onConfirm }: AgeAcknowledgementModalProps) {
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl">
        <h2 className="text-xl font-semibold text-white">Подтвердите 18+</h2>
        <p className="mt-2 text-sm text-neutral-300">
          Для создания проектов, треков и совместной работы нужно один раз подтвердить, что вам 18+.
        </p>
        <label className="mt-4 flex items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-900/80 p-3 text-sm text-neutral-200">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-neutral-700 bg-neutral-950 text-indigo-500"
          />
          <span>Подтверждаю, что мне исполнилось 18 лет.</span>
        </label>
        {error && <div className="mt-3 rounded-lg border border-red-900/30 bg-red-950/50 p-3 text-xs text-red-300">{error}</div>}
        <button
          type="button"
          disabled={!checked || pending}
          onClick={async () => {
            setPending(true);
            setError("");
            try {
              await onConfirm();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Не удалось сохранить подтверждение 18+.");
            } finally {
              setPending(false);
            }
          }}
          className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-900"
        >
          {pending ? "Сохраняем..." : "Подтвердить и продолжить"}
        </button>
      </div>
    </div>
  );
}
