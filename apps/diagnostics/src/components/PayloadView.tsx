'use client';

import { Copy, WrapText } from 'lucide-react';
import { useState } from 'react';
import { asThumb, copyText, formatBytes, headingOf, isScalar, toolbarFacts, type Thumb } from '../lib/payload.ts';

function ThumbImage({ thumb }: { thumb: Thumb }) {
  return (
    <span className="inline-flex items-center gap-2 align-middle" data-testid="payload-thumb">
      {/* A data: URI built and size-limited by the API (96 px, 6 KB): no request leaves the page. */}
      <img src={thumb.dataUri} width={thumb.width} height={thumb.height} alt="thumbnail" className="rounded-[4px]" style={{ maxHeight: 48, width: 'auto' }} />
      <span style={{ color: '#8A9BB5', fontSize: 10 }}>{thumb.width}x{thumb.height} thumbnail{thumb.originalBytes ? ` · original ${formatBytes(thumb.originalBytes)}` : ''}</span>
    </span>
  );
}

function Value({ value, depth, wrap }: { value: unknown; depth: number; wrap: boolean }) {
  const thumb = asThumb(value);
  if (thumb) return <ThumbImage thumb={thumb} />;
  if (isScalar(value)) {
    return <span style={{ color: typeof value === 'string' ? '#CBD5E1' : '#FBBF24', whiteSpace: wrap ? 'pre-wrap' : 'pre', overflowWrap: wrap ? 'anywhere' : 'normal' }}>{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span style={{ color: '#7E8DA6' }}>none</span>;
    if (value.every(isScalar)) return <Value value={value.join(', ')} depth={depth} wrap={wrap} />;
    if (value.every((item) => asThumb(item))) {
      return (
        <span className="flex flex-wrap gap-2">
          {value.map((item, i) => (
            <ThumbImage key={i} thumb={asThumb(item) as Thumb} />
          ))}
        </span>
      );
    }
    return (
      <div className="flex flex-col gap-1">
        {value.map((item, i) => (
          <div key={i} className="flex gap-2">
            <span style={{ color: '#7E8DA6' }}>{i + 1}</span>
            <div className="min-w-0 flex-1"><Value value={item} depth={depth + 1} wrap={wrap} /></div>
          </div>
        ))}
      </div>
    );
  }
  const entries = Object.entries(value as Record<string, unknown>);
  // A chat message: role as the block heading, parts below (text in full, images as thumbnails).
  const role = (value as Record<string, unknown>).role;
  if (typeof role === 'string' && 'parts' in (value as object)) {
    return (
      <div className="flex flex-col gap-1">
        <span className="font-bold" style={{ color: '#A78BFA', fontSize: 10 }}>{role.toUpperCase()}</span>
        <Value value={(value as Record<string, unknown>).parts} depth={depth + 1} wrap={wrap} />
      </div>
    );
  }
  const inline = entries.every(([, v]) => isScalar(v) && String(v).length < 48);
  if (inline && depth > 0) {
    return (
      <span style={{ whiteSpace: wrap ? 'pre-wrap' : 'pre' }}>
        {entries.map(([key, v], i) => (
          <span key={key}>
            {i > 0 ? ' · ' : ''}
            <span style={{ color: '#8A9BB5' }}>{key}</span> <Value value={v} depth={depth + 1} wrap={wrap} />
          </span>
        ))}
      </span>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {entries.map(([key, v]) => (
        <div key={key} className={isScalar(v) && String(v).length < 60 ? 'flex gap-2' : 'flex flex-col gap-1'}>
          <span className="shrink-0 font-bold" style={{ color: depth === 0 ? '#A78BFA' : '#8A9BB5', fontSize: 10, lineHeight: '15px' }}>{depth === 0 ? headingOf(key) : key}</span>
          <div className="min-w-0"><Value value={v} depth={depth + 1} wrap={wrap} /></div>
        </div>
      ))}
    </div>
  );
}

/** Expanded payload (L1, L2): toolbar with facts, Wrap and Copy, then a scrolling mono box with prompts in full and thumbnails. */
export function PayloadView({ payload }: { payload: Record<string, unknown> }) {
  const [wrap, setWrap] = useState(true);
  const [copied, setCopied] = useState(false);
  const facts = toolbarFacts(payload);
  const empty = Object.keys(payload).length === 0;
  const button = 'flex h-[22px] items-center gap-1 rounded-md border border-line bg-chip px-2 font-semibold text-body';
  return (
    <div className="flex flex-col gap-2" data-testid="payload">
      <div className="flex w-full items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono" style={{ color: '#8A9BB5', fontSize: 10, lineHeight: '13px' }}>{facts || 'payload'}</span>
        <button type="button" className={button} style={{ fontSize: 10, lineHeight: '13px' }} aria-pressed={wrap} onClick={() => setWrap(!wrap)}>
          <WrapText size={12} color="#9DB4D8" />
          Wrap
        </button>
        <button
          type="button"
          className={button}
          style={{ fontSize: 10, lineHeight: '13px' }}
          onClick={() => {
            void navigator.clipboard?.writeText(copyText(payload)).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
        >
          <Copy size={12} color="#9DB4D8" />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="bm-scroll overflow-auto rounded-md border border-line-panel bg-well p-3 font-mono" style={{ maxHeight: 420, fontSize: 11, lineHeight: '15px', color: '#CBD5E1' }}>
        {empty ? <span style={{ color: '#7E8DA6' }}>no payload</span> : <Value value={payload} depth={0} wrap={wrap} />}
      </div>
    </div>
  );
}
