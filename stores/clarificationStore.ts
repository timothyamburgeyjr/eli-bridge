import { create } from "zustand";

/**
 * Clarification queue — surfaces low-confidence ambiguities (companion
 * presence, place disambiguation, name resolution, voice-ID confirmations)
 * as Y/N popups so Tim can correct silently-wrong state without breaking
 * conversational flow.
 *
 * Discipline (per the design conversation):
 *   - Confidence-band driven. High-confidence inference mutates silently;
 *     only the genuinely uncertain stuff lands here.
 *   - Bundled per turn. One ClarificationSheet, multiple rows. Never two
 *     sequential popups.
 *   - Non-blocking. The send-pipeline does NOT wait for Tim to answer.
 *     The sheet appears AFTER Eli's reply lands and the corrections apply
 *     to the NEXT turn's anchor.
 *   - Skip = no-op. Each item carries its own onAnswer closure; "skip"
 *     just removes the item without firing the closure.
 */

export interface ClarificationItem {
  /** Unique id — caller may supply (for dedup) or omit (auto-generated). */
  id: string;
  /** Human-readable question shown in the sheet ("Is Hank here?"). */
  question: string;
  /** Optional one-line hint shown under the question — usually the
   *  reason the model surfaced this as ambiguous. */
  hint?: string;
  /**
   * The Y/N (or multi-option) choices. Each choice's onSelect closure is
   * invoked when Tim taps it. The closure handles the state mutation
   * (e.g. add to CompanionTracker, swap placeName, etc.).
   */
  options: { label: string; onSelect: () => void | Promise<void> }[];
  /**
   * Source kind — useful for grouping in the sheet and for telemetry
   * later when we tune confidence thresholds.
   */
  kind:
    | "companion-presence"
    | "voice-id-confirm"
    | "place-disambiguation"
    | "name-resolution";
}

interface ClarificationState {
  /** Pending items in display order. Newest at the end. */
  items: ClarificationItem[];
  /** True when the sheet is open. Set by the sheet UI; consumers can
   *  watch this to suppress the open trigger while it's already up. */
  sheetOpen: boolean;

  /** Push an ambiguity onto the queue. If an item with the same id is
   *  already present, replace it (avoid duplicate rows for the same
   *  question across rapid-fire turns). */
  enqueue: (item: Omit<ClarificationItem, "id"> & { id?: string }) => void;

  /** Mark an item resolved (fire the chosen option's closure and drop
   *  the item from the queue). Pass option index. */
  resolve: (id: string, optionIndex: number) => void;

  /** Drop an item without firing anything (the user tapped Skip on
   *  this row, or Skip All swept the whole queue). */
  skip: (id: string) => void;

  /** Skip every pending item. */
  skipAll: () => void;

  /** Set the sheet's open/closed state. Called by the sheet component. */
  setSheetOpen: (open: boolean) => void;
}

let _nextId = 1;
function autoId(): string {
  return `c-${Date.now()}-${_nextId++}`;
}

export const useClarifications = create<ClarificationState>((set, get) => ({
  items: [],
  sheetOpen: false,

  enqueue: (raw) => {
    const id = raw.id ?? autoId();
    set((s) => {
      const filtered = s.items.filter((i) => i.id !== id);
      return {
        items: [...filtered, { ...raw, id }],
      };
    });
  },

  resolve: async (id, optionIndex) => {
    const item = get().items.find((i) => i.id === id);
    if (!item) return;
    // Remove first so the closure can enqueue follow-ups (e.g. a place
    // pick that uncovers a name ambiguity) without immediately seeing
    // its own residue.
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
    const opt = item.options[optionIndex];
    if (opt) {
      try {
        await opt.onSelect();
      } catch (err) {
        console.warn("[ClarificationQueue] option closure threw:", err);
      }
    }
  },

  skip: (id) => {
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
  },

  skipAll: () => {
    set({ items: [] });
  },

  setSheetOpen: (open) => {
    set({ sheetOpen: open });
  },
}));
