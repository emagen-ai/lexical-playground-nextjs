/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {JSX} from 'react';

import {$convertFromMarkdownString} from '@lexical/markdown';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW, PASTE_COMMAND} from 'lexical';
import {useEffect} from 'react';

import {PLAYGROUND_TRANSFORMERS} from '../MarkdownTransformers';

export default function MarkdownPastePlugin(): JSX.Element {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const unregister = editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) {
          return false;
        }

        // Only handle plain text, let other content types (HTML, images, etc.) be handled by default
        const htmlData = clipboardData.getData('text/html');
        if (htmlData) {
          return false; // Let default handler deal with rich content
        }

        // Get plain text from clipboard
        const text = clipboardData.getData('text/plain');
        if (!text || text.trim().length === 0) {
          return false;
        }

        // Check if the text looks like markdown and is substantial content
        const isMarkdown = isLikelyMarkdown(text);
        
        if (isMarkdown) {
          event.preventDefault();
          
          editor.update(() => {
            try {
              const selection = $getSelection();
              if ($isRangeSelection(selection)) {
                // Parse markdown and create a new editor state
                const nodes = $convertFromMarkdownString(text, PLAYGROUND_TRANSFORMERS);
                
                // Insert the converted nodes at current selection
                if (nodes && nodes.length > 0) {
                  selection.insertNodes(nodes);
                }
              }
            } catch (error) {
              console.warn('Failed to parse markdown:', error);
              // Fallback: insert as plain text
              const selection = $getSelection();
              if ($isRangeSelection(selection)) {
                selection.insertText(text);
              }
            }
          });
          
          return true; // Prevent default paste behavior
        }

        return false; // Allow default paste behavior for non-markdown content
      },
      COMMAND_PRIORITY_LOW, // Use low priority to let other handlers go first
    );

    return unregister;
  }, [editor]);

  return <></>;
}

// Heuristic to detect if text is likely markdown
function isLikelyMarkdown(text: string): boolean {
  // Check for common markdown patterns
  const markdownPatterns = [
    /^#{1,6}\s+/m,          // Headers
    /^\*\s+/m,              // Unordered list
    /^\d+\.\s+/m,           // Ordered list
    /^\-\s+/m,              // Unordered list with dash
    /^\+\s+/m,              // Unordered list with plus
    /\*\*.*\*\*/,           // Bold
    /\_\_.*\_\_/,           // Bold
    /\*.*\*/,               // Italic
    /\_.*\_/,               // Italic
    /\`.*\`/,               // Inline code
    /^\`\`\`/m,             // Code block
    /^\>/m,                 // Blockquote
    /\|.*\|/,               // Table
    /^\-{3,}/m,             // Horizontal rule
    /^\*{3,}/m,             // Horizontal rule
    /^\_{3,}/m,             // Horizontal rule
    /\[.*\]\(.*\)/,         // Links
    /!\[.*\]\(.*\)/,        // Images
    /^\- \[[ x]\]/m,        // Task lists
    /^---$/m,               // YAML front matter
  ];

  // Count matches
  let matches = 0;
  for (const pattern of markdownPatterns) {
    if (pattern.test(text)) {
      matches++;
    }
  }

  // Only consider it markdown if we have multiple patterns AND the text is substantial
  // This helps avoid false positives for simple text
  return matches >= 3 || /^---\s*\n/.test(text) || (matches >= 2 && text.split('\n').length > 3);
}