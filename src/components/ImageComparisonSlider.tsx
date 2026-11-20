import React, { useState } from 'react';

interface ImageComparisonSliderProps {
  originalUrl: string;
  analyzedUrl: string;
  originalLabel?: string;
  analyzedLabel?: string;
  enableAlignmentControls?: boolean;
}

export function ImageComparisonSlider({
  originalUrl,
  analyzedUrl,
  originalLabel = 'Original Leaf Frame',
  analyzedLabel = 'Analyzed Overlay',
  enableAlignmentControls = false,
}: ImageComparisonSliderProps) {
  const [splitPct, setSplitPct] = useState(50);
  const [viewMode, setViewMode] = useState<'slider' | 'side_by_side' | 'overlay_align'>('slider');
  const [overlayOpacity, setOverlayOpacity] = useState(50);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          {originalLabel} <span aria-hidden="true">·</span> {analyzedLabel}
        </div>
        <div className="inline-flex items-center gap-1 p-1 bg-stone-100 rounded-md border border-stone-200">
          <button
            type="button"
            onClick={() => setViewMode('slider')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              viewMode === 'slider' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Split Slider
          </button>
          <button
            type="button"
            onClick={() => setViewMode('side_by_side')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              viewMode === 'side_by_side' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Side by Side
          </button>
          {enableAlignmentControls && (
            <button
              type="button"
              onClick={() => setViewMode('overlay_align')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                viewMode === 'overlay_align' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Align &amp; Overlay
            </button>
          )}
        </div>
      </div>

      {viewMode === 'slider' ? (
        <div className="space-y-2">
          <div className="relative w-full aspect-[4/3] bg-stone-900 rounded-lg overflow-hidden border border-stone-200 select-none">
            <img
              src={analyzedUrl}
              alt={analyzedLabel}
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ transform: `translate(${offsetX}px, ${offsetY}px)` }}
            />
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
            >
              <img
                src={originalUrl}
                alt={originalLabel}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white shadow-sm pointer-events-none"
              style={{ left: `${splitPct}%` }}
            />
            <div className="absolute bottom-2.5 left-2.5 px-2 py-1 rounded bg-slate-900/80 text-white text-[11px] font-medium">
              {originalLabel}
            </div>
            <div className="absolute bottom-2.5 right-2.5 px-2 py-1 rounded bg-emerald-950/85 text-white text-[11px] font-medium">
              {analyzedLabel}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 whitespace-nowrap">Compare</span>
            <input
              type="range"
              min={0}
              max={100}
              value={splitPct}
              onChange={(e) => setSplitPct(Number(e.target.value))}
              aria-label="Original versus analyzed split comparison slider"
              className="w-full accent-emerald-800 cursor-pointer"
            />
            <span className="text-xs font-mono tabular-nums text-slate-600 w-10 text-right">{splitPct}%</span>
          </div>
        </div>
      ) : viewMode === 'overlay_align' ? (
        <div className="space-y-3">
          <div className="relative w-full aspect-[4/3] bg-stone-900 rounded-lg overflow-hidden border border-stone-200 select-none">
            <img
              src={originalUrl}
              alt={originalLabel}
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <img
              src={analyzedUrl}
              alt={analyzedLabel}
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                opacity: overlayOpacity / 100,
                transform: `translate(${offsetX}px, ${offsetY}px)`,
              }}
            />
            <div className="absolute bottom-2.5 left-2.5 px-2 py-1 rounded bg-slate-900/80 text-white text-[11px] font-medium">
              Base: {originalLabel} · Overlay ({overlayOpacity}%): {analyzedLabel}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-stone-50 border border-stone-200 rounded-md p-3 text-xs">
            <label className="space-y-1">
              <div className="flex justify-between text-slate-600">
                <span>Overlay Opacity</span>
                <span className="font-mono">{overlayOpacity}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={overlayOpacity}
                onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                className="w-full accent-emerald-800"
              />
            </label>
            <label className="space-y-1">
              <div className="flex justify-between text-slate-600">
                <span>Align X Offset</span>
                <span className="font-mono">{offsetX}px</span>
              </div>
              <input
                type="range"
                min={-40}
                max={40}
                value={offsetX}
                onChange={(e) => setOffsetX(Number(e.target.value))}
                className="w-full accent-emerald-800"
              />
            </label>
            <label className="space-y-1">
              <div className="flex justify-between text-slate-600">
                <span>Align Y Offset</span>
                <span className="font-mono">{offsetY}px</span>
              </div>
              <input
                type="range"
                min={-40}
                max={40}
                value={offsetY}
                onChange={(e) => setOffsetY(Number(e.target.value))}
                className="w-full accent-emerald-800"
              />
            </label>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="border border-stone-200 rounded-lg overflow-hidden bg-stone-50">
            <img
              src={originalUrl}
              alt={originalLabel}
              referrerPolicy="no-referrer"
              className="w-full aspect-[4/3] object-cover"
            />
            <div className="px-3 py-2 text-xs font-medium text-slate-700 border-t border-stone-200">
              {originalLabel}
            </div>
          </div>
          <div className="border border-stone-200 rounded-lg overflow-hidden bg-stone-50">
            <img
              src={analyzedUrl}
              alt={analyzedLabel}
              referrerPolicy="no-referrer"
              className="w-full aspect-[4/3] object-cover"
            />
            <div className="px-3 py-2 text-xs font-medium text-slate-700 border-t border-stone-200">
              {analyzedLabel}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
