import React, { useState, useRef, useEffect } from "react";
import { Terminal, Lightbulb, Play, BookOpen, Star, Bookmark, X, Search, Folder, Plus, Trash2, Maximize } from "lucide-react";
import { useUser } from "../../UserContext";

export function CodeModule() {
  const { userProfile, emitLearningEvent } = useUser();
  const codeEx = userProfile?.resources?.codeEx || {
    title: "未配置实验",
    language: "Python",
    requirement: "暂无实验要求",
    hint: "无",
    initialCode: "# 请根据提示开始编写...",
    answer: "# 暂无参考答案"
  };

  const initialCode = codeEx.initialCode;
  const correctAnswer = codeEx.answer;

  const [code, setCode] = useState(initialCode);
  const [consoleOutput, setConsoleOutput] = useState<string[]>([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isFullscreenAnswer, setIsFullscreenAnswer] = useState(false);
  const [toastStr, setToastStr] = useState("");

  // Sync initial code if profile changes
  useEffect(() => {
    setCode(codeEx.initialCode);
  }, [codeEx.initialCode]);

  // Favorites state
  const [showFavorites, setShowFavorites] = useState(false);
  const [localFavorites, setLocalFavorites] = useState<{id: string, title: string, folder: string}[]>([]);
  const [localFolders, setLocalFolders] = useState<string[]>(["全部收藏", "默认文件夹"]);
  const [activeFolder, setActiveFolder] = useState("全部收藏");
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const runCode = () => {
    setConsoleOutput(["正在运行...", ""]);

    // Emit code run event
    emitLearningEvent("code_run", {
      codeExTitle: codeEx.title,
      language: codeEx.language,
      charactersInEditor: code.length,
    });

    setTimeout(() => {
      let output = "执行完毕。";
      if (code.includes("print(\"你好，世界！\")") || code.includes("print('你好，世界！')")) {
        output = "你好，世界！\n执行完毕。";
      } else if (code.includes("plot(x, y)") || code.includes("plt.show()")) {
         output = "[Matplotlib] 生成了图像 1 并在后台渲染...\n绘制完成！\n执行完毕。";
      } else {
        output = "执行结果为空。\n执行完毕。";
      }
      setConsoleOutput(prev => [...prev, output]);
    }, 600);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runCode();
    }
  };

  const isCollected = localFavorites.some(f => f.title === "【代码实操】绘制抛物线");

  const toggleCollect = () => {
    if (isCollected) {
      setLocalFavorites(localFavorites.filter(f => f.title !== "【代码实操】绘制抛物线"));
      setToastStr("已取消收藏");
    } else {
      setLocalFavorites([...localFavorites, { id: Date.now().toString(), title: "【代码实操】绘制抛物线", folder: "默认文件夹" }]);
      setToastStr("已收藏题目");
    }
    setTimeout(() => setToastStr(""), 2000);
  };

  const handleAddFolder = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newFolderName.trim()) {
      if (!localFolders.includes(newFolderName.trim())) {
        setLocalFolders([...localFolders, newFolderName.trim()]);
      }
      setNewFolderName("");
      setIsAddingFolder(false);
    }
  };

  const dbFavorites = localFavorites
    .filter(fav => activeFolder === "全部收藏" || fav.folder === activeFolder)
    .filter(fav => !searchQuery || fav.title.includes(searchQuery));

  return (
    <div className="h-full flex gap-4 relative">
       {toastStr && (
         <div className="absolute top-0 right-4 bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl text-sm font-medium z-50 animate-in fade-in slide-in-from-top-4 shadow-sm border border-emerald-100">
           {toastStr}
         </div>
       )}
       
       {/* Left Panel: Task */}
       <div className="w-[35%] flex flex-col bg-white border border-slate-200 rounded-2xl overflow-hidden shrink-0 shadow-sm relative z-0">
         <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col gap-3 shrink-0">
           <div className="flex items-center justify-between">
             <h3 className="font-bold text-slate-800 tracking-tight">{codeEx.title}</h3>
             <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2.5 py-1 rounded-lg">{codeEx.language}</span>
           </div>
           
           <div className="flex gap-2">
             <button onClick={() => setShowFavorites(true)} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 font-medium hover:bg-slate-50 transition-colors">
               <Bookmark className="w-4 h-4" /> 收藏夹
             </button>
             <button onClick={toggleCollect} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 border rounded-lg text-sm font-medium transition-colors ${isCollected ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
               <Star className={`w-4 h-4 ${isCollected ? 'fill-current' : ''}`} /> {isCollected ? '已收藏' : '收藏'}
             </button>
           </div>
         </div>
         
         <div className="p-6 flex-1 overflow-y-auto text-slate-700 leading-relaxed text-[15px] space-y-6">
           <div className="space-y-2">
             <h4 className="font-bold text-slate-800 text-sm">任务要求</h4>
             <p className="text-slate-600">{codeEx.requirement}</p>
           </div>
           
           <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex gap-3 text-blue-800 text-sm">
             <Lightbulb className="w-5 h-5 shrink-0 text-blue-500" />
             <p className="leading-relaxed">提示：{codeEx.hint}</p>
           </div>
           
           <button 
             onClick={() => setShowAnswer(!showAnswer)}
             className="w-full flex justify-center items-center gap-2 py-3 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold rounded-xl transition-colors border border-slate-200 border-dashed"
           >
             <BookOpen className="w-4 h-4" /> {showAnswer ? '隐藏答案' : '查看答案与解析'}
           </button>
           
           {showAnswer && (
             <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 animate-in slide-in-from-top-4 fade-in relative">
               <button onClick={() => setIsFullscreenAnswer(true)} className="absolute top-3 right-3 p-1.5 bg-white rounded-lg text-emerald-600 shadow-sm border border-emerald-200 hover:bg-emerald-100 transition-colors">
                 <Maximize className="w-4 h-4" />
               </button>
               <h4 className="font-bold text-emerald-800 text-sm mb-3 pr-8">参考代码</h4>
               <div className="bg-slate-900 rounded-xl overflow-hidden group relative border border-slate-800 shadow-sm transition-all hover:shadow-md">
                 <div className="flex items-center justify-between px-4 py-2 bg-slate-950/80 border-b border-slate-800/80">
                   <span className="text-xs font-mono text-slate-400">参考代码</span>
                   <button 
                     onClick={(e) => { e.stopPropagation(); setCode(correctAnswer); setToastStr("代码已应用到编辑器"); setTimeout(() => setToastStr(""), 2000); }}
                     className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-400 rounded-lg text-xs font-bold transition-colors z-10 hidden sm:block"
                   >
                     点击应用代码
                   </button>
                 </div>
                 <div className="p-4 cursor-pointer hover:bg-slate-800/50 transition-colors relative" onClick={() => setIsFullscreenAnswer(true)}>
                   <pre className="text-emerald-300 font-mono text-xs leading-relaxed max-w-full overflow-x-auto pointer-events-none pb-4">
                     {correctAnswer}
                   </pre>
                   <div className="absolute right-3 bottom-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="flex items-center gap-1.5 bg-black/60 text-white/90 text-xs px-2.5 py-1.5 rounded-lg font-medium backdrop-blur-sm pointer-events-none">
                        <Maximize className="w-3.5 h-3.5" /> 点击全屏查看
                      </span>
                   </div>
                 </div>
               </div>
             </div>
           )}
         </div>
       </div>
       
       {/* Right Panel: Editor */}
       <div className="flex-1 flex flex-col bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-xl relative min-w-0 z-0">
         <div className="h-12 bg-slate-950 flex items-center px-4 justify-between shrink-0 border-b border-white/10">
           <div className="flex gap-1.5">
             <div className="w-3 h-3 rounded-full bg-rose-500/80"></div>
             <div className="w-3 h-3 rounded-full bg-orange-500/80"></div>
             <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
           </div>
           <div className="text-xs text-slate-400 font-mono font-medium bg-white/5 px-3 py-1 rounded w-fit mx-auto">main.py</div>
           <div>
             <button onClick={runCode} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded text-xs font-bold transition-colors shadow-[0_0_15px_rgba(16,185,129,0.3)]">
               <Play className="w-3.5 h-3.5 fill-current" /> 运行 <span className="opacity-60 hidden xl:inline">(Cmd/Ctrl + Enter)</span>
             </button>
           </div>
         </div>
         
         <div className="flex-1 relative flex text-[13px] sm:text-sm">
           <div className="absolute inset-0 pb-4 overflow-y-auto w-full flex">
             <div className="w-10 text-slate-600 text-right pr-3 select-none font-mono leading-relaxed pt-4 bg-slate-950/30">
               {code.split('\n').map((_, i) => <div key={i}>{i + 1}</div>)}
             </div>
             <textarea 
               value={code}
               onChange={e => setCode(e.target.value)}
               onKeyDown={handleKeyDown}
               spellCheck={false}
               className="flex-1 min-w-0 resize-none bg-transparent outline-none text-slate-300 font-mono leading-relaxed p-4 whitespace-pre whitespace-pre-wrap flex-nowrap break-normal"
             />
           </div>
         </div>
         
         {/* Console */}
         <div className="h-48 bg-slate-950 border-t border-white/10 p-2 shrink-0 flex flex-col">
           <div className="flex items-center gap-2 mb-2 px-2 text-slate-400">
             <Terminal className="w-4 h-4" />
             <span className="text-xs font-bold font-mono">控制台</span>
             {consoleOutput.length > 0 && (
               <button onClick={() => setConsoleOutput([])} className="ml-auto text-xs hover:text-white transition-colors">清空</button>
             )}
           </div>
           <div className="flex-1 font-mono text-[13px] text-emerald-400 p-2 overflow-y-auto whitespace-pre-line bg-black/40 rounded-lg hidden-scrollbar">
             {consoleOutput.length === 0 ? <span className="text-slate-600">&gt; 等待执行...</span> : consoleOutput.join('\n')}
           </div>
         </div>
       </div>

       {isFullscreenAnswer && (
         <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-8 lg:p-12" onClick={() => setIsFullscreenAnswer(false)}>
            <div className="bg-white rounded-3xl shadow-xl w-full max-w-5xl h-full flex flex-col overflow-hidden animate-in fade-in zoom-in-95" onClick={e => e.stopPropagation()}>
               <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                 <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><BookOpen className="w-6 h-6 text-emerald-500" /> 参考答案与解析</h2>
                 <button onClick={() => setIsFullscreenAnswer(false)} className="p-2 text-slate-400 hover:text-slate-600 bg-white shadow-sm hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors">
                   <X className="w-6 h-6" />
                 </button>
               </div>
               <div className="flex-1 overflow-y-auto p-8 relative">
                 <div className="max-w-3xl mx-auto flex flex-col gap-8">
                   <div>
                     <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                       <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">1</span>
                       详细解析
                     </h3>
                     <p className="text-slate-700 leading-relaxed text-[15px] p-5 bg-emerald-50 rounded-2xl border border-emerald-100">
                       使用 <code className="font-mono font-bold bg-white px-2 py-1 rounded border border-emerald-200 text-emerald-700">np.linspace(-10, 10, 100)</code> 可以平滑生成从 -10 到 10 的 100 个序列点，然后直接利用 Numpy 的广播机制计算出所有的对应的 y 值，最后利用 matplotlib 画出平滑的抛物线并渲染显示。
                     </p>
                   </div>
                   
                   <div>
                     <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                       <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">2</span>
                       参考代码
                     </h3>
                     <div className="bg-slate-900 rounded-2xl p-6 shadow-xl overflow-hidden relative group border border-slate-800">
                       <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-800">
                         <span className="text-slate-400 font-mono text-sm">main.py</span>
                         <button 
                           onClick={() => { setCode(correctAnswer); setIsFullscreenAnswer(false); setToastStr("代码已应用到编辑器"); setTimeout(() => setToastStr(""), 2000); }} 
                           className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 rounded-xl text-sm font-bold transition-colors"
                         >
                           应用到编辑器
                         </button>
                       </div>
                       <pre className="text-blue-300 font-mono text-sm leading-relaxed text-left overflow-x-auto whitespace-pre">
                         <span className="text-rose-400">import</span> matplotlib.pyplot <span className="text-rose-400">as</span> plt
                         <br/>
                         <span className="text-rose-400">import</span> numpy <span className="text-rose-400">as</span> np
                         <br/><br/>
                         <span className="text-slate-500"># 生成x坐标</span><br/>
                         x = np.linspace(-10, 10, 100)<br/>
                         <span className="text-slate-500"># 计算y坐标</span><br/>
                         y = x**2<br/><br/>
                         <span className="text-slate-500"># 绘制抛物线</span><br/>
                         plt.plot(x, y)<br/>
                         plt.title(<span className="text-emerald-300">"Parabola: y = x^2"</span>)<br/>
                         plt.show()<br/>
                         <span className="text-blue-400">print</span>(<span className="text-emerald-300">"绘制完成！"</span>)
                       </pre>
                     </div>
                   </div>
                 </div>
               </div>
            </div>
         </div>
       )}

       {/* Favorites Modal */}
       {showFavorites && (
        <div className="fixed inset-0 z-[110] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowFavorites(false)}>
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-4xl h-[600px] flex overflow-hidden animate-in fade-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col pt-6">
              <h3 className="px-6 font-bold text-slate-800 mb-4">代码收藏夹</h3>
              <div className="flex-1 overflow-y-auto px-4 space-y-1 block">
                {localFolders.map(folder => (
                  <button 
                    key={folder}
                    onClick={() => setActiveFolder(folder)}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${activeFolder === folder ? 'bg-blue-100/50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    <Folder className={`w-4 h-4 ${activeFolder === folder ? 'text-blue-500 fill-current opacity-20' : 'text-slate-400'}`} />
                    {folder}
                  </button>
                ))}
                
                {isAddingFolder ? (
                  <div className="px-3 py-2 mt-2">
                    <input 
                      autoFocus
                      type="text"
                      value={newFolderName}
                      onChange={e => setNewFolderName(e.target.value)}
                      onKeyDown={handleAddFolder}
                      onBlur={() => setIsAddingFolder(false)}
                      placeholder="输入文件夹名回车..."
                      className="w-full text-sm bg-white border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                    />
                  </div>
                ) : (
                  <button 
                    onClick={() => setIsAddingFolder(true)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors mt-2"
                  >
                    <Plus className="w-4 h-4" />
                    新建文件夹
                  </button>
                )}
              </div>
            </div>
            
            <div className="flex-1 flex flex-col">
              <div className="h-16 border-b border-slate-100 flex items-center justify-between px-6 shrink-0">
                <div className="relative w-64">
                   <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                   <input 
                     type="text"
                     value={searchQuery}
                     onChange={e => setSearchQuery(e.target.value)}
                     placeholder="搜索题目..."
                     className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all placeholder:text-slate-400"
                   />
                </div>
                <button onClick={() => setShowFavorites(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 p-6 overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-slate-800">{activeFolder}</h2>
                  <span className="text-sm font-medium text-slate-500">共 {dbFavorites.length} 项</span>
                </div>
                
                {dbFavorites.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                     <Star className="w-12 h-12 mb-4 opacity-50" />
                     <p>暂无收藏内容</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {dbFavorites.map(fav => (
                      <div key={fav.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-blue-300 transition-colors group cursor-pointer relative flex flex-col gap-2">
                        <div className="w-10 h-10 bg-blue-100/50 rounded-lg flex items-center justify-center">
                          <Bookmark className="w-5 h-5 text-blue-600" />
                        </div>
                        <h4 className="font-bold text-slate-800 text-[15px] group-hover:text-blue-700 transition-colors">{fav.title}</h4>
                        <p className="text-xs text-slate-500 font-medium">{fav.folder}</p>
                        
                        <button 
                          onClick={(e) => { e.stopPropagation(); setLocalFavorites(localFavorites.filter(f => f.id !== fav.id)); }}
                          className="absolute top-4 right-4 p-1.5 bg-white text-rose-500 rounded-lg border border-slate-200 opacity-0 group-hover:opacity-100 hover:bg-rose-50 hover:border-rose-200 transition-all shadow-sm"
                          title="删除"
                        >
                           <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
