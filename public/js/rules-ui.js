// Rules section (summary on screen) and modal (full rules). Shared by both screens.

import { CLASSIC_RULES, RULES_CREDIT, RULES_FULL, RULES_SUMMARY } from './rules.js';
import { h } from './dom.js';

function rulesDialog() {
  const dialog = h('dialog', { class: 'dialog dialog-wide', id: 'rules-dialog', 'aria-labelledby': 'rules-title' },
    h('div', { class: 'dialog-body' },
      h('div', { class: 'dialog-head' },
        h('h2', { id: 'rules-title', text: 'Reglas de Mafia' }),
        h('button', { class: 'btn btn-ghost btn-small', 'aria-label': 'Cerrar las reglas', text: 'Cerrar', onclick: () => dialog.close() }),
      ),
      h('p', { class: 'muted', text: 'Modo por defecto: reglas originales de Dmitri Davýdov.' }),
      RULES_FULL.map((section) => h('section', { class: 'rules-section' },
        h('h3', { text: section.title }),
        h('ul', {}, section.items.map((item) => h('li', { text: item }))),
      )),
      h('section', { class: 'rules-section rules-variant' },
        h('h3', { text: CLASSIC_RULES.title }),
        h('p', { class: 'muted', text: CLASSIC_RULES.note }),
        h('ul', {}, CLASSIC_RULES.items.map((item) => h('li', { text: item }))),
      ),
      h('p', { class: 'credit', text: RULES_CREDIT }),
    ),
  );
  return dialog;
}

/** Fills `container` with the rules summary and wires every [data-open-rules] button to the modal. */
export function mountRules(container) {
  const dialog = rulesDialog();
  document.body.append(dialog);
  const open = () => dialog.showModal();

  container.replaceChildren(
    h('h2', { text: 'Cómo se juega' }),
    h('ol', { class: 'rules-summary' }, RULES_SUMMARY.map((item) => h('li', { text: item }))),
    h('button', { class: 'btn btn-ghost', onclick: open, text: 'Ver las reglas completas' }),
  );
  for (const button of document.querySelectorAll('[data-open-rules]')) button.addEventListener('click', open);
}
