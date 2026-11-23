const express = require('express');
const bcrypt = require('bcryptjs');

module.exports = (pool, exigirLogin) => {
    const router = express.Router();

    async function existeAdministrador() {
        const resultado = await pool.query(
            'SELECT 1 FROM usuarios WHERE ativo = true LIMIT 1'
        );
        return resultado.rows.length > 0;
    }

    async function exigirLoginOuPrimeiroAcesso(req, res, next) {
        try {
            const temAdmin = await existeAdministrador();
            if (!temAdmin) {
                res.locals.primeiroAcesso = true;
                return next();
            }

            res.locals.primeiroAcesso = false;
            return exigirLogin(req, res, next);
        } catch (err) {
            console.error('Erro ao verificar primeiro acesso:', err);
            return exigirLogin(req, res, next);
        }
    }

    // TELA DE LOGIN
    router.get('/login', async (req, res) => {
        if (req.session && req.session.usuario) {
            return res.redirect('/admin/dashboard');
        }

        let semAdmin = false;
        try {
            semAdmin = !(await existeAdministrador());
        } catch (err) {
            console.error('Erro ao verificar administradores:', err);
        }

        return res.render('login', {
            erro: null,
            sucesso: req.query.sucesso || null,
            semAdmin
        });
    });

    // PROCESSAR LOGIN
    router.post('/login', async (req, res) => {
        const usuario = (req.body.usuario || '').trim().toLowerCase();
        const senha = req.body.senha;
        const lembrar = req.body.lembrar;

        const renderErro = (status, erro) => res.status(status).render('login', {
            erro,
            sucesso: null,
            semAdmin: false
        });

        if (!usuario || !senha) {
            return renderErro(400, 'Preencha o e-mail e a senha.');
        }

        try {
            const resultado = await pool.query(
                `SELECT id, nome, email, senha, ativo
                 FROM usuarios
                 WHERE LOWER(email) = $1
                   AND ativo = true
                 LIMIT 1`,
                [usuario]
            );

            if (resultado.rows.length === 0) {
                return renderErro(401, 'E-mail ou senha inválidos.');
            }

            const user = resultado.rows[0];
            const senhaValida = await bcrypt.compare(senha, user.senha);
            if (!senhaValida) {
                return renderErro(401, 'E-mail ou senha inválidos.');
            }

            req.session.regenerate((err) => {
                if (err) {
                    console.error('Erro ao criar sessão:', err);
                    return renderErro(500, 'Não foi possível iniciar sua sessão.');
                }

                delete user.senha;
                req.session.usuario = user;

                if (lembrar) {
                    req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000;
                }

                req.session.save((erroSessao) => {
                    if (erroSessao) {
                        console.error('Erro ao salvar sessão:', erroSessao);
                        return renderErro(500, 'Erro ao salvar sua sessão.');
                    }

                    return res.redirect('/admin/dashboard');
                });
            });
        } catch (err) {
            console.error('Erro no Login:', err);
            return renderErro(500, 'Erro interno ao realizar login.');
        }
    });

    // TELA DE CADASTRO DE ADMINISTRADOR
    router.get('/cadastro', exigirLoginOuPrimeiroAcesso, (req, res) => {
        return res.render('cadastro', {
            erro: null,
            usuarioLogado: req.session ? req.session.usuario : null,
            primeiroAcesso: res.locals.primeiroAcesso
        });
    });

    // PROCESSAR CADASTRO DE ADMINISTRADOR
    router.post('/cadastro', exigirLoginOuPrimeiroAcesso, async (req, res) => {
        const nome = (req.body.nome || '').trim();
        const email = (req.body.email || '').trim().toLowerCase();
        const senha = req.body.senha;
        const confirmar = req.body.confirmar;
        const termos = req.body.termos;
        const usuarioLogado = req.session ? req.session.usuario : null;

        const renderErro = (status, erro) => res.status(status).render('cadastro', {
            erro,
            usuarioLogado,
            primeiroAcesso: res.locals.primeiroAcesso
        });

        if (!nome || !email || !senha || !confirmar) {
            return renderErro(400, 'Preencha todos os campos.');
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return renderErro(400, 'Informe um e-mail válido.');
        }
        if (senha.length < 6) {
            return renderErro(400, 'A senha deve ter no mínimo 6 caracteres.');
        }
        if (senha !== confirmar) {
            return renderErro(400, 'As senhas informadas não coincidem.');
        }
        if (!termos) {
            return renderErro(400, 'Você precisa aceitar os termos de uso.');
        }

        try {
            const senhaHash = await bcrypt.hash(senha, 10);
            const novoUser = await pool.query(
                `INSERT INTO usuarios (nome, email, senha, ativo)
                 VALUES ($1, $2, $3, true)
                 RETURNING id, nome, email, ativo`,
                [nome, email, senhaHash]
            );

            if (!usuarioLogado) {
                // Evita reaproveitar o identificador de uma sessão anterior.
                return req.session.regenerate((err) => {
                    if (err) {
                        console.error('Erro ao criar sessão do primeiro acesso:', err);
                        return res.status(500).send('Administrador criado, mas não foi possível iniciar a sessão. Faça login.');
                    }

                    req.session.usuario = novoUser.rows[0];
                    return req.session.save((saveErr) => {
                        if (saveErr) {
                            console.error('Erro ao salvar sessão do primeiro acesso:', saveErr);
                            return res.status(500).send('Administrador criado, mas não foi possível salvar a sessão. Faça login.');
                        }
                        return res.redirect('/admin/dashboard');
                    });
                });
            }

            return res.redirect('/admin/dashboard');
        } catch (err) {
            console.error('Erro no Cadastro:', err);
            if (err.code === '23505') {
                return renderErro(409, 'Este e-mail já está cadastrado.');
            }
            return renderErro(500, 'Não foi possível cadastrar o usuário.');
        }
    });

    // TELA ESQUECI MINHA SENHA
    router.get('/esqueci-senha', (req, res) => {
        return res.render('esqueci-senha', {
            sucesso: null,
            erro: null
        });
    });

    // PROCESSAR ESQUECI MINHA SENHA
    router.post('/esqueci-senha', async (req, res) => {
        const email = (req.body.email || '').trim().toLowerCase();
        if (!email) {
            return res.status(400).render('esqueci-senha', {
                sucesso: null,
                erro: 'Informe um e-mail válido.'
            });
        }

        try {
            await pool.query(
                'SELECT id FROM usuarios WHERE LOWER(email) = $1 AND ativo = true',
                [email]
            );
            return res.render('esqueci-senha', {
                sucesso: 'Se o e-mail estiver cadastrado, enviaremos as instruções de recuperação.',
                erro: null
            });
        } catch (err) {
            console.error('Erro ao processar recuperação:', err);
            return res.status(500).render('esqueci-senha', {
                sucesso: null,
                erro: 'Não foi possível processar sua solicitação.'
            });
        }
    });

    // LOGOUT: invalida a sessão armazenada no servidor e apaga o cookie.
    function encerrarSessao(req, res) {
        res.set('Cache-Control', 'private, no-store, no-cache, max-age=0, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        const limparCookieERedirecionar = () => {
            res.clearCookie('connect.sid', {
                path: '/',
                httpOnly: true,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production'
            });
            return res.redirect('/');
        };

        if (!req.session) {
            return limparCookieERedirecionar();
        }

        return req.session.destroy((err) => {
            if (err) {
                console.error('Erro ao encerrar sessão:', err);
                return res.status(500).send('Erro ao sair do sistema.');
            }
            return limparCookieERedirecionar();
        });
    }

    // Mantém compatibilidade com links de logout existentes.
    router.get('/logout', encerrarSessao);
    router.post('/logout', encerrarSessao);

    return router;
};
