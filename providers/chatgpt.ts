import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export interface ChatGPTCheckOptions {
  prompt: string;
  headless?: boolean;
  onStatus?: (
    status: "running" | "capturing" | "analyzing" | "blocked" | "needs_review" | "failed",
    detail?: string,
  ) => Promise<void> | void;
}

export interface ChatGPTCheckSuccess {
  success: true;
  status: "capturing";
  screenshotBuffer: Buffer;
  responseText: string;
}

export interface ChatGPTCheckFailure {
  success: false;
  status: "blocked" | "needs_review" | "failed";
  error: string;
  screenshotBuffer?: Buffer;
}

export type ChatGPTCheckResult = ChatGPTCheckSuccess | ChatGPTCheckFailure;

/**
 * Executes a clean, isolated, logged-out consumer check on ChatGPT (chatgpt.com).
 * Adheres strictly to requirements:
 * - Fresh context (no cookies, no prior session, no saved auth).
 * - Normal consumer interface (no API).
 * - Graceful failure on CAPTCHAs, Cloudflare, login walls, or rate limits without circumvention.
 */
export async function runPrompt(options: ChatGPTCheckOptions): Promise<ChatGPTCheckResult> {
  const { prompt, headless = true, onStatus } = options;

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  try {
    await onStatus?.("running", "Launching pristine browser context");

    browser = await chromium.launch({
      headless,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    context = await browser.newContext({
      locale: "en-US",
      timezoneId: "America/Los_Angeles",
      viewport: { width: 1440, height: 1200 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });

    const page: Page = await context.newPage();

    // 1. Navigate to ChatGPT consumer home
    await onStatus?.("running", "Navigating to chatgpt.com");
    try {
      await page.goto("https://chatgpt.com", {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
    } catch (err) {
      return {
        success: false,
        status: "failed",
        error: `Failed to load chatgpt.com: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Give the page a moment to settle
    await page.waitForTimeout(2000);

    // 2. Check for Cloudflare / CAPTCHA / Access Block
    const pageContent = (await page.content()).toLowerCase();
    const isCloudflare =
      pageContent.includes("verify you are human") ||
      pageContent.includes("just a moment...") ||
      pageContent.includes("attention required! | cloudflare") ||
      pageContent.includes("access denied");

    const cfIframe = await page.$('iframe[src*="cloudflare"], iframe[src*="turnstile"]');
    if (isCloudflare || cfIframe) {
      const shot = await page.screenshot({ fullPage: false }).catch(() => undefined);
      return {
        success: false,
        status: "blocked",
        error: "Cloudflare verification or bot detection challenge encountered. Manual fallback required.",
        screenshotBuffer: shot,
      };
    }

    // Dismiss any initial onboarding dialogs ("Stay logged out", "Dismiss", etc.)
    const dismissButtons = [
      'button:has-text("Stay logged out")',
      'button:has-text("Don\'t switch")',
      'button:has-text("Close")',
      'button:has-text("Dismiss")',
      'button[aria-label="Close"]',
    ];
    for (const sel of dismissButtons) {
      try {
        const btn = await page.$(sel);
        if (btn && (await btn.isVisible())) {
          await btn.click();
          await page.waitForTimeout(500);
        }
      } catch {
        // Ignore dismiss failures
      }
    }

    // 3. Locate prompt input in logged-out consumer interface
    const inputSelectors = [
      "#prompt-textarea",
      'textarea[name="prompt"]',
      'div[contenteditable="true"]#prompt-textarea',
      'div[contenteditable="true"]',
      'textarea[data-id="root"]',
      'textarea',
    ];

    let inputElement = null;
    for (const sel of inputSelectors) {
      try {
        const el = await page.$(sel);
        if (el && (await el.isVisible())) {
          inputElement = el;
          break;
        }
      } catch {
        // continue
      }
    }

    if (!inputElement) {
      // Check if logged-out mode is hard gated with a forced login prompt
      const loginWall = await page.$('button:has-text("Log in"), a[href*="login"]');
      const shot = await page.screenshot({ fullPage: false }).catch(() => undefined);
      if (loginWall) {
        return {
          success: false,
          status: "blocked",
          error: "ChatGPT consumer interface requires login for this request. Manual fallback required.",
          screenshotBuffer: shot,
        };
      }
      return {
        success: false,
        status: "failed",
        error: "Could not locate ChatGPT prompt input field in consumer interface.",
        screenshotBuffer: shot,
      };
    }

    // 4. Enter prompt
    // 4. Enter prompt with real keyboard typing so contenteditable listeners fire
    await onStatus?.("running", `Submitting prompt: "${prompt}"`);
    await inputElement.click();
    await page.waitForTimeout(300);

    // If input supports fill, clear it first
    try {
      await inputElement.fill("");
    } catch {
      // ignore
    }

    // Type using page keyboard for React/ProseMirror contenteditable compatibility
    await page.keyboard.type(prompt, { delay: 15 });
    await page.waitForTimeout(600);

    // Submit via Send button or Enter
    const sendButton = await page.$(
      'button[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="Send message"], button[aria-label="Submit"]',
    );
    if (sendButton && (await sendButton.isEnabled())) {
      await sendButton.click();
    } else {
      await page.keyboard.press("Enter");
    }

    // 5. Wait for generation to complete (detect rendered UI state, not fixed timer)
    await onStatus?.("running", "Waiting for response generation to complete");

    // Modern and classic selectors for ChatGPT response containers
    const assistantSelectors = [
      '[class*="assistantMessage"]',
      '[data-message-author-role="assistant"]',
      'li[class*="messageTurn"]:has-text("ChatGPT said")',
      '[class*="agent-turn"]',
      'article:has([data-message-author-role="assistant"])',
      '[data-testid*="conversation-turn"]',
      ".markdown",
      ".prose",
    ];

    let responseFound = false;
    for (let i = 0; i < 40; i++) {
      for (const sel of assistantSelectors) {
        const el = await page.$(sel);
        if (el && (await el.isVisible())) {
          const text = (await el.innerText()).trim();
          // Filter out the prompt if the selector accidentally captured the user's turn
          const isUserTurn = text === prompt || text.startsWith("You said:\n\n" + prompt);
          if (text.length > 0 && !isUserTurn) {
            responseFound = true;
            break;
          }
        }
      }
      if (responseFound) break;

      // Check if an immediate error or rate limit occurred
      const bodyText = (await page.innerText("body")).toLowerCase();
      if (
        bodyText.includes("too many requests") ||
        bodyText.includes("rate limit") ||
        bodyText.includes("an error occurred") ||
        bodyText.includes("something went wrong")
      ) {
        const shot = await page.screenshot({ fullPage: false }).catch(() => undefined);
        return {
          success: false,
          status: "blocked",
          error: "ChatGPT returned a rate limit or generation error.",
          screenshotBuffer: shot,
        };
      }

      await page.waitForTimeout(1000);
    }

    if (!responseFound) {
      const shot = await page.screenshot({ fullPage: false }).catch(() => undefined);
      return {
        success: false,
        status: "failed",
        error: "Timed out waiting for ChatGPT response to begin generating.",
        screenshotBuffer: shot,
      };
    }

    // Now monitor stream completion: wait until stop button is gone and text stabilizes
    const stopSelectors = [
      'button[data-testid="stop-button"]',
      'button[aria-label="Stop streaming"]',
      'button[aria-label="Stop generating"]',
      'button[aria-label="Stop"]',
      ".result-streaming",
    ];

    let previousText = "";
    let stableCount = 0;
    const maxWaitSeconds = 90;

    for (let s = 0; s < maxWaitSeconds; s++) {
      let isStreaming = false;
      for (const sel of stopSelectors) {
        const stopEl = await page.$(sel);
        if (stopEl && (await stopEl.isVisible())) {
          isStreaming = true;
          break;
        }
      }

      // Collect current assistant text
      let currentText = "";
      try {
        currentText = await page.evaluate(() => {
          const selectors = [
            'div[class*="assistantMessage"]',
            'div[class*="messageCopy"]',
            '[data-message-author-role="assistant"]',
            'li[class*="messageTurn"]',
            '.agent-turn',
            '.markdown',
            '.prose',
          ];
          for (const sel of selectors) {
            const els = document.querySelectorAll(sel);
            for (let i = els.length - 1; i >= 0; i--) {
              const txt = (els[i] as HTMLElement).innerText?.trim() || "";
              if (txt.length > 0 && !txt.startsWith("You said:")) {
                // If it starts with "ChatGPT said:\n\n", strip that header if needed or keep it
                return txt.replace(/^ChatGPT said:\s*/i, "").trim();
              }
            }
          }
          return "";
        });
      } catch {
        // ignore
      }

      if (!isStreaming && currentText.length > 0) {
        if (currentText === previousText) {
          stableCount++;
          if (stableCount >= 2) {
            // Text has stabilized for 2 consecutive checks and no streaming button exists
            break;
          }
        } else {
          stableCount = 0;
        }
      } else {
        stableCount = 0;
      }

      previousText = currentText;
      await page.waitForTimeout(1000);
    }

    // 6. Status = capturing: Capture screenshot proof
    await onStatus?.("capturing", "Capturing complete response screenshot");

    // Scroll into view of the latest response to ensure clean capture
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(1000);

    const screenshotBuffer = await page.screenshot({
      fullPage: true,
      type: "png",
    });

    return {
      success: true,
      status: "capturing",
      screenshotBuffer,
      responseText: previousText,
    };
  } catch (error) {
    return {
      success: false,
      status: "failed",
      error: `Unexpected browser error: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}
