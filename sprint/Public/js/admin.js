// public/js/admin.js — Dashboard: modal de movimentação, filtro da tabela, contadores
document.addEventListener('DOMContentLoaded', () => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const modal = $('#modal');
  const form = $('#formMov');
  const selProduto = $('#produto');
  const inpQtd = $('#quantidade');
  const dica = $('#dicaEstoque');
  const erroForm = $('#erroForm');
  const btnSalvar = $('#btnSalvar');
  const toastEl = $('#toast');

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg, tipo = 'ok') {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.className = 'toast visivel ' + tipo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('visivel'), 3000);
  }

  // ---------- Modal ----------
  const tipoAtual = () => $('input[name="tipo"]:checked', form).value;

  function atualizarBotao() {
    btnSalvar.textContent = tipoAtual() === 'entrada' ? 'Salvar entrada' : 'Salvar saída';
  }

  function atualizarDica() {
    const opt = selProduto.selectedOptions[0];
    if (!opt || !opt.value) {
      dica.textContent = 'Escolha um produto para ver o estoque atual.';
      return;
    }
    dica.textContent = `Estoque atual: ${opt.dataset.estoque} un`;
  }

  function mostrarErro(msg) {
    erroForm.textContent = msg;
    erroForm.hidden = !msg;
  }

  function abrirModal({ produtoId = '', tipo = 'entrada' } = {}) {
    form.reset();
    mostrarErro('');
    selProduto.value = produtoId;
    $(`input[name="tipo"][value="${tipo}"]`, form).checked = true;
    inpQtd.value = 1;
    atualizarBotao();
    atualizarDica();
    modal.hidden = false;
    (produtoId ? inpQtd : selProduto).focus();
  }

  function fecharModal() {
    modal.hidden = true;
  }

  $('#abrirModal').addEventListener('click', () => abrirModal());
  $('#fecharModal').addEventListener('click', fecharModal);
  modal.addEventListener('click', e => { if (e.target === modal) fecharModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) fecharModal(); });

  // Chip "X un" na lista de estoque mínimo → abre modal já com o produto
  $$('[data-repor]').forEach(btn => {
    btn.addEventListener('click', () => abrirModal({ produtoId: btn.dataset.repor, tipo: 'entrada' }));
  });

  $$('input[name="tipo"]', form).forEach(r => r.addEventListener('change', atualizarBotao));
  selProduto.addEventListener('change', atualizarDica);

  // Stepper
  $$('[data-passo]', form).forEach(btn => {
    btn.addEventListener('click', () => {
      const novo = (parseInt(inpQtd.value, 10) || 1) + Number(btn.dataset.passo);
      inpQtd.value = Math.max(1, novo);
    });
  });

  // ---------- Envio ----------
  form.addEventListener('submit', async e => {
    e.preventDefault();
    mostrarErro('');

    const produto_id = selProduto.value;
    const tipo = tipoAtual();
    const quantidade = parseInt(inpQtd.value, 10);

    if (!produto_id) return mostrarErro('Selecione um produto.');
    if (!Number.isInteger(quantidade) || quantidade < 1) return mostrarErro('Informe uma quantidade válida.');

    const estoque = Number(selProduto.selectedOptions[0].dataset.estoque);
    if (tipo === 'saida' && quantidade > estoque) {
      return mostrarErro(`Estoque insuficiente (atual: ${estoque} un).`);
    }

    btnSalvar.disabled = true;
    try {
      const resp = await fetch('/admin/movimentacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produto_id, tipo, quantidade })
      });

      if (resp.status === 401) { location.href = '/login'; return; }

      const dados = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        mostrarErro(dados.erro || 'Não foi possível registrar a movimentação.');
        return;
      }

      fecharModal();
      toast(tipo === 'entrada' ? 'Entrada registrada!' : 'Saída registrada!');
      setTimeout(() => location.reload(), 700);
    } catch (err) {
      mostrarErro('Erro de conexão com o servidor.');
    } finally {
      btnSalvar.disabled = false;
    }
  });

  // ---------- Filtro da tabela de movimentações ----------
  const botoesFiltro = $$('.filtro-tipo [data-filtro]');
  botoesFiltro.forEach(btn => {
    btn.addEventListener('click', () => {
      botoesFiltro.forEach(b => b.classList.toggle('ativo', b === btn));
      const filtro = btn.dataset.filtro;
      let visiveis = 0;

      $$('#corpoMov tr[data-tipo]').forEach(tr => {
        const mostrar = filtro === 'todas' || tr.dataset.tipo === filtro;
        tr.hidden = !mostrar;
        if (mostrar) visiveis++;
      });

      $('.vazio-linha').hidden = visiveis > 0;
    });
  });

  // ---------- Animação dos indicadores ----------
  $$('[data-contar]').forEach(el => {
    const alvo = Number(el.dataset.contar);
    if (!Number.isFinite(alvo)) return;
    const moeda = el.hasAttribute('data-moeda');
    const fmt = v => moeda
      ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : Math.round(v).toString();

    const dur = 800;
    const ini = performance.now();
    (function passo(t) {
      const p = Math.min(1, (t - ini) / dur);
      el.textContent = fmt(alvo * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(passo);
    })(ini);
  });
});