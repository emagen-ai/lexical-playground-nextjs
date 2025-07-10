/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {LexicalNode, NodeKey} from 'lexical';
import {DecoratorNode} from 'lexical';

// Placeholder implementation - Excalidraw functionality disabled
export class ExcalidrawNode extends DecoratorNode<null> {
  static getType(): string {
    return 'excalidraw';
  }

  static clone(node: ExcalidrawNode): ExcalidrawNode {
    return new ExcalidrawNode(node.__key);
  }

  constructor(key?: NodeKey) {
    super(key);
  }

  createDOM(): HTMLElement {
    const div = document.createElement('div');
    div.style.padding = '20px';
    div.style.border = '1px dashed #ccc';
    div.style.textAlign = 'center';
    div.textContent = 'Excalidraw is disabled';
    return div;
  }

  updateDOM(): false {
    return false;
  }

  decorate(): null {
    return null;
  }
}

export function $createExcalidrawNode(): ExcalidrawNode {
  return new ExcalidrawNode();
}

export function $isExcalidrawNode(
  node: LexicalNode | null | undefined,
): node is ExcalidrawNode {
  return node instanceof ExcalidrawNode;
}