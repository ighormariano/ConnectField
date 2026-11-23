// Inclua este arquivo nas páginas administrativas (de preferência em um layout compartilhado).
// Evita que a navegação Voltar reexiba uma página antiga do BFCache sem validar a sessão.
(() => {
    const esconder = () => {
        document.documentElement.style.visibility = 'hidden';
    };
    const mostrar = () => {
        document.documentElement.style.visibility = '';
    };

    window.addEventListener('pagehide', () => {
        esconder();
    });

    window.addEventListener('pageshow', async (event) => {
        if (!event.persisted) {
            mostrar();
            return;
        }

        esconder();

        try {
            const resposta = await fetch('/admin/session-status', {
                method: 'GET',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: { Accept: 'application/json' }
            });

            if (resposta.status === 204) {
                mostrar();
                return;
            }
        } catch (err) {
            console.warn('Não foi possível revalidar a sessão:', err);
        }

        // Em caso de sessão inválida OU erro de verificação, não exibe a página antiga.
        window.location.replace('/login');
    });
})();
