/**
 * components/ContactModal.tsx
 *
 * Footer "Contact us" button + the popup it opens. No form, no
 * server-side sending to wire up — it just surfaces the inbox configured
 * in CONTACT_EMAIL (read server-side by Footer.tsx and passed in here as
 * a prop) and points the visitor at their own mail client via a mailto:
 * link.
 *
 * Client Component: only the popup's open/closed state needs the browser.
 */

"use client";

import { useState } from "react";
import { IconMail, IconClose } from "@/components/icons";

interface Props {
  contactEmail: string;
}

export default function ContactModal({ contactEmail }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
      >
        <IconMail className="h-3.5 w-3.5" />
        Contact us
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-950 p-6 text-center shadow-2xl">
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 text-neutral-500 transition-colors hover:text-white"
            >
              <IconClose className="h-5 w-5" />
            </button>

            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10 text-blue-400">
              <IconMail className="h-6 w-6" />
            </span>

            <h2 className="mt-4 text-lg font-bold text-white">Contact us</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">
              Have a question, feedback, or spotted a rate that looks off?
              Reach out to us directly at the email below.
            </p>

            <a
              href={`mailto:${contactEmail}`}
              className="mt-5 inline-block w-full rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
            >
              {contactEmail}
            </a>
          </div>
        </div>
      )}
    </>
  );
}
