// Mostrar / ocultar senha (funciona em todos os campos com botão .ver-senha)
document.querySelectorAll('.ver-senha').forEach((botao) => {
  botao.addEventListener('click', () => {
    const input = botao.parentElement.querySelector('input');
    input.type = input.type === 'password' ? 'text' : 'password';
  });
});

// Confirmar senha (só no formulário de cadastro)
const form = document.querySelector('form[data-confirma]');
if (form) {
  const senha = form.querySelector('[name="senha"]');
  const confirmar = form.querySelector('[name="confirmar"]');

  const verificar = () => {
    confirmar.setCustomValidity(
      senha.value !== confirmar.value ? 'As senhas não são iguais' : ''
    );
  };

  senha.addEventListener('input', verificar);
  confirmar.addEventListener('input', verificar);
}