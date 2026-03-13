interface ScreenshotPreviewProps {
  image: string;
  onClear: () => void;
}

export default function ScreenshotPreview({ image, onClear }: ScreenshotPreviewProps) {
  return (
    <div className="mx-3 mb-2 flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-2 animate-fade-in-up">
      <div className="flex items-center gap-3">
        <div className="relative group">
          <img
            src={`data:image/png;base64,${image}`}
            alt="Screenshot preview"
            className="h-10 w-auto rounded border border-white/20 object-cover"
          />
          <div className="absolute inset-0 rounded bg-black/20 transition-colors group-hover:bg-transparent" />
        </div>
        <div className="flex-1">
          <p className="text-[11px] font-medium text-white">Screenshot attached</p>
          <p className="text-[10px] text-slate-400">Ask a question or click Answer</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="rounded-full p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}
