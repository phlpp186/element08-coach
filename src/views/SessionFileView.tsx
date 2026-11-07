/**
 * Session file: a coach opens a session an athlete exported from the app
 * (Logbook › session › Share › Data (spreadsheet)) and sees it with the same
 * view as a session attached to a plan. For coaches without connected
 * athletes this is the way to see an athlete's data; the file is read in the
 * browser and never stored or uploaded.
 */
import { useRef, useState, type DragEvent } from 'react';
import { fill, useT } from '../i18n';
import { AttachedSessionDetail } from '../components/AttachedSessionDetail';
import { readSessionFile, SessionFileError, type SessionFile } from '../lib/sessionFile';
import type { Json } from '../lib/supabase/coachData';

interface Loaded {
  id: string;
  name: string;
  result?: SessionFile;
  error?: string;
}

function fmtSec(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}

export function SessionFileView() {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Loaded[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const errorText = (e: unknown) => {
    if (e instanceof SessionFileError) {
      if (e.code === 'no-dives') return t('This export has no dives or holds in it.');
      if (e.code === 'bad-data') return t('This file looks damaged. Ask the athlete to export it again.');
      return t('This is not an ELEMENT | 08 session export. In the app: open the session in the Logbook, tap Share, then Data (spreadsheet).');
    }
    return t('Could not read this file. If you are offline, the reader needs a connection the first time.');
  };

  const open = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setReading(true);
    const added: Loaded[] = [];
    for (const file of Array.from(list)) {
      const id = `${file.name}:${file.size}:${file.lastModified}`;
      try {
        added.push({ id, name: file.name, result: await readSessionFile(file) });
      } catch (e) {
        added.push({ id, name: file.name, error: errorText(e) });
      }
    }
    setFiles((prev) => [...prev.filter((p) => !added.some((a) => a.id === p.id)), ...added]);
    setCurrent(added[added.length - 1].id);
    setReading(false);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void open(e.dataTransfer.files);
  };

  const shown = files.find((f) => f.id === current) ?? null;

  return (
    <main className="mx-auto max-w-4xl px-5 py-6 space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg">{t('Session file')}</h2>
        <p className="text-sm text-textDim">
          {t('Open a session an athlete exported from the app: in the Logbook, open the session, tap Share, then Data (spreadsheet). The file is read in this browser only, nothing is uploaded or saved.')}
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? 'border-accent bg-accent/10' : 'border-border bg-panel'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            void open(e.target.files);
            e.target.value = '';
          }}
        />
        <p className="mb-3 text-sm text-textDim">{t('Drop .xlsx session files here')}</p>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={reading}
          className="pill pill-on btn-raised px-4 py-1.5 text-sm"
        >
          {reading ? t('Reading…') : t('Choose files')}
        </button>
      </div>

      {files.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((f) => (
            <button
              key={f.id}
              onClick={() => setCurrent(f.id)}
              className={`pill max-w-full truncate px-3 py-1 text-xs ${f.id === current ? 'pill-on' : ''} ${f.error ? 'text-red' : ''}`}
              title={f.name}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}

      {shown && (
        <section className="glass-card rounded-xl p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="min-w-0 truncate font-heading tracking-wide text-text" title={shown.name}>
              {shown.name}
            </h3>
            <button
              onClick={() => {
                const rest = files.filter((f) => f.id !== shown.id);
                setFiles(rest);
                setCurrent(rest.length ? rest[rest.length - 1].id : null);
              }}
              className="text-xs text-textDim hover:text-text underline"
            >
              {t('Close')}
            </button>
          </div>

          {shown.error ? (
            <p className="text-sm text-red">{shown.error}</p>
          ) : shown.result ? (
            <>
              {!shown.result.complete && (
                <p className="rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-text">
                  {t('Exported by an older app version, so a few details are missing (for dry sessions, the breathing phases between holds). Once the athlete updates the app, new exports show everything.')}
                </p>
              )}
              <AttachedSessionDetail blob={shown.result.session as Json} />
              {shown.result.holds && shown.result.holds.length > 0 && (
                <ul className="board divide-y divide-border overflow-hidden">
                  {shown.result.holds.map((h, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 bg-panel px-4 py-2.5 text-sm">
                      <span className="w-16 text-[10px] uppercase tracking-widest text-textDim">
                        {fill(t('Hold {n}'), { n: i + 1 })}
                      </span>
                      <span className="font-heading tracking-wide text-accent">{fmtSec(h.seconds)}</span>
                      <span className="text-xs text-textDim">
                        {h.contractions} {h.contractions === 1 ? t('contraction') : t('contractions')}
                      </span>
                      {h.rating != null && <span className="text-xs text-textDim">{t('Effort')} {h.rating}/10</span>}
                      {h.note && <span className="min-w-0 basis-full break-words italic text-text">“{h.note}”</span>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </section>
      )}
    </main>
  );
}
