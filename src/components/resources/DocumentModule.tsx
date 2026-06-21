import { useState, useRef, MouseEvent } from "react";
import { Bookmark, Edit3, X, Book, Trash2, Check } from "lucide-react";
import { useUser } from "../../UserContext";

export function DocumentModule() {
  const { userProfile } = useUser();
  const [activeDoc, setActiveDoc] = useState<any>(null);
  const [highlights, setHighlights] = useState<
    { id: string; text: string; note: string; color: string; start: number; end: number }[]
  >([]);
  const [selection, setSelection] = useState<{
    text: string;
    top: number;
    left: number;
    start: number;
    end: number;
  } | null>(null);
  const [pendingHighlight, setPendingHighlight] = useState<{
    id: string;
    text: string;
    top: number;
    left: number;
    color: string;
    start: number;
    end: number;
  } | null>(null);
  const [noteText, setNoteText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Edit note state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteText, setEditNoteText] = useState("");
  const [viewingNote, setViewingNote] = useState<any>(null);
  const [modalEditMode, setModalEditMode] = useState(false);
  const [modalEditText, setModalEditText] = useState("");

  const colors = [
    { name: "黄色", value: "bg-yellow-200", display: "bg-yellow-300" },
    { name: "绿色", value: "bg-emerald-200", display: "bg-emerald-300" },
    { name: "蓝色", value: "bg-blue-200", display: "bg-blue-300" },
    { name: "粉色", value: "bg-pink-200", display: "bg-pink-300" },
  ];

  const docs = userProfile?.resources?.docs || [];

  const handleMouseUp = (e: MouseEvent) => {
    if (pendingHighlight) return;
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const containerRect = scrollRef.current?.getBoundingClientRect();

      let start = 0;
      let end = 0;
      if (scrollRef.current) {
        const rawText = range.toString();
        const trimmedText = rawText.trim();
        if (trimmedText.length === 0) {
          setSelection(null);
          return;
        }

        try {
          const preCaretRange = range.cloneRange();
          preCaretRange.selectNodeContents(scrollRef.current);
          preCaretRange.setEnd(range.startContainer, range.startOffset);

          const rawStart = preCaretRange.toString().length;
          const startOffset = rawText.indexOf(trimmedText);

          start = rawStart + (startOffset > -1 ? startOffset : 0);
          end = start + trimmedText.length;
        } catch (err) {
          setSelection(null);
          return;
        }

        const isOverlapping = highlights.some(hl =>
          (start >= hl.start && start < hl.end) ||
          (end > hl.start && end <= hl.end) ||
          (start <= hl.start && end >= hl.end)
        );

        if (isOverlapping) {
          setSelection(null);
          return;
        }
      }

      if (scrollRef.current) {
        const containerRect = scrollRef.current.getBoundingClientRect();
        // 紧贴选中文字上方，使用 absolute 相对定位避免父元素 transform 影响导致偏移
        setSelection({
          text: sel.toString().trim(),
          top: scrollRef.current.scrollTop + (rect.top - containerRect.top) - 10,
          left: scrollRef.current.scrollLeft + (rect.left - containerRect.left) + rect.width / 2,
          start,
          end
        });
      }
    } else {
      setSelection(null);
    }
  };

  const handleScroll = () => {
    if (selection && !pendingHighlight) {
      setSelection(null);
      window.getSelection()?.removeAllRanges();
    }
  };

  const handleColorSelect = (colorValue: string) => {
    if (!selection) return;
    const newId = Date.now().toString();
    setHighlights([
      ...highlights,
      { id: newId, text: selection.text, note: "", color: colorValue, start: selection.start, end: selection.end },
    ]);
    setPendingHighlight({
      id: newId,
      text: selection.text,
      top: selection.top,
      left: selection.left,
      color: colorValue,
      start: selection.start,
      end: selection.end
    });
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleSaveNote = () => {
    if (pendingHighlight) {
      setHighlights(
        highlights.map((hl) =>
          hl.id === pendingHighlight.id ? { ...hl, note: noteText } : hl
        )
      );
      setPendingHighlight(null);
      setNoteText("");

    }
  };

  const handleSaveEditedNote = (id: string, text: string) => {
      setHighlights(
        highlights.map((hl) =>
          hl.id === id ? { ...hl, note: text } : hl
        )
      );
      setEditingNoteId(null);
    };

    const deleteHighlight = (id: string) => {
      setHighlights(highlights.filter(hl => hl.id !== id));
      if (editingNoteId === id) setEditingNoteId(null);
      if (viewingNote?.id === id) setViewingNote(null);
    };

    const cancelHighlightNote = () => {
      // If cancelled, remove the highlight entirely since we just created it
      setHighlights(highlights.filter(hl => hl.id !== pendingHighlight?.id));
      setPendingHighlight(null);
      setNoteText("");
    };

    const scrollToHighlight = (hlId: string) => {
      const el = document.getElementById(`mark-${hlId}`);
      if (el && scrollRef.current) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-blue-500', 'transition-all', 'duration-500');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-blue-500');
        }, 1500);
      }
    };

    const colorMap: Record<string, string> = {
      "bg-yellow-200": "#fef08a",
      "bg-emerald-200": "#a7f3d0",
      "bg-blue-200": "#bfdbfe",
      "bg-pink-200": "#fbcfe8"
    };

    const renderContent = (content: string) => {
      let res = content;
      const sortedDesc = [...highlights].sort((a, b) => b.start - a.start);

      sortedDesc.forEach(hl => {
        const before = res.substring(0, hl.start);
        const text = res.substring(hl.start, hl.end);
        const after = res.substring(hl.end);

        const bg = colorMap[hl.color] || "#fef08a";
        const noteAttr = hl.note ? hl.note.replace(/"/g, '&quot;') : '高亮';

        const mark = `<mark id="mark-${hl.id}" class="${hl.color} rounded px-1 group relative cursor-pointer outline-none" style="background-color: ${bg}; color: inherit;" title="${noteAttr}">${text}</mark>`;

        res = before + mark + after;
      });

      return <div dangerouslySetInnerHTML={{ __html: res }} className="whitespace-pre-wrap font-sans" />;
    };

    if (activeDoc) {
      return (
        <div className="h-full flex gap-4">
          <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden relative">
            <div className="p-4 border-b border-slate-100 flex items-center gap-3">
              <button
                onClick={() => setActiveDoc(null)}
                className="p-1 hover:bg-slate-100 rounded text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
              <h3 className="font-bold text-slate-800">{activeDoc.title}</h3>
            </div>
            <div
              ref={scrollRef}
              className="p-6 overflow-y-auto flex-1 text-slate-700 leading-relaxed relative scroll-smooth selection:bg-blue-100"
              onMouseUp={handleMouseUp}
              onScroll={handleScroll}
            >
              {renderContent(activeDoc.content)}

              {selection && !pendingHighlight && (
                <div
                  className="absolute bg-white shadow-lg border border-slate-200 rounded-full py-1.5 px-2 flex gap-1.5 z-[100] transform -translate-x-1/2 -translate-y-full animate-in slide-in-from-bottom-2 fade-in duration-200"
                  style={{ top: selection.top, left: selection.left }}
                  onMouseUp={e => e.stopPropagation()}
                  onMouseDown={e => e.stopPropagation()}
                >
                  {colors.map(c => (
                    <button
                      key={c.value}
                      onClick={() => handleColorSelect(c.value)}
                      className={`w-6 h-6 rounded-full ${c.display} hover:scale-110 transition-transform flex items-center justify-center border border-black/10`}
                      title={c.name}
                    />
                  ))}
                </div>
              )}

              {pendingHighlight && (
                <div
                  className="absolute bg-white shadow-xl border border-slate-200 rounded-xl p-4 w-64 z-[100] transform -translate-x-1/2 -translate-y-full animate-in slide-in-from-bottom-2 fade-in"
                  style={{
                    top: pendingHighlight.top,
                    left: pendingHighlight.left,
                  }}
                  onMouseUp={e => e.stopPropagation()}
                  onMouseDown={e => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-3 h-3 rounded-full ${colors.find(c => c.value === pendingHighlight.color)?.display}`}></div>
                    <p className="text-xs text-slate-500 font-medium truncate">
                      笔记: "{pendingHighlight.text}"
                    </p>
                  </div>
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="输入笔记内容... (选填)"
                    className="w-full text-sm p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 mb-2 resize-none h-20"
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={cancelHighlightNote}
                      className="px-3 py-1.5 text-slate-500 hover:bg-slate-100 rounded-lg text-sm"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSaveNote}
                      className="px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-medium shadow-sm transition-colors"
                    >
                      保存
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="w-64 bg-slate-50/50 rounded-xl border border-slate-200 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-white shrink-0">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-blue-600" />
                我的笔记 ({highlights.length})
              </h4>
            </div>
            <div className="space-y-3 p-4 overflow-y-auto flex-1">
              {highlights.length === 0 ? (
                <div className="flex flex-col items-center justify-center opacity-50 py-10">
                  <Bookmark className="w-8 h-8 text-slate-400 mb-2" />
                  <p className="text-xs text-slate-500 text-center">
                    选中文本即可高亮做笔记
                  </p>
                </div>
              ) : (
                highlights.map((hl) => (
                  <div
                    key={hl.id}
                    onClick={() => {
                      scrollToHighlight(hl.id);
                      setViewingNote(hl);
                      setModalEditMode(false);
                    }}
                    className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-300 transition-colors cursor-pointer group flex flex-col relative"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <p className={`text-xs font-semibold text-slate-700 ${hl.color} inline-block px-1 rounded line-clamp-2`}>
                        "{hl.text}"
                      </p>
                    </div>

                    {hl.note && (
                      <p className="text-xs text-slate-500 line-clamp-4 leading-relaxed group-hover:text-slate-700 transition-colors">{hl.note}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Note view modal */}
          {viewingNote && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in" onClick={() => setViewingNote(null)}>
              <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-md relative animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${colors.find(c => c.value === viewingNote.color)?.display}`}></div>
                    <h3 className="font-bold text-slate-800">笔记详情</h3>
                  </div>
                  <button onClick={() => setViewingNote(null)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="mb-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <p className={`text-sm font-semibold text-slate-700 ${viewingNote.color} inline-block px-1 rounded`}>"{viewingNote.text}"</p>
                </div>

                {modalEditMode ? (
                  <div className="space-y-3">
                    <textarea
                      autoFocus
                      className="w-full text-sm p-3 border border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none h-32 bg-blue-50/20"
                      value={modalEditText}
                      onChange={e => setModalEditText(e.target.value)}
                      placeholder="写下你的笔记..."
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setModalEditMode(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-medium hover:bg-slate-200 transition-colors text-sm">
                        取消
                      </button>
                      <button onClick={() => {
                        handleSaveEditedNote(viewingNote.id, modalEditText);
                        setViewingNote({ ...viewingNote, note: modalEditText });
                        setModalEditMode(false);
                      }} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors text-sm flex items-center gap-1.5 shadow-sm">
                        <Check className="w-4 h-4" /> 保存修改
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-slate-700 leading-relaxed text-sm min-h-[80px]">
                      {viewingNote.note ? (
                        <span className="whitespace-pre-wrap">{viewingNote.note}</span>
                      ) : (
                        <span className="text-slate-400 italic">尚未添加笔记内容</span>
                      )}
                    </div>
                    <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                      <button
                        onClick={() => {
                          deleteHighlight(viewingNote.id);
                        }}
                        className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg font-medium transition-colors flex items-center gap-1.5"
                      >
                        <Trash2 className="w-4 h-4" /> 删除
                      </button>
                      <button
                        onClick={() => {
                          setModalEditText(viewingNote.note || "");
                          setModalEditMode(true);
                        }}
                        className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg font-medium transition-colors flex items-center gap-1.5"
                      >
                        <Edit3 className="w-4 h-4" /> 编辑
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4 h-full p-2 place-content-start overflow-y-auto">
        {docs.map((doc) => (
          <div
            key={doc.id}
            onClick={() => setActiveDoc(doc)}
            className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group flex flex-col gap-3"
          >
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <Book className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-800 group-hover:text-blue-700 transition-colors">
              {doc.title}
            </h3>
            <p className="text-sm text-slate-500 line-clamp-2">{doc.content}</p>
          </div>
        ))}
      </div>
    );
  }
