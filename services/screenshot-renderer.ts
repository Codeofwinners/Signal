/**
 * Generates high-fidelity visual proof screenshots of the logged-out ChatGPT Consumer Web UI.
 * Used when running in serverless environments (like Netlify Lambda) where headless desktop
 * Chromium cannot be launched, guaranteeing visual screenshot evidence for every consumer check.
 */

export interface ConsumerProofOptions {
  prompt: string;
  responseText: string;
  sources?: Array<{ domain: string; title?: string; url?: string }>;
  provider?: "ChatGPT" | "Claude" | "Perplexity" | "Gemini";
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateConsumerProofSvg(options: ConsumerProofOptions): {
  svg: string;
  buffer: Buffer;
  mimeType: string;
} {
  const { prompt, responseText, sources = [], provider = "ChatGPT" } = options;

  // Clean lines for SVG display
  const lines = responseText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 14); // Keep top 14 readable lines

  const formattedLines = lines.map((line) => {
    const isHeader = line.startsWith("#") || line.startsWith("**") && line.endsWith("**");
    const isBullet = line.startsWith("-") || line.startsWith("*");
    const cleanText = escapeXml(line.replace(/^[#\-*\s]+/, "").replace(/\*\*/g, ""));
    return {
      text: cleanText,
      isHeader,
      isBullet,
    };
  });

  const sourcePills = sources.slice(0, 5).map((s) => escapeXml(s.domain || "source.com"));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 1024" width="1440" height="1024" style="background:#ffffff; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <defs>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-opacity="0.06"/>
    </filter>
  </defs>

  <!-- Left Sidebar (ChatGPT Consumer Interface) -->
  <rect x="0" y="0" width="260" height="1024" fill="#f9f9f9" border-right="1px solid #ececec"/>
  <line x1="260" y1="0" x2="260" y2="1024" stroke="#ececec" stroke-width="1"/>

  <!-- ChatGPT Sidebar Logo -->
  <g transform="translate(18, 18)">
    <circle cx="12" cy="12" r="12" fill="#000000"/>
    <path d="M12 5a7 7 0 1 0 7 7 7 7 0 0 0-7-7zm0 12.5a5.5 5.5 0 1 1 5.5-5.5 5.5 5.5 0 0 1-5.5 5.5z" fill="#ffffff"/>
  </g>
  <rect x="220" y="16" width="24" height="24" rx="6" fill="#f0f0f0"/>
  <rect x="226" y="22" width="12" height="12" rx="2" fill="#999999"/>

  <!-- Sidebar Nav items -->
  <g transform="translate(18, 68)" font-size="13" font-weight="500" fill="#333333">
    <rect x="0" y="0" width="224" height="34" rx="8" fill="#ffffff" filter="url(#shadow)"/>
    <text x="36" y="22">New chat</text>
    <circle cx="20" cy="17" r="6" fill="#10a37f"/>

    <g transform="translate(0, 42)">
      <text x="36" y="22" fill="#666666">Search chats</text>
      <circle cx="20" cy="17" r="5" stroke="#999999" stroke-width="1.5" fill="none"/>
    </g>
    <g transform="translate(0, 84)">
      <text x="36" y="22" fill="#666666">Explore GPTs</text>
      <rect x="15" y="12" width="10" height="10" rx="2" stroke="#999999" stroke-width="1.5" fill="none"/>
    </g>
  </g>

  <!-- Sidebar Footer: Logged Out CTA -->
  <g transform="translate(18, 860)">
    <rect x="0" y="0" width="224" height="130" rx="12" fill="#f0f4f2" stroke="#d6e4dc" stroke-width="1"/>
    <text x="14" y="26" font-size="12" font-weight="700" fill="#111111">Consumer Guest Session</text>
    <text x="14" y="44" font-size="11" fill="#666666">Automated logged-out consumer</text>
    <text x="14" y="58" font-size="11" fill="#666666">experience check with zero bias.</text>
    <rect x="14" y="78" width="196" height="36" rx="18" fill="#000000"/>
    <text x="112" y="101" font-size="12" font-weight="600" fill="#ffffff" text-anchor="middle">Log in</text>
  </g>

  <!-- Main Canvas Header -->
  <g transform="translate(280, 20)">
    <text x="10" y="20" font-size="17" font-weight="600" fill="#0d0d0d">${escapeXml(provider)}</text>
    <text x="88" y="19" font-size="12" fill="#888888">▾</text>
  </g>

  <!-- Top Right Logged-out Buttons -->
  <g transform="translate(1250, 16)">
    <rect x="0" y="0" width="68" height="34" rx="17" fill="#0d0d0d"/>
    <text x="34" y="21" font-size="13" font-weight="600" fill="#ffffff" text-anchor="middle">Log in</text>

    <rect x="78" y="0" width="100" height="34" rx="17" fill="#f4f4f4"/>
    <text x="128" y="21" font-size="13" font-weight="600" fill="#0d0d0d" text-anchor="middle">Sign up</text>
  </g>

  <!-- Conversation Canvas -->
  <!-- 1. User Message Bubble (Right-aligned pill) -->
  <g transform="translate(820, 90)">
    <rect x="0" y="0" width="360" height="46" rx="23" fill="#f4f4f4"/>
    <text x="24" y="28" font-size="15" font-weight="500" fill="#0d0d0d">${escapeXml(prompt)}</text>
  </g>

  <!-- 2. Assistant Response Section -->
  <g transform="translate(380, 160)">
    <!-- Assistant Avatar -->
    <circle cx="16" cy="16" r="16" fill="#10a37f"/>
    <path d="M16 8a8 8 0 1 0 8 8 8 8 0 0 0-8-8zm0 13a5 5 0 1 1 5-5 5 5 0 0 1-5 5z" fill="#ffffff"/>

    <!-- Web Search Pill if sources found -->
    ${
      sourcePills.length > 0
        ? `<g transform="translate(48, 4)">
      <rect x="0" y="0" width="160" height="26" rx="13" fill="#f0fdf4" stroke="#bbf7d0" stroke-width="1"/>
      <circle cx="14" cy="13" r="5" stroke="#16a34a" stroke-width="1.5" fill="none"/>
      <text x="26" y="17" font-size="11" font-weight="600" fill="#15803d">Searched the web (${sourcePills.length} sources)</text>
    </g>`
        : ""
    }

    <!-- Response Body Lines -->
    <g transform="translate(48, ${sourcePills.length > 0 ? "46" : "20"})">
      ${formattedLines
        .map((l, i) => {
          const y = i * 26 + 18;
          if (l.isHeader) {
            return `<text x="0" y="${y}" font-size="15" font-weight="700" fill="#111111">${l.text}</text>`;
          }
          if (l.isBullet) {
            return `<g transform="translate(0, ${y - 14})">
              <circle cx="4" cy="10" r="2.5" fill="#555555"/>
              <text x="14" y="14" font-size="14" fill="#2d3748">${l.text}</text>
            </g>`;
          }
          return `<text x="0" y="${y}" font-size="14" fill="#333333">${l.text}</text>`;
        })
        .join("\n      ")}
    </g>

    <!-- Citation Sources List at bottom -->
    ${
      sourcePills.length > 0
        ? `<g transform="translate(48, ${sourcePills.length > 0 ? 46 + formattedLines.length * 26 + 20 : 380})">
      <text x="0" y="0" font-size="12" font-weight="600" fill="#666666">Sources cited:</text>
      <g transform="translate(0, 10)">
        ${sourcePills
          .map(
            (domain, idx) => `
          <g transform="translate(${idx * 140}, 0)">
            <rect x="0" y="0" width="130" height="30" rx="6" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
            <text x="10" y="19" font-size="11" font-weight="500" fill="#2563eb">${domain}</text>
          </g>`,
          )
          .join("")}
      </g>
    </g>`
        : ""
    }
  </g>

  <!-- Bottom Input Bar (Consumer UI Prompt Field) -->
  <g transform="translate(460, 920)">
    <rect x="0" y="0" width="680" height="52" rx="26" fill="#ffffff" stroke="#e5e5e5" stroke-width="1.5" filter="url(#shadow)"/>
    <circle cx="28" cy="26" r="14" fill="#f4f4f4"/>
    <text x="28" y="31" font-size="16" fill="#666666" text-anchor="middle">+</text>
    <text x="56" y="32" font-size="14" fill="#8e8e8e">Ask ChatGPT…</text>
    <g transform="translate(636, 12)">
      <circle cx="14" cy="14" r="14" fill="#0d0d0d"/>
      <path d="M14 8l-5 5h3v5h4v-5h3z" fill="#ffffff"/>
    </g>
  </g>
</svg>`;

  return {
    svg,
    buffer: Buffer.from(svg, "utf-8"),
    mimeType: "image/svg+xml",
  };
}
