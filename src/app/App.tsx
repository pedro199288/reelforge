import { useState } from "react";
import { SelectorView } from "./views/SelectorView";
import { PreviewView } from "./views/PreviewView";

type Tab = "selector" | "preview" | "studio";

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>("selector");

  const tabs: { id: Tab; label: string; external?: string }[] = [
    { id: "selector", label: "Selector" },
    { id: "preview", label: "Preview" },
    { id: "studio", label: "Studio", external: "http://localhost:3001" },
  ];

  return (
    <div className="flex flex-col h-screen">
      {/* Header con tabs */}
      <header className="flex items-center px-4 h-12 border-b border-border gap-2">
        <span className="font-semibold mr-6">ReelForge</span>
        <nav className="flex gap-1">
          {tabs.map((tab) =>
            tab.external ? (
              <a
                key={tab.id}
                href={tab.external}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-md bg-transparent text-muted-foreground no-underline text-sm flex items-center gap-1 hover:text-foreground transition-colors"
              >
                {tab.label}
                <span className="text-[10px]">↗</span>
              </a>
            ) : (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-md border-none cursor-pointer text-sm transition-colors ${
                  activeTab === tab.id
                    ? "bg-muted text-foreground"
                    : "bg-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            )
          )}
        </nav>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === "selector" && <SelectorView />}
        {activeTab === "preview" && <PreviewView />}
      </main>
    </div>
  );
};
