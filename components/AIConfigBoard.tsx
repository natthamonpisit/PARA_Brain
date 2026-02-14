import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { BookOpenText, Plus, Save, Trash2, FileText, SlidersHorizontal, CheckCircle2, AlertCircle, PencilLine } from 'lucide-react';
import { BUILTIN_AI_CONFIG_DOCS } from '../services/aiConfigCatalog';
import {
  CustomAiInstruction,
  createCustomInstruction,
  getCustomAiInstructions,
  saveCustomAiInstructions
} from '../services/aiConfigService';

type SelectedItem =
  | { kind: 'BUILTIN'; id: string }
  | { kind: 'CUSTOM'; id: string };

const isSelected = (selected: SelectedItem, kind: 'BUILTIN' | 'CUSTOM', id: string) =>
  selected.kind === kind && selected.id === id;

export const AIConfigBoard: React.FC = () => {
  const [customInstructions, setCustomInstructions] = useState<CustomAiInstruction[]>([]);
  const [selected, setSelected] = useState<SelectedItem>({ kind: 'BUILTIN', id: BUILTIN_AI_CONFIG_DOCS[0]?.id || '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setIsLoading(true);
      const custom = await getCustomAiInstructions();
      if (!mounted) return;
      setCustomInstructions(custom);
      setIsLoading(false);
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const selectedBuiltin = useMemo(
    () => BUILTIN_AI_CONFIG_DOCS.find((doc) => isSelected(selected, 'BUILTIN', doc.id)),
    [selected]
  );
  const selectedCustom = useMemo(
    () => customInstructions.find((item) => isSelected(selected, 'CUSTOM', item.id)),
    [selected, customInstructions]
  );

  const persistCustom = async (next: CustomAiInstruction[]) => {
    setIsSaving(true);
    setNotice(null);
    try {
      const saved = await saveCustomAiInstructions(next);
      setCustomInstructions(saved);
      setNotice({ type: 'success', text: 'Saved AI instruction config.' });
      if (selected.kind === 'CUSTOM') {
        const stillExists = saved.some((item) => item.id === selected.id);
        if (!stillExists) {
          setSelected({ kind: 'BUILTIN', id: BUILTIN_AI_CONFIG_DOCS[0]?.id || '' });
        }
      }
    } catch {
      setNotice({ type: 'error', text: 'Failed to save instruction config.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleEnabled = async (id: string) => {
    const nowIso = new Date().toISOString();
    const next = customInstructions.map((item) =>
      item.id === id ? { ...item, enabled: !item.enabled, updatedAt: nowIso } : item
    );
    await persistCustom(next);
  };

  const handleDelete = async (id: string) => {
    const next = customInstructions.filter((item) => item.id !== id);
    await persistCustom(next);
  };

  const handleStartEdit = (item: CustomAiInstruction) => {
    setEditingId(item.id);
    setDraftTitle(item.title);
    setDraftContent(item.content);
    setSelected({ kind: 'CUSTOM', id: item.id });
  };

  const resetDraft = () => {
    setEditingId(null);
    setDraftTitle('');
    setDraftContent('');
  };

  const handleSaveDraft = async () => {
    const title = draftTitle.trim();
    const content = draftContent.trim();
    if (!title || !content) {
      setNotice({ type: 'error', text: 'Please fill title and instruction content.' });
      return;
    }

    const nowIso = new Date().toISOString();
    let next: CustomAiInstruction[];
    if (editingId) {
      next = customInstructions.map((item) =>
        item.id === editingId
          ? { ...item, title: title.slice(0, 120), content: content.slice(0, 4000), updatedAt: nowIso }
          : item
      );
    } else {
      next = [createCustomInstruction(title, content), ...customInstructions];
    }

    await persistCustom(next);
    resetDraft();
  };

  const selectedTitle = selectedBuiltin?.title || selectedCustom?.title || 'AI Config';
  const selectedPath = selectedBuiltin?.path || 'Custom instruction';
  const selectedContent = selectedBuiltin?.content || selectedCustom?.content || 'Select a file or instruction to view details.';

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">AI CONFIG</p>
            <h3 className="mt-1 text-xl font-semibold text-slate-100">Prompt & Instruction Control Center</h3>
            <p className="mt-1 text-sm text-slate-400">
              Built-in markdown files are read-only. Custom instructions below are applied to AI capture routing when enabled.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>{customInstructions.filter((item) => item.enabled).length} custom instruction(s) enabled</span>
          </div>
        </div>

        {notice && (
          <div
            className={`mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
              notice.type === 'success'
                ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200'
                : 'border-rose-400/35 bg-rose-500/10 text-rose-200'
            }`}
          >
            {notice.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <span>{notice.text}</span>
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Built-in Files</p>
            <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
              {BUILTIN_AI_CONFIG_DOCS.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => setSelected({ kind: 'BUILTIN', id: doc.id })}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                    isSelected(selected, 'BUILTIN', doc.id)
                      ? 'border-cyan-400/50 bg-cyan-500/12 text-cyan-100'
                      : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500 hover:text-slate-100'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{doc.title}</p>
                      <p className="truncate text-[11px] text-slate-400">{doc.section} · {doc.path}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Custom Instructions</p>
            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 custom-scrollbar">
              {customInstructions.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-700 p-3 text-xs text-slate-500">
                  No custom instruction yet.
                </div>
              )}
              {customInstructions.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-xl border p-2 ${
                    isSelected(selected, 'CUSTOM', item.id)
                      ? 'border-cyan-400/50 bg-cyan-500/12'
                      : 'border-slate-700 bg-slate-900/70'
                  }`}
                >
                  <button
                    onClick={() => setSelected({ kind: 'CUSTOM', id: item.id })}
                    className="w-full text-left"
                  >
                    <p className="truncate text-sm font-semibold text-slate-100">{item.title}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">{item.enabled ? 'Enabled' : 'Disabled'}</p>
                  </button>
                  <div className="mt-2 flex items-center gap-1.5">
                    <button
                      onClick={() => handleToggleEnabled(item.id)}
                      disabled={isSaving}
                      className={`rounded-md px-2 py-1 text-[11px] ${
                        item.enabled
                          ? 'bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/20'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {item.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => handleStartEdit(item)}
                      disabled={isSaving}
                      className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700"
                    >
                      <span className="inline-flex items-center gap-1"><PencilLine className="h-3 w-3" />Edit</span>
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      disabled={isSaving}
                      className="rounded-md bg-rose-500/15 px-2 py-1 text-[11px] text-rose-200 hover:bg-rose-500/20"
                    >
                      <span className="inline-flex items-center gap-1"><Trash2 className="h-3 w-3" />Delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              {editingId ? 'Edit Instruction' : 'Add Instruction'}
            </p>
            <div className="space-y-2">
              <input
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                placeholder="Instruction title"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/50"
              />
              <textarea
                value={draftContent}
                onChange={(event) => setDraftContent(event.target.value)}
                placeholder="Example: For resource capture, always include why this matters and first next step."
                rows={5}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400/50"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveDraft}
                  disabled={isSaving || !draftTitle.trim() || !draftContent.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50"
                >
                  {editingId ? <Save className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  {editingId ? 'Update' : 'Add'}
                </button>
                {editingId && (
                  <button
                    onClick={resetDraft}
                    disabled={isSaving}
                    className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="min-w-0">
              <h4 className="truncate text-lg font-semibold text-slate-100">{selectedTitle}</h4>
              <p className="truncate text-xs text-slate-400">{selectedPath}</p>
            </div>
            <div className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-300">
              <BookOpenText className="h-3.5 w-3.5" />
              <span>{selected.kind === 'BUILTIN' ? 'Read only' : 'Custom'}</span>
            </div>
          </div>

          {isLoading ? (
            <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">
              Loading AI config...
            </div>
          ) : (
            <div className="prose prose-invert max-w-none text-sm leading-7 prose-pre:bg-slate-950 prose-pre:border prose-pre:border-slate-700 prose-code:text-cyan-200">
              <ReactMarkdown>{selectedContent}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
