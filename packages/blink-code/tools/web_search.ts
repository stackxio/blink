let _apiKey = "";

export function setApiKey(key: string) {
  _apiKey = key;
}

interface BraveSearchResult {
  title: string;
  url: string;
  description?: string;
}

interface BraveSearchResponse {
  web?: {
    results?: BraveSearchResult[];
  };
}

export async function web_search(input: Record<string, unknown>): Promise<string> {
  if (!_apiKey) {
    return "Web search is not configured. Add a Brave Search API key in Settings → Providers.";
  }

  const query = input["query"] as string;
  const count = Math.min(typeof input["count"] === "number" ? input["count"] : 5, 10);

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;

  let data: BraveSearchResponse;
  try {
    const resp = await fetch(url, {
      headers: {
        "X-Subscription-Token": _apiKey,
        Accept: "application/json",
      },
    });

    if (!resp.ok) {
      return `Web search failed: HTTP ${resp.status} ${resp.statusText}`;
    }

    data = (await resp.json()) as BraveSearchResponse;
  } catch (err) {
    return `Web search error: ${String(err)}`;
  }

  const results = data.web?.results ?? [];
  if (results.length === 0) {
    return "No results found.";
  }

  return results
    .map((r, i) => {
      const lines = [`${i + 1}. ${r.title}`, `   URL: ${r.url}`];
      if (r.description) lines.push(`   ${r.description}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

export const def = {
  name: "web_search",
  description:
    "Search the web using Brave Search API. Returns a list of results with titles, URLs, and descriptions. Requires a Brave Search API key configured in Settings → Providers.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query",
      },
      count: {
        type: "number",
        description: "Number of results to return (default: 5, max: 10)",
      },
    },
    required: ["query"],
  },
};
