import React, { useState, useMemo, useRef, useEffect } from "react";
import ReactECharts from "echarts-for-react";
import { Bookmark, Star, Maximize, Minimize, Folder, Plus, X, Search, Trash2, Download } from "lucide-react";
import { useUser } from "../../UserContext";

export function MindmapModule() {
  const { userProfile, emitLearningEvent } = useUser();
  const [toastStr, setToastStr] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const echartsRef = useRef<ReactECharts>(null);

  // Local Favorites State
  const [localFavorites, setLocalFavorites] = useState<{id: string, title: string, folder: string}[]>([]);
  const [localFolders, setLocalFolders] = useState<string[]>(["全部收藏", "默认文件夹"]);
  const [activeFolder, setActiveFolder] = useState("全部收藏");
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const data = userProfile?.resources?.mindmap || { name: "暂无数据", value: 100, children: [] };

  // Emit view event on mount
  useEffect(() => {
    emitLearningEvent("mindmap_view", {
      topic: data.name,
      nodeCount: data.children?.length || 0,
    });
  }, []);

  const isCollected = localFavorites.some(
    (f) => f.title === data.name,
  );

  const toggleCollect = () => {
    if (isCollected) {
      setLocalFavorites(
        localFavorites.filter((f) => f.title !== data.name),
      );
      setToastStr("已取消收藏");
    } else {
      setLocalFavorites([
        ...localFavorites,
        {
          id: Date.now().toString(),
          title: data.name,
          folder: "默认文件夹",
        },
      ]);
      setToastStr("已收藏导图");
    }
    setTimeout(() => setToastStr(""), 2000);
  };

  const option = useMemo(() => {
    return {
      tooltip: {
        trigger: "item",
        triggerOn: "mousemove",
      },
      series: [
        {
          type: "tree",
          data: [data],
          top: "10%",
          left: "15%",
          bottom: "10%",
          right: "25%",
          symbolSize: 12,
          roam: true,
          label: {
            position: "left",
            verticalAlign: "middle",
            align: "right",
            fontSize: 14,
            fontWeight: "bold",
            color: "#334155",
          },
          leaves: {
            label: {
              position: "right",
              verticalAlign: "middle",
              align: "left",
              fontSize: 13,
              fontWeight: "normal",
              color: "#475569",
            },
          },
          expandAndCollapse: true,
          animationDuration: 550,
          animationDurationUpdate: 750,
          lineStyle: {
            color: "#cbd5e1",
            curveness: 0.5,
          },
          itemStyle: {
            color: "#3b82f6",
            borderColor: "#bfdbfe",
            borderWidth: 2,
          },
        },
      ],
    };
  }, []);

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

  const handleDownload = () => {
    if (echartsRef.current) {
      const url = echartsRef.current.getEchartsInstance().getDataURL({
        type: 'png',
        backgroundColor: '#fff',
        pixelRatio: 2
      });
      const a = document.createElement('a');
      a.href = url;
      a.download = '思维导图.png';
      a.click();
    }
  };

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-4 relative flex flex-col ${isFullscreen ? 'fixed inset-4 z-[100]' : 'h-full w-full'}`}>
      <div className="absolute top-6 right-6 z-10 flex gap-2 items-center">
        {toastStr && (
          <span className="text-sm text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full animate-in fade-in">
            {toastStr}
          </span>
        )}
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 shadow-sm"
          title="下载导图"
        >
          <Download className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowFavorites(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100"
        >
          <Bookmark className="w-4 h-4" />
          收藏夹
        </button>
        <button
          onClick={toggleCollect}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm ${
            isCollected
              ? "bg-orange-50 text-orange-600 border border-orange-200"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <Star className={`w-4 h-4 ${isCollected ? "fill-current" : ""}`} />
          {isCollected ? "已收藏" : "收藏导图"}
        </button>
        <button
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 shadow-sm"
        >
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </button>
      </div>
      <p className="text-slate-500 text-sm mb-2 font-medium px-4 pt-2">
        可滚动鼠标缩放，拖拽平移，点击节点展开收起
      </p>
      <div className="flex-1 w-full relative cursor-pointer" onClick={(e) => {
        // Prevent toggle if clicking on the action buttons container
        if (!isFullscreen) setIsFullscreen(true);
      }}>
        <ReactECharts
          ref={echartsRef}
          option={option}
          style={{ height: "100%", width: "100%" }}
          opts={{ renderer: "canvas" }}
        />
      </div>

      {showFavorites && (
        <div className="fixed inset-0 z-[110] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowFavorites(false)}>
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-4xl h-[600px] flex overflow-hidden animate-in fade-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col pt-6">
              <h3 className="px-6 font-bold text-slate-800 mb-4">导图收藏夹</h3>
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
                     placeholder="搜索导图..."
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
