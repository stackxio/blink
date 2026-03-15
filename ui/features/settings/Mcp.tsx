import { ExternalLink, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const DOCS_URL = "https://modelcontextprotocol.io";

const RECOMMENDED_SERVERS = [
  {
    id: "linear",
    name: "Linear",
    by: "Linear",
    description: "Integrate with Linear's issue tracking and project management",
    icon: "L",
    iconBg: "bg-neutral-600",
  },
  {
    id: "notion",
    name: "Notion",
    by: "Notion",
    description: "Read docs, update pages, manage tasks",
    icon: "N",
    iconBg: "bg-neutral-600",
  },
  {
    id: "figma",
    name: "Figma",
    by: "Figma",
    description: "Generate better code by bringing in full Figma context",
    icon: "F",
    iconBg: "bg-purple-600",
  },
  {
    id: "playwright",
    name: "Playwright",
    by: "Microsoft",
    description: "Integrate browser automation to implement design and test UI.",
    icon: "P",
    iconBg: "bg-emerald-600",
  },
];

export default function SettingsMcp() {
  function handleAddServer() {
    // Placeholder — implement later
  }

  function handleRefresh() {
    // Placeholder — implement later
  }

  function handleInstall(id: string) {
    void id; // placeholder — implement later
    // Placeholder — implement later
  }

  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold text-foreground">MCP servers</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Connect external tools and data sources.{" "}
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-foreground underline underline-offset-2 transition-colors hover:text-muted-foreground"
        >
          Docs
          <ExternalLink size={12} />
        </a>
      </p>

      {/* Custom servers */}
      <h2 className="mb-2 text-sm font-medium text-foreground">Custom servers</h2>
      <div className="mb-8 flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
        <p className="text-sm text-muted-foreground">No custom MCP servers connected</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddServer}
          className="gap-1.5 text-xs"
        >
          <Plus size={14} />
          Add server
        </Button>
      </div>

      {/* Recommended servers */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-foreground">Recommended servers</h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw size={12} />
          Refresh
        </Button>
      </div>
      <div className="mt-3 space-y-2">
        {RECOMMENDED_SERVERS.map((server) => (
          <div
            key={server.id}
            className="flex items-center gap-4 rounded-lg border border-border bg-surface px-4 py-3"
          >
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${server.iconBg} text-sm font-semibold text-white`}
            >
              {server.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                {server.name} by {server.by}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{server.description}</p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => handleInstall(server.id)}
              className="shrink-0 bg-[#55aaff] text-xs text-white hover:bg-[#66bbff]"
            >
              Install
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
