import {
  isNodeSelection,
  isTextSelection,
  posToDOMRect,
} from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

import type { Editor } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

import { flip, offset, shift } from '@floating-ui/core';
import { computePosition } from '@floating-ui/dom';

import type { ComputePositionConfig } from '@floating-ui/dom';

export interface BubbleMenuPluginProps {
  pluginKey: PluginKey | string
  editor: Editor
  element: HTMLElement
  updateDelay?: number
  shouldShow?:
    | ((props: {
      editor: Editor
      view: EditorView
      state: EditorState
      oldState?: EditorState
      from: number
      to: number
    }) => boolean)
    | null
}

export type BubbleMenuViewProps = BubbleMenuPluginProps & {
  view: EditorView
};

export class BubbleMenuView {
  public editor: Editor;

  public element: HTMLElement;

  public view: EditorView;

  public preventHide = false;

  public floatingReferenceEl: { getBoundingClientRect: () => DOMRect };
  public floatingOptions?: Partial<ComputePositionConfig>;

  public updateDelay: number;

  private updateDebounceTimer: number | undefined;

  public shouldShow: Exclude<BubbleMenuPluginProps['shouldShow'], null> = ({
    view,
    state,
    from,
    to,
  }) => {
    const { doc, selection } = state;
    const { empty } = selection;

    // Sometime check for `empty` is not enough.
    // Doubleclick an empty paragraph returns a node size of 2.
    // So we check also for an empty text size.
    const isEmptyTextBlock = doc.textBetween(from, to).length === 0 && isTextSelection(state.selection);

    // When clicking on a element inside the bubble menu the editor "blur" event
    // is called and the bubble menu item is focussed. In this case we should
    // consider the menu as part of the editor and keep showing the menu
    const isChildOfMenu = this.element.contains(document.activeElement);

    const hasEditorFocus = view.hasFocus() || isChildOfMenu;

    if (!hasEditorFocus || empty || isEmptyTextBlock || !this.editor.isEditable)
      return false;

    return true;
  };

  constructor({
    editor,
    element,
    view,
    updateDelay = 150,
    shouldShow,
  }: BubbleMenuViewProps) {
    this.editor = editor;
    this.element = element;
    this.view = view;
    this.updateDelay = updateDelay;

    if (shouldShow)
      this.shouldShow = shouldShow;

    this.element.addEventListener('mousedown', this.mousedownHandler, { capture: true });
    this.view.dom.addEventListener('dragstart', this.dragstartHandler);
    this.editor.on('focus', this.focusHandler);
    this.editor.on('blur', this.blurHandler);

    this.hide();

    this.floatingReferenceEl = {
      getBoundingClientRect: this.getSelectionDOMRect.bind(this),
    };
    this.floatingOptions = {
      placement: 'top',
      middleware: [
        offset(8),
        shift({ padding: 8 }),
        flip(),
      ],
    };
  }

  mousedownHandler = () => {
    this.preventHide = true;
  };

  dragstartHandler = () => {
    this.hide();
  };

  focusHandler = () => {
    // we use `setTimeout` to make sure `selection` is already updated
    setTimeout(() => this.update(this.editor.view));
  };

  blurHandler = ({ event }: { event: FocusEvent }) => {
    if (this.preventHide) {
      this.preventHide = false;

      return;
    }

    if (event?.relatedTarget && this.element.parentNode?.contains(event.relatedTarget as Node))
      return;

    this.hide();
  };

  update(view: EditorView, oldState?: EditorState) {
    const { state } = view;
    const hasValidSelection = state.selection.$from.pos !== state.selection.$to.pos;

    if (this.updateDelay > 0 && hasValidSelection) {
      this.handleDebouncedUpdate(view, oldState);
      return;
    }

    const selectionChanged = !oldState?.selection.eq(view.state.selection);
    const docChanged = !oldState?.doc.eq(view.state.doc);

    this.updateHandler(view, selectionChanged, docChanged, oldState);
  }

  handleDebouncedUpdate = (view: EditorView, oldState?: EditorState) => {
    const selectionChanged = !oldState?.selection.eq(view.state.selection);
    const docChanged = !oldState?.doc.eq(view.state.doc);

    if (!selectionChanged && !docChanged)
      return;

    if (this.updateDebounceTimer)
      clearTimeout(this.updateDebounceTimer);

    this.updateDebounceTimer = window.setTimeout(() => {
      this.updateHandler(view, selectionChanged, docChanged, oldState);
    }, this.updateDelay);
  };

  updateHandler = (view: EditorView, selectionChanged: boolean, docChanged: boolean, oldState?: EditorState) => {
    const { state, composing } = view;
    const { selection } = state;

    const isSame = !selectionChanged && !docChanged;

    if (composing || isSame)
      return;

    // support for CellSelections
    const { ranges } = selection;
    const from = Math.min(...ranges.map((range) => range.$from.pos));
    const to = Math.max(...ranges.map((range) => range.$to.pos));

    const shouldShow = this.shouldShow?.({
      editor: this.editor,
      view,
      state,
      oldState,
      from,
      to,
    });

    if (!shouldShow) {
      this.hide();

      return;
    }

    const shouldAnimate = this.element.style.visibility === 'visible';
    this.element.style.transitionDuration = shouldAnimate ? '0.2s' : '0s';

    computePosition(
      this.floatingReferenceEl,
      this.element,
      this.floatingOptions,
    ).then(({ x, y }) => {
      this.element.style.top = `${y}px`;
      this.element.style.left = `${x}px`;
    });

    this.show();
  };

  show() {
    const shouldAnimate = this.element.style.visibility === 'hidden';
    this.element.style.visibility = 'visible';

    shouldAnimate && this.element.animate([
      { opacity: 0 },
      { opacity: 1 },
    ], { duration: 100 });
  }

  hide() {
    this.element.style.visibility = 'hidden';
  }

  getSelectionDOMRect() {
    const { ranges } = this.editor.state.selection;
    const from = Math.min(...ranges.map((range) => range.$from.pos));
    const to = Math.max(...ranges.map((range) => range.$to.pos));

    if (isNodeSelection(this.editor.state.selection)) {
      let node = this.editor.view.nodeDOM(from) as HTMLElement;

      const nodeViewWrapper = node.dataset.nodeViewWrapper ? node : node.querySelector('[data-node-view-wrapper]');

      if (nodeViewWrapper)
        node = nodeViewWrapper.firstChild as HTMLElement;

      if (node)
        return node.getBoundingClientRect();
    }

    return posToDOMRect(this.editor.view, from, to);
  }

  destroy() {
    this.element.removeEventListener('mousedown', this.mousedownHandler, { capture: true });
    this.view.dom.removeEventListener('dragstart', this.dragstartHandler);
    this.editor.off('focus', this.focusHandler);
    this.editor.off('blur', this.blurHandler);
  }
}

export function BubbleMenuPlugin(options: BubbleMenuPluginProps) {
  return new Plugin({
    key:
      typeof options.pluginKey === 'string' ? new PluginKey(options.pluginKey) : options.pluginKey,
    view: (view) => new BubbleMenuView({ view, ...options }),
  });
}
