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
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Header con tabs */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          height: 48,
          borderBottom: "1px solid #333",
          gap: 8,
        }}
      >
        <span style={{ fontWeight: 600, marginRight: 24 }}>ReelForge</span>
        <nav style={{ display: "flex", gap: 4 }}>
          {tabs.map((tab) =>
            tab.external ? (
              <a
                key={tab.id}
                href={tab.external}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  background: "transparent",
                  color: "#888",
                  textDecoration: "none",
                  fontSize: 14,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {tab.label}
                <span style={{ fontSize: 10 }}>↗</span>
              </a>
            ) : (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: activeTab === tab.id ? "#333" : "transparent",
                  color: activeTab === tab.id ? "#fff" : "#888",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                {tab.label}
              </button>
            )
          )}
        </nav>
      </header>

      {/* Content */}
      <main style={{ flex: 1, overflow: "hidden" }}>
        {activeTab === "selector" && <SelectorView />}
        {activeTab === "preview" && <PreviewView />}
      </main>
    </div>
  );
};
