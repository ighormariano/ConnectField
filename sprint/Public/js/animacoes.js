/* animacoes.js
   - Faz seções e cards aparecerem ao entrar na tela, uma única vez por carregamento.
   - Sem JS, sem IntersectionObserver ou com movimento reduzido, nada é escondido. */
(function () {
  'use strict';

  // Faz o :active funcionar em botões no Safari/iOS (feedback de clique no celular)
  document.addEventListener('touchstart', function () {}, { passive: true });

  var semMovimento =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (semMovimento || !('IntersectionObserver' in window)) return;

  // Seletores reais do projeto + opt-in com data-revelar.
  // Linhas de tabela ficam de fora; só o contêiner da tabela.
  var SELETORES = [
    '.sobre .texto-sobre',
    '.sobre .container > img',
    '.card-institucional',
    '.dash .painel',
    '.produtos > .tabela-wrapper',
    '.pagina > .tabela-card',
    '[data-revelar]'
  ].join(',');

  function iniciar() {
    var alturaTela = window.innerHeight || document.documentElement.clientHeight;
    var alvos = document.querySelectorAll(SELETORES);
    if (!alvos.length) return;

    var observer = new IntersectionObserver(
      function (entradas) {
        entradas.forEach(function (entrada) {
          if (!entrada.isIntersecting) return;
          var el = entrada.target;
          observer.unobserve(el); // uma única vez
          el.classList.add('reveal-in');
          // Depois da transição, devolve o elemento ao estado original
          // (preserva hovers e transições do CSS do projeto).
          setTimeout(function () {
            el.classList.remove('reveal-pre', 'reveal-in');
          }, 1000);
        });
      },
      // threshold 0 + margem: funciona até para elementos muito altos
      { threshold: 0, rootMargin: '0px 0px -8% 0px' }
    );

    Array.prototype.forEach.call(alvos, function (el) {
      // O que já está visível na primeira tela não é escondido
      if (el.getBoundingClientRect().top < alturaTela) return;
      el.classList.add('reveal-pre');
      observer.observe(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();