import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { type ProjectData, type Run, EMPTY_DATA } from "../lib/types";
import { nextPending } from "../lib/metrics";

test("manual editor saves citation, screenshot, and opens next pending engine; failed saves clean uploads", async () => {
  const dom = new JSDOM('<html><body><div id="root"></div></body></html>', {
    url: "http://localhost",
    pretendToBeVisual: true,
  });
  for (const key of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "HTMLInputElement",
    "HTMLSelectElement",
    "HTMLTextAreaElement",
    "Element",
    "Node",
    "NodeFilter",
    "localStorage",
    "DocumentFragment",
    "MutationObserver",
    "CustomEvent",
    "Event",
    "KeyboardEvent",
    "getComputedStyle",
  ])
    Object.defineProperty(globalThis, key, {
      value: Reflect.get(dom.window, key),
      configurable: true,
      writable: true,
    });
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
    BroadcastChannel: undefined,
    requestAnimationFrame: (callback: FrameRequestCallback) =>
      setTimeout(() => callback(0), 0),
    cancelAnimationFrame: clearTimeout,
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-key";
  const calls: { url: string; method: string; body: unknown }[] = [];
  let failRpc = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET", body: init?.body });
    if (url.includes("/rpc/save_result"))
      return new Response(
        JSON.stringify(
          failRpc ? { message: "Database rejected result" } : null,
        ),
        {
          status: failRpc ? 400 : 200,
          headers: { "content-type": "application/json" },
        },
      );
    return new Response(JSON.stringify({ Key: "uploaded", data: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const React = await import("react");
  const { act } = React;
  const { createRoot } = await import("react-dom/client");
  const { ResultEntry } = await import("../components/result-entry");
  const { saveResult } = await import("../lib/repository");
  const { supabase } = await import("../lib/supabase");
  const base: Run = {
    id: "33333333-3333-4333-8333-333333333333",
    project_id: "11111111-1111-4111-8111-111111111111",
    prompt_id: "22222222-2222-4222-8222-222222222222",
    tracking_cycle_id: "44444444-4444-4444-8444-444444444444",
    engine: "chatgpt",
    status: "pending",
    prompt_snapshot: "Best local brands?",
    topic_snapshot: "Discovery",
    response_text: "",
    target_mentioned: false,
    target_position: null,
    target_cited: false,
    map_present: false,
    images_present: false,
    products_present: false,
    notes: "",
    checked_at: null,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
  };
  const second = {
    ...base,
    id: "55555555-5555-4555-8555-555555555555",
    engine: "gemini" as const,
  };
  const data: ProjectData = {
    ...EMPTY_DATA,
    brands: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        project_id: base.project_id,
        type: "target",
        name: "Test brand",
        domain: "example.com",
        created_at: base.created_at,
      },
    ],
    runs: [base, second],
  };
  const saved: boolean[] = [];
  function Harness() {
    const [run, setRun] = React.useState<Run | undefined>(base);
    return run
      ? React.createElement(ResultEntry, {
          key: run.id,
          run,
          data,
          onClose: () => setRun(undefined),
          onSaved: async (next: boolean) => {
            saved.push(next);
            setRun(next ? nextPending(data.runs, run.id) : undefined);
          },
        })
      : React.createElement("p", null, "Saved");
  }
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => {
      root.render(React.createElement(Harness));
    });
    const button = (label: string) =>
      Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === label,
      )!;
    const field = (label: string) =>
      Array.from(document.querySelectorAll("label")).find(
        (l) => l.querySelector("span")?.textContent === label,
      )!;
    await act(async () => {
      const select = field("Brand mentioned").querySelector("select")!;
      select.value = "true";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      button("Add citation").click();
    });
    await act(async () => {
      const input = field("URL").querySelector("input")!;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "https://www.example.com/article");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert.ok(document.body.textContent?.includes("example.com"));
    const file = new File(["image test bytes"], "evidence.png", {
      type: "image/png",
    });
    await act(async () => {
      const input =
        document.querySelector<HTMLInputElement>("input[type=file]")!;
      Object.defineProperty(input, "files", {
        value: [file],
        configurable: true,
      });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    assert.ok(document.body.textContent?.includes("evidence.png"));
    await act(async () => {
      button("Save & Next Pending").click();
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    assert.deepEqual(saved, [true]);
    assert.ok(
      document.body.textContent?.includes("Gemini · Free consumer interface"),
    );
    const save = calls.find((c) => c.url.includes("/rpc/save_result"))!;
    const payload = JSON.parse(String(save.body));
    assert.equal(payload.p_result.target_mentioned, true);
    assert.equal(payload.p_result.citations[0].domain, "example.com");
    assert.equal(payload.p_screenshots.length, 1);
    assert.ok(
      calls.some((c) => c.url.includes("/storage/v1/object/screenshots/")),
    );
    // Keyboard shortcut is equivalent to clicking Save & Next Pending.
    await act(async () => {
      document
        .querySelector("form")!
        .dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            ctrlKey: true,
            bubbles: true,
          }),
        );
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    assert.deepEqual(saved, [true, true]);
    // Failure after upload triggers removal of the uncommitted file, and reports an error.
    failRpc = true;
    await assert.rejects(
      () => saveResult(base, payload.p_result, [file]),
      /Database rejected result/,
    );
    assert.ok(
      calls.some(
        (c) =>
          c.method === "DELETE" &&
          c.url.includes("/storage/v1/object/screenshots"),
      ),
    );
  } finally {
    await act(async () => root.unmount());
    supabase().auth.stopAutoRefresh();
    globalThis.fetch = originalFetch;
    dom.window.close();
  }
});
