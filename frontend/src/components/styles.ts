// Classes repetidas entre telas: o mesmo foco visível e os mesmos estados em todo botão e campo
const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-torch";

export const buttonPrimary =
  `rounded bg-torch px-4 py-2 font-bold text-crypt-950 hover:brightness-110 ${focus} disabled:opacity-60`;

export const buttonSecondary =
  `rounded border border-crypt-700 px-4 py-2 hover:text-torch ${focus} disabled:opacity-60`;

export const fieldClass =
  `rounded border border-bone/40 bg-crypt-900 px-3 py-2 text-bone ${focus} disabled:opacity-60`;

// Link dentro da página: sem sublinhado parado, porque a cor da tocha e o peso já o separam do texto
// em volta (sem o peso, só a cor fica abaixo de 3:1); o sublinhado aparece no hover. O cabeçalho e o
// rodapé têm o estilo deles, no Layout
export const linkClass = `font-semibold text-torch underline-offset-4 hover:underline ${focus}`;
