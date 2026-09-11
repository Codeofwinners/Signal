"use client";
import { useState, type ReactNode } from "react";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import {
  projectSchema,
  promptSchema,
  cycleSchema,
  brandSchema,
  message,
} from "@/lib/validation";
import { supabase } from "@/lib/supabase";
import { type Prompt, type Project, type Brand, type Alias } from "@/lib/types";
import { addBrand } from "@/lib/repository";
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function FormDialog({
  kind,
  projectId,
  project,
  brand,
  aliases = [],
  prompt,
  activeCount,
  onClose,
  onSaved,
}: {
  kind: "project" | "prompt" | "cycle" | "brand";
  projectId?: string;
  project?: Project;
  brand?: Brand;
  aliases?: Alias[];
  prompt?: Prompt;
  activeCount: number;
  onClose: () => void;
  onSaved: (id?: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const str = (key: string) => String(form.get(key) ?? "");
    try {
      let id: string | undefined;
      if (kind === "project") {
        const p = projectSchema.parse({
          name: str("name"),
          domain: str("domain"),
          location: str("location"),
          target: str("target"),
          aliases: str("aliases"),
          logo_url: str("logo_url"),
        });
        const payload = {
          ...p,
          aliases: p.aliases
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        };
        const res = project
          ? await supabase().rpc("update_project", {
              p_project_id: project.id,
              payload,
            })
          : await supabase().rpc("create_project", { payload });
        if (res.error) throw new Error(res.error.message);
        id = res.data;
      } else if (kind === "prompt") {
        const p = promptSchema.parse({
          prompt: str("prompt"),
          topic: str("topic"),
          intent: str("intent"),
          location: str("location"),
          active: form.has("active"),
        });
        const res = prompt
          ? await supabase().from("prompts").update(p).eq("id", prompt.id)
          : await supabase()
              .from("prompts")
              .insert({ ...p, project_id: projectId });
        if (res.error) throw new Error(res.error.message);
      } else if (kind === "cycle") {
        const p = cycleSchema.parse({
          name: str("name"),
          started_at: str("started_at"),
        });
        const res = await supabase().rpc("create_tracking_cycle", {
          p_project_id: projectId,
          p_name: p.name,
          p_started_at: new Date(`${p.started_at}T12:00:00`).toISOString(),
        });
        if (res.error) throw new Error(res.error.message);
        id = res.data;
      } else {
        const values = brandSchema.parse({
          name: str("name"),
          domain: str("domain"),
        });
        if (brand) {
          const { error } = await supabase()
            .from("brands")
            .update(values)
            .eq("id", brand.id);
          if (error) throw new Error(error.message);
        } else await addBrand(projectId!, values);
      }
      await onSaved(id);
      onClose();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={() => !busy && onClose()}
      title={
        kind === "project"
          ? project
            ? "Project settings"
            : "Create a project"
          : kind === "cycle"
            ? "Start a tracking cycle"
            : kind === "brand"
              ? brand
                ? "Edit competitor"
                : "Add a competitor"
              : prompt
                ? "Edit prompt"
                : "Add a prompt"
      }
      description={
        kind === "cycle"
          ? "Create a fresh measurement period. Previous results stay intact."
          : "Keep your tracking workspace organized."
      }
    >
      <form onSubmit={submit} className="form-stack">
        {kind === "project" ? (
          <>
            <Field label="Project name">
              <input
                name="name"
                defaultValue={project?.name}
                required
                maxLength={100}
                placeholder="e.g. Acme · Los Angeles"
              />
            </Field>
            <div className="form-grid">
              <Field label="Target brand">
                <input
                  name="target"
                  defaultValue={brand?.name}
                  required
                  placeholder="Acme"
                />
              </Field>
              <Field label="Website / domain">
                <input
                  name="domain"
                  defaultValue={project?.domain}
                  required
                  placeholder="acme.com"
                />
              </Field>
            </div>
            <Field label="Location">
              <input
                name="location"
                defaultValue={project?.location}
                placeholder="Los Angeles, CA"
              />
            </Field>
            <Field
              label="Brand aliases"
              hint="Separate alternative brand names with commas."
            >
              <input
                name="aliases"
                defaultValue={aliases.map((a) => a.alias).join(", ")}
                placeholder="Acme Co, Acme California"
              />
            </Field>
            <Field label="Logo URL (optional)">
              <input
                name="logo_url"
                defaultValue={project?.logo_url ?? ""}
                type="url"
                placeholder="https://…"
              />
            </Field>
          </>
        ) : kind === "prompt" ? (
          <>
            <Field label="Prompt">
              <textarea
                name="prompt"
                required
                rows={4}
                defaultValue={prompt?.prompt}
                placeholder="What would your customers ask an AI assistant?"
              />
            </Field>
            <div className="form-grid">
              <Field label="Topic">
                <input
                  name="topic"
                  required
                  defaultValue={prompt?.topic}
                  placeholder="e.g. Product discovery"
                />
              </Field>
              <Field label="Intent">
                <select
                  name="intent"
                  defaultValue={prompt?.intent ?? "commercial"}
                >
                  {[
                    "informational",
                    "commercial",
                    "transactional",
                    "local",
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Location">
              <input
                name="location"
                defaultValue={prompt?.location}
                placeholder="Optional geographic focus"
              />
            </Field>
            <label className="check">
              <input
                type="checkbox"
                name="active"
                defaultChecked={prompt?.active ?? true}
              />{" "}
              Active in future cycles
            </label>
            {prompt && (
              <p className="muted small">
                Changes apply to future cycles. Existing cycles retain the
                original prompt and topic.
              </p>
            )}
          </>
        ) : kind === "cycle" ? (
          <>
            <Field label="Cycle name">
              <input
                name="name"
                required
                defaultValue={new Date().toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              />
            </Field>
            <Field label="Measurement date">
              <input
                name="started_at"
                type="date"
                required
                defaultValue={new Date().toLocaleDateString("en-CA")}
              />
            </Field>
            <div className="info-box">
              <strong>{activeCount} active prompts × 4 engines</strong>
              <p>
                {activeCount * 4} pending checks will be created. Perform each
                check manually in a free, logged-out consumer interface.
              </p>
            </div>
          </>
        ) : (
          <>
            <Field label="Brand name">
              <input
                name="name"
                defaultValue={brand?.name}
                required
                placeholder="Competitor name"
              />
            </Field>
            <Field label="Domain (optional)">
              <input
                name="domain"
                defaultValue={brand?.domain}
                placeholder="competitor.com"
              />
            </Field>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-footer">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button disabled={busy || (kind === "cycle" && !activeCount)}>
            {busy ? "Saving…" : kind === "cycle" ? "Create cycle" : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
