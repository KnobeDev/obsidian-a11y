// Obsidian 1.13+ can open a modal in a window of its own — Settings does so by
// default. Core's popout modal creates that window inside its open() and then
// calls Modal.prototype.open (via super.open()), which renders the modal into
// the new window's document. That window isn't a workspace window, so the
// workspace "window-open" event never fires and the plugin would never see the
// document. Wrapping Modal.prototype.open reports the document every modal
// actually rendered into, once core has put it there.

interface OpenedModal {
  modalEl?: { ownerDocument?: Document | null };
}

interface ModalPrototype {
  open: (this: OpenedModal, ...args: unknown[]) => unknown;
}

/**
 * Call `onOpen` with each modal's document after it opens. Returns a function
 * that undoes the wrap; if something else wrapped `open` after us, ours stays
 * in their chain but stops reporting.
 */
export function watchModalDocuments(
  proto: ModalPrototype,
  onOpen: (doc: Document) => void,
): () => void {
  const original = proto.open;
  let active = true;
  const wrapped = function (this: OpenedModal, ...args: unknown[]): unknown {
    const result = original.apply(this, args);
    const doc = this.modalEl?.ownerDocument;
    if (active && doc) {
      // Every modal in Obsidian, core's and other plugins', passes through here:
      // a failure on our side must never make their open() throw.
      try {
        onOpen(doc);
      } catch (err) {
        console.error("[accessibility-enhancer] could not attach to a modal window", err);
      }
    }
    return result;
  };
  proto.open = wrapped;
  return () => {
    active = false;
    if (proto.open === wrapped) proto.open = original;
  };
}
