"use client";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { type ReactNode } from "react";
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="dialog-overlay" />
        <D.Content
          className={`dialog-content ${wide ? "dialog-wide" : ""}`}
          aria-describedby={description ? "dialog-description" : undefined}
        >
          <div className="dialog-heading">
            <div>
              <D.Title>{title}</D.Title>
              {description && (
                <D.Description id="dialog-description">
                  {description}
                </D.Description>
              )}
            </div>
            <D.Close className="icon-button" aria-label="Close dialog">
              <X size={18} />
            </D.Close>
          </div>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
