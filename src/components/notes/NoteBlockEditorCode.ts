import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";

/**
 * Languages available in the lowlight "common" bundle, sorted alphabetically.
 */
const LANGUAGES = [
  "arduino", "bash", "c", "cpp", "csharp", "css", "diff", "go", "graphql",
  "ini", "java", "javascript", "json", "kotlin", "less", "lua", "makefile",
  "markdown", "objectivec", "perl", "php", "plaintext", "python", "r", "ruby",
  "rust", "scss", "shell", "sql", "swift", "typescript", "vbnet", "wasm",
  "xml", "yaml",
];

/**
 * Extended CodeBlockLowlight with a custom NodeView that adds:
 * - A searchable language selector (top-left)
 * - A copy button (top-right)
 * - Spellcheck disabled
 */
export const CodeBlockWithToolbar = CodeBlockLowlight.extend({
  addNodeView() {
    return ({ node, editor, getPos }) => {
      // --- Wrapper
      const wrapper = document.createElement("div");
      wrapper.classList.add("code-block-wrapper");

      // --- Toolbar row
      const toolbar = document.createElement("div");
      toolbar.classList.add("code-block-toolbar");
      toolbar.contentEditable = "false";

      // --- Language trigger button
      let currentLang = (node.attrs.language as string) || "";
      const langTrigger = document.createElement("button");
      langTrigger.type = "button";
      langTrigger.classList.add("code-block-lang-trigger");
      langTrigger.textContent = currentLang || "plain";

      // Chevron icon
      const chevron = document.createElement("span");
      chevron.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
      langTrigger.appendChild(chevron);

      // --- Language dropdown
      let dropdown: HTMLDivElement | null = null;
      let isDropdownOpen = false;

      function closeDropdown() {
        document.removeEventListener("mousedown", handleOutsideClick, true);
        if (dropdown && dropdown.parentNode) {
          dropdown.parentNode.removeChild(dropdown);
        }
        dropdown = null;
        isDropdownOpen = false;
      }

      function openDropdown() {
        if (isDropdownOpen) {
          closeDropdown();
          return;
        }
        isDropdownOpen = true;

        dropdown = document.createElement("div");
        dropdown.classList.add("code-block-lang-dropdown");

        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.classList.add("code-block-lang-search");
        searchInput.placeholder = "Search language…";
        searchInput.spellcheck = false;

        const list = document.createElement("div");
        list.classList.add("code-block-lang-list");

        function renderOptions(filter: string) {
          list.innerHTML = "";
          const normalizedFilter = filter.toLowerCase();
          const filtered = LANGUAGES.filter((l) => l.includes(normalizedFilter));

          for (const lang of filtered) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.classList.add("code-block-lang-option");
            btn.textContent = lang;
            if (lang === currentLang) {
              btn.dataset.selected = "true";
            }
            btn.addEventListener("mousedown", (e) => {
              e.preventDefault();
              e.stopPropagation();
              selectLanguage(lang === "plaintext" ? "" : lang);
              closeDropdown();
            });
            list.appendChild(btn);
          }
        }

        searchInput.addEventListener("input", () => {
          renderOptions(searchInput.value);
        });

        searchInput.addEventListener("keydown", (e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            closeDropdown();
            editor.commands.focus();
          }
          e.stopPropagation();
        });

        renderOptions("");
        dropdown.appendChild(searchInput);
        dropdown.appendChild(list);
        toolbar.appendChild(dropdown);

        // Focus search after paint, and add outside-click listener
        requestAnimationFrame(() => {
          searchInput.focus();
          document.addEventListener("mousedown", handleOutsideClick, true);
        });
      }

      function selectLanguage(lang: string) {
        currentLang = lang;
        langTrigger.textContent = lang || "plain";
        langTrigger.appendChild(chevron);
        const pos = getPos();
        if (typeof pos !== "number") return;
        editor.chain().focus().command(({ tr }) => {
          tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            language: lang || null,
          });
          return true;
        }).run();
      }

      langTrigger.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openDropdown();
      });

      // Close dropdown on outside click (added/removed dynamically)
      function handleOutsideClick(e: MouseEvent) {
        if (isDropdownOpen && dropdown && !toolbar.contains(e.target as Node)) {
          closeDropdown();
        }
      }

      // --- Copy button
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.classList.add("code-block-copy-btn");
      copyBtn.title = "Copy code";
      const copyIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
      const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      copyBtn.innerHTML = copyIcon;

      copyBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const pos = getPos();
        if (typeof pos !== "number") return;
        const resolvedNode = editor.state.doc.nodeAt(pos);
        const text = resolvedNode?.textContent ?? "";
        navigator.clipboard.writeText(text).then(() => {
          copyBtn.innerHTML = checkIcon;
          setTimeout(() => { copyBtn.innerHTML = copyIcon; }, 1500);
        });
      });

      toolbar.appendChild(langTrigger);
      toolbar.appendChild(copyBtn);

      // --- The <pre><code> content area
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.spellcheck = false;
      code.setAttribute("data-gramm", "false"); // Grammarly
      if (currentLang) {
        code.className = `language-${currentLang}`;
      }
      pre.appendChild(code);

      wrapper.appendChild(toolbar);
      wrapper.appendChild(pre);

      return {
        dom: wrapper,
        contentDOM: code,
        update(updatedNode) {
          if (updatedNode.type.name !== "codeBlock") return false;
          const nextLang = (updatedNode.attrs.language as string) || "";
          if (nextLang !== currentLang) {
            currentLang = nextLang;
            langTrigger.textContent = nextLang || "plain";
            langTrigger.appendChild(chevron);
            code.className = nextLang ? `language-${nextLang}` : "";
          }
          return true;
        },
        ignoreMutation(mutation) {
          // Ignore DOM changes in the toolbar (dropdown open/close)
          if (toolbar.contains(mutation.target as Node)) return true;
          return false;
        },
        stopEvent(event) {
          const target = event.target as HTMLElement;
          if (toolbar.contains(target)) return true;
          return false;
        },
        destroy() {
          closeDropdown();
        },
      };
    };
  },
});
