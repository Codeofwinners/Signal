"use client";
import { useState, useRef } from "react";
import { ArrowRight, Plus, Trash2, Upload, Copy, Check } from "lucide-react";
import { Modal } from "./ui/dialog";
import { Button } from "./ui/button";
import { Field } from "./forms";
import {
  type Run,
  type ProjectData,
  type Brand,
  ENGINE_NAMES,
} from "@/lib/types";
import {
  type ResultInput,
  message,
  normalizeDomain,
  brandSchema,
  validateScreenshot,
} from "@/lib/validation";
import { addBrand, saveResult } from "@/lib/repository";
export function ResultEntry({
  run,
  data,
  onClose,
  onSaved,
}: {
  run: Run;
  data: ProjectData;
  onClose: () => void;
  onSaved: (next: boolean) => Promise<void>;
}) {
  const target = data.brands.find((b) => b.type === "target")!;
  const [brands, setBrands] = useState(data.brands);
  const [value, setValue] = useState<ResultInput>({
    status: [
      "pending",
      "queued",
      "running",
      "capturing",
      "analyzing",
    ].includes(run.status)
      ? "complete"
      : (run.status as ResultInput["status"]),
    target_mentioned: run.target_mentioned,
    target_position: run.target_position,
    target_cited: run.target_cited,
    map_present: run.map_present,
    images_present: run.images_present,
    products_present: run.products_present,
    response_text: run.response_text,
    notes: run.notes,
    mentions: data.mentions
      .filter((m) => m.prompt_run_id === run.id)
      .map(({ brand_id, position, mention_count, recommended, context }) => ({
        brand_id,
        position,
        mention_count,
        recommended,
        context,
      })),
    citations: data.citations
      .filter((c) => c.prompt_run_id === run.id)
      .map(({ url, domain, title, position, brand_id }) => ({
        url,
        domain,
        title,
        position,
        brand_id,
      })),
  });
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [copied, setCopied] = useState(false);
  const submitRef = useRef<HTMLButtonElement>(null);
  function set<K extends keyof ResultInput>(key: K, v: ResultInput[K]) {
    setValue((prev) => ({ ...prev, [key]: v }));
  }
  function addMention(brand: Brand) {
    if (value.mentions.some((m) => m.brand_id === brand.id)) return;
    set("mentions", [
      ...value.mentions,
      {
        brand_id: brand.id,
        position: null,
        mention_count: 1,
        recommended: false,
        context: "",
      },
    ]);
    if (brand.type === "target") set("target_mentioned", true);
    setBrandName("");
  }
  async function createBrand() {
    setBusy(true);
    try {
      const brand = await addBrand(
        run.project_id,
        brandSchema.parse({ name: brandName, domain: "" }),
      );
      setBrands([...brands, brand]);
      addMention(brand);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit(next: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await saveResult(run, value, files);
    } catch (e) {
      setError(message(e));
      setBusy(false);
      return;
    }
    try {
      await onSaved(next);
    } catch (e) {
      setError(
        `Saved successfully, but refresh failed: ${message(e)}. Close and reload before editing again.`,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={() => !busy && onClose()}
      wide
      title="Record a manual check"
      description={`${ENGINE_NAMES[run.engine]} · Free consumer interface · Logged out`}
    >
      <form
        className="result-form"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            submitRef.current?.click();
          }
        }}
        onSubmit={(e) => {
          e.preventDefault();
          void submit(false);
        }}
      >
        <div className="prompt-callout">
          <div>
            <span className={`engine-dot ${run.engine}`} />
            <strong>{ENGINE_NAMES[run.engine]}</strong>
            <span className="badge">{run.topic_snapshot}</span>
          </div>
          <p>{run.prompt_snapshot}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(run.prompt_snapshot);
                setCopied(true);
              } catch {
                setError(
                  "Copy unavailable. Select the prompt text and copy it manually.",
                );
              }
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}{" "}
            {copied ? "Copied" : "Copy prompt"}
          </Button>
        </div>
        <div className="section-label">TARGET BRAND · {target.name}</div>
        <div className="form-grid three">
          <Field label="Brand mentioned">
            <select
              value={String(value.target_mentioned)}
              onChange={(e) => {
                const mentioned = e.target.value === "true";
                setValue((v) => ({
                  ...v,
                  target_mentioned: mentioned,
                  target_position: mentioned ? v.target_position : null,
                  mentions: mentioned
                    ? v.mentions
                    : v.mentions.filter((m) => m.brand_id !== target.id),
                }));
              }}
            >
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </Field>
          <Field label="Target position">
            <input
              type="number"
              min={1}
              max={10000}
              disabled={!value.target_mentioned}
              value={value.target_position ?? ""}
              placeholder="Unranked"
              onChange={(e) =>
                set(
                  "target_position",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
            />
          </Field>
          <Field label="Brand cited">
            <select
              value={String(value.target_cited)}
              onChange={(e) => set("target_cited", e.target.value === "true")}
            >
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </Field>
        </div>
        <div className="features">
          {(["map_present", "images_present", "products_present"] as const).map(
            (key, i) => (
              <label className="check" key={key}>
                <input
                  type="checkbox"
                  checked={value[key]}
                  onChange={(e) => set(key, e.target.checked)}
                />
                {["Map present", "Images present", "Products present"][i]}
              </label>
            ),
          )}
        </div>
        <Field label="Full response">
          <textarea
            rows={5}
            value={value.response_text}
            onChange={(e) => set("response_text", e.target.value)}
            placeholder="Paste the response from your manual check…"
          />
        </Field>
        <div className="section-row">
          <h3>Brands in the answer</h3>
          <span className="muted small">
            One row per brand; count repeated mentions
          </span>
        </div>
        <p className="muted small">
          A target marked “Yes” is counted automatically. Add it below to record
          repeats or a recommendation.
        </p>
        {value.mentions.map((m, index) => (
          <div className="mention-row" key={m.brand_id}>
            <strong>{brands.find((b) => b.id === m.brand_id)?.name}</strong>
            <Field label="Position">
              <input
                type="number"
                min={1}
                max={10000}
                value={
                  m.brand_id === target.id
                    ? (value.target_position ?? "")
                    : (m.position ?? "")
                }
                placeholder="—"
                onChange={(e) => {
                  const position = e.target.value
                    ? Number(e.target.value)
                    : null;
                  if (m.brand_id === target.id)
                    set("target_position", position);
                  set(
                    "mentions",
                    value.mentions.map((v, i) =>
                      i === index ? { ...v, position } : v,
                    ),
                  );
                }}
              />
            </Field>
            <Field label="Count">
              <input
                type="number"
                min={1}
                max={10000}
                value={m.mention_count}
                onChange={(e) =>
                  set(
                    "mentions",
                    value.mentions.map((v, i) =>
                      i === index
                        ? { ...v, mention_count: Number(e.target.value) }
                        : v,
                    ),
                  )
                }
              />
            </Field>
            <label className="check">
              <input
                type="checkbox"
                checked={m.recommended}
                onChange={(e) =>
                  set(
                    "mentions",
                    value.mentions.map((v, i) =>
                      i === index ? { ...v, recommended: e.target.checked } : v,
                    ),
                  )
                }
              />{" "}
              Recommended
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove ${brands.find((b) => b.id === m.brand_id)?.name}`}
              onClick={() =>
                set(
                  "mentions",
                  value.mentions.filter((_, i) => i !== index),
                )
              }
            >
              <Trash2 size={15} />
            </Button>
          </div>
        ))}
        <div className="inline-add">
          <input
            aria-label="Find or create a brand"
            list="brand-options"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="Search brands or type a new competitor…"
          />
          <datalist id="brand-options">
            {brands
              .filter((b) => !value.mentions.some((m) => m.brand_id === b.id))
              .map((b) => (
                <option key={b.id} value={b.name} />
              ))}
          </datalist>
          <Button
            type="button"
            variant="outline"
            disabled={!brandName.trim() || busy}
            onClick={() => {
              const b = brands.find(
                (b) => b.name.toLowerCase() === brandName.trim().toLowerCase(),
              );
              if (b) addMention(b);
              else void createBrand();
            }}
          >
            <Plus size={15} />
            {brands.some(
              (b) => b.name.toLowerCase() === brandName.trim().toLowerCase(),
            )
              ? "Add brand"
              : "Create & add"}
          </Button>
        </div>
        <div className="section-row">
          <h3>Citations</h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              set("citations", [
                ...value.citations,
                {
                  url: "",
                  domain: "",
                  title: "",
                  position: null,
                  brand_id: null,
                },
              ])
            }
          >
            <Plus size={14} />
            Add citation
          </Button>
        </div>
        {value.citations.map((c, index) => (
          <div className="citation-editor" key={index}>
            <div className="inline-add">
              <Field label="URL">
                <input
                  type="url"
                  required
                  value={c.url}
                  placeholder="https://example.com/article"
                  onChange={(e) => {
                    let domain = "";
                    try {
                      domain = normalizeDomain(e.target.value);
                    } catch {}
                    set(
                      "citations",
                      value.citations.map((v, i) =>
                        i === index ? { ...v, url: e.target.value, domain } : v,
                      ),
                    );
                  }}
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove citation"
                onClick={() =>
                  set(
                    "citations",
                    value.citations.filter((_, i) => i !== index),
                  )
                }
              >
                <Trash2 size={15} />
              </Button>
            </div>
            <small className="muted">
              {c.domain || "Domain is extracted automatically"}
            </small>
            <div className="form-grid three">
              <Field label="Title">
                <input
                  value={c.title}
                  onChange={(e) =>
                    set(
                      "citations",
                      value.citations.map((v, i) =>
                        i === index ? { ...v, title: e.target.value } : v,
                      ),
                    )
                  }
                />
              </Field>
              <Field label="Position">
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={c.position ?? ""}
                  onChange={(e) =>
                    set(
                      "citations",
                      value.citations.map((v, i) =>
                        i === index
                          ? {
                              ...v,
                              position: e.target.value
                                ? Number(e.target.value)
                                : null,
                            }
                          : v,
                      ),
                    )
                  }
                />
              </Field>
              <Field label="Associated brand">
                <select
                  value={c.brand_id ?? ""}
                  onChange={(e) =>
                    set(
                      "citations",
                      value.citations.map((v, i) =>
                        i === index
                          ? { ...v, brand_id: e.target.value || null }
                          : v,
                      ),
                    )
                  }
                >
                  <option value="">Unassigned</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        ))}
        <div className="form-grid">
          <Field label="Screenshots" hint="PNG, JPEG, WebP · Up to 10 MB each">
            <div className="upload-box">
              <Upload size={20} />
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  try {
                    const selected = Array.from(e.target.files ?? []);
                    selected.forEach(validateScreenshot);
                    setFiles([...files, ...selected]);
                    setError("");
                  } catch (err) {
                    setError(message(err));
                  }
                  e.target.value = "";
                }}
              />
            </div>
            {files.map((file, i) => (
              <span className="file-item" key={i}>
                {file.name}
                <button
                  type="button"
                  onClick={() => setFiles(files.filter((_, j) => i !== j))}
                  aria-label={`Remove ${file.name}`}
                >
                  ×
                </button>
              </span>
            ))}
            <small>
              {
                data.screenshots.filter((s) => s.prompt_run_id === run.id)
                  .length
              }{" "}
              saved screenshots retained
            </small>
          </Field>
          <Field label="Notes">
            <textarea
              rows={4}
              value={value.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Anything useful for this measurement…"
            />
          </Field>
        </div>
        <Field label="Check status">
          <select
            value={value.status}
            onChange={(e) =>
              set("status", e.target.value as ResultInput["status"])
            }
          >
            <option value="complete">Complete — include in metrics</option>
            <option value="skipped">Skipped — exclude from metrics</option>
            <option value="error">Error — exclude from metrics</option>
          </select>
        </Field>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="result-footer">
          <span className="muted small">
            ⌘ / Ctrl + Enter to save & continue
          </span>
          <div>
            <Button variant="outline" disabled={busy} type="submit">
              Save
            </Button>
            <Button
              ref={submitRef}
              type="button"
              disabled={busy}
              onClick={() => void submit(true)}
            >
              {busy ? "Saving…" : "Save & Next Pending"}
              <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
