require('dotenv').config();

const express = require('express');

const path = require('path');

const session = require('express-session');

const pool = require('./db');



const app = express();



// ==========================================

// CONFIGURAÇÕES DO EXPRESS

// ==========================================



app.set('view engine', 'ejs');

app.set('views', path.join(__dirname, 'views'));



app.use(express.static(path.join(__dirname, 'public')));



app.use(express.json());

app.use(express.urlencoded({ extended: true }));



// ==========================================

// CONFIGURAÇÃO DE SESSÃO

// ==========================================



app.use(session({

    name: 'connect.sid',

    secret: process.env.SESSION_SECRET || 'chave-conectfield',

    resave: false,

    saveUninitialized: false,

    cookie: {

        httpOnly: true,

        sameSite: 'lax',

        secure: process.env.NODE_ENV === 'production',

        maxAge: 24 * 60 * 60 * 1000

    }

}));



// ==========================================

// MIDDLEWARE DE AUTENTICAÇÃO

// ==========================================



// Protege respostas privadas contra cache HTTP do navegador e de proxies.
// Deve ser registrado ANTES das rotas de autenticação e das rotas administrativas.
app.use((req, res, next) => {
    const caminhoPrivado = req.path === '/admin' || req.path.startsWith('/admin/');
    const caminhoAutenticacao = ['/login', '/logout', '/cadastro', '/esqueci-senha'].includes(req.path);

    if (caminhoPrivado || caminhoAutenticacao) {
        res.set('Cache-Control', 'private, no-store, no-cache, max-age=0, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }

    next();
});

const exigirLogin = require('./middleware/auth');



// ==========================================

// ROTAS DE AUTENTICAÇÃO

// ==========================================



app.use('/', require('./routes/auth')(pool, exigirLogin));

// Bloqueia TODAS as rotas /admin quando a sessão já foi encerrada,
// inclusive rotas criadas futuramente.
app.use('/admin', (req, res, next) => {
    if (req.session && req.session.usuario) {
        return next();
    }

    if (req.method === 'GET' && req.accepts('html')) {
        return res.redirect('/login');
    }

    return res.status(401).json({ erro: 'Sessão encerrada. Faça login novamente.' });
});

// Usada pelo navegador para revalidar páginas restauradas pelo histórico (BFCache).
app.get('/admin/session-status', (req, res) => {
    return res.status(204).end();
});





// ==========================================

// ROTA PRINCIPAL

// ==========================================



app.get('/', (req, res) => {

    if (req.session && req.session.usuario) {

        return res.redirect('/admin/dashboard');

    }



    return res.render('index');

});



// ==========================================

// ROTA SOBRE

// ==========================================



app.get('/sobre', (req, res) => {

    return res.render('sobre');

});



// ==========================================

// CATÁLOGO PÚBLICO DE PRODUTOS

// ==========================================



app.get('/produtos', async (req, res) => {

    try {

        const { q, categoria, status } = req.query;



        let query = `

            SELECT

                p.*,

                c.nome AS categoria_nome

            FROM produtos p

            INNER JOIN categorias c

                ON c.id = p.categorias_id AND c.ativo = true

            WHERE p.ativo = true

        `;



        const params = [];



        if (q && q.trim()) {

            params.push(`%${q.trim()}%`);



            query += `

                AND (

                    p.nome ILIKE $${params.length}

                    OR p.descricao ILIKE $${params.length}

                )

            `;

        }



        if (categoria) {

            params.push(categoria);

            query += ` AND p.categorias_id = $${params.length}`;

        }



        if (status === 'baixo') {

            query += ` AND p.qnt_estoque <= p.estoque_min`;

        } else if (status === 'ativo') {

            query += ` AND p.qnt_estoque > p.estoque_min`;

        }



        query += ' ORDER BY p.nome ASC';



        const [produtosRes, categoriasRes] = await Promise.all([

            pool.query(query, params),

            pool.query(`

                SELECT id, nome

                FROM categorias

                WHERE ativo = true

                ORDER BY nome ASC

            `)

        ]);



        return res.render('produtos', {

            produtos: produtosRes.rows,

            categorias: categoriasRes.rows,

            filtros: {

                q: q || '',

                categoria: categoria || '',

                status: status || ''

            }

        });



    } catch (err) {

        console.error('Erro ao carregar produtos:', err);



        return res.status(500).send(

            'Erro ao carregar produtos: ' + err.message

        );

    }

});



// ==========================================

// DASHBOARD ADMINISTRATIVO

// ==========================================



app.get('/admin/dashboard', exigirLogin, async (req, res) => {

    try {

        const [

            totalProdutos,

            valorEstoque,

            estoqueBaixo,

            todosProdutos,

            movimentacoes,

            categoriasRes

        ] = await Promise.all([

            pool.query(`

                SELECT COUNT(*)

                FROM produtos

                WHERE ativo = true

            `),

            pool.query(`

                SELECT COALESCE(SUM(qnt_estoque * custo), 0) AS total

                FROM produtos

                WHERE ativo = true

            `),

            pool.query(`

                SELECT *

                FROM produtos

                WHERE qnt_estoque <= estoque_min

                AND ativo = true

                ORDER BY qnt_estoque ASC, nome ASC

            `),

            pool.query(`

                SELECT id, nome, qnt_estoque

                FROM produtos

                WHERE ativo = true

                ORDER BY nome ASC

            `),

            pool.query(`

                SELECT

                    m.*,

                    p.nome AS nome,

                    u.nome AS usuario_nome

                FROM movimentacoes m

                LEFT JOIN produtos p

                    ON p.id = m.produtos_id

                LEFT JOIN usuarios u

                    ON u.id = m.usuarios_id

                ORDER BY m.data DESC, m.id DESC

                LIMIT 15

            `),

            pool.query(`

                SELECT

                    c.id,

                    c.nome,

                    COUNT(p.id) AS total

                FROM categorias c

                LEFT JOIN produtos p

                    ON p.categorias_id = c.id

                    AND p.ativo = true

                WHERE c.ativo = true

                GROUP BY c.id, c.nome

                ORDER BY c.nome ASC

            `)

        ]);



return res.render('admin/dashboard', {

    resumo: {

        valor_total: valorEstoque.rows[0].total,

        total_produtos: Number(totalProdutos.rows[0].count),

        categorias: categoriasRes.rows.length,

        abaixo: estoqueBaixo.rows.length

    },

    baixos: estoqueBaixo.rows,

    movimentos: movimentacoes.rows,

    produtos: todosProdutos.rows,

    categorias: categoriasRes.rows,

    usuarioLogado: req.session.usuario

});



    } catch (err) {

    console.error('Erro no dashboard:', err);



    return res.status(500).send(

        'Erro no dashboard: ' + err.message

    );

}

});



// ==========================================

// REGISTRAR MOVIMENTAÇÃO DE ESTOQUE

// ==========================================



app.post('/admin/movimentacoes', exigirLogin, async (req, res) => {

    const { produto_id, tipo } = req.body;



    const qnt = parseInt(req.body.quantidade, 10);

    const produtoId = parseInt(produto_id, 10);

    const usuarioId = req.session && req.session.usuario ? req.session.usuario.id : null;



    if (

        !produtoId ||

        !['entrada', 'saida'].includes(tipo) ||

        !Number.isInteger(qnt) ||

        qnt < 1

    ) {

        return res.status(400).json({

            erro: 'Dados inválidos. Verifique produto, tipo e quantidade.'

        });

    }



    let client;



    try {

        client = await pool.connect();

        await client.query('BEGIN');



        const prod = await client.query(

            `

            SELECT qnt_estoque

            FROM produtos

            WHERE id = $1 AND ativo = true

            FOR UPDATE

            `,

            [produtoId]

        );



        if (prod.rows.length === 0) {

            await client.query('ROLLBACK');



            return res.status(404).json({

                erro: 'Produto não encontrado ou inativo.'

            });

        }



        const atual = Number(prod.rows[0].qnt_estoque);



        if (tipo === 'saida' && qnt > atual) {

            await client.query('ROLLBACK');



            return res.status(400).json({

                erro: `Estoque insuficiente (atual: ${atual} un).`

            });

        }



        const novo = tipo === 'entrada'

            ? atual + qnt

            : atual - qnt;



        await client.query(

            `

            UPDATE produtos

            SET qnt_estoque = $1

            WHERE id = $2

            `,

            [novo, produtoId]

        );



        await client.query(

            `

            INSERT INTO movimentacoes

                (produtos_id, tipo, quantidade, data, estoque_rest, usuarios_id)

            VALUES ($1, $2, $3, NOW(), $4, $5)

            `,

            [produtoId, tipo, qnt, novo, usuarioId]

        );



        await client.query('COMMIT');



        return res.json({

            ok: true,

            novo_estoque: novo

        });



    } catch (err) {

        if (client) {

            await client.query('ROLLBACK').catch(() => { });

        }



        console.error('Erro ao registrar movimentação:', err);



        return res.status(500).json({

            erro: 'Erro ao registrar movimentação: ' + err.message

        });



    } finally {

        if (client) {

            client.release();

        }

    }

});



// ==========================================

// LISTAR E BUSCAR CATEGORIAS

// ==========================================



app.get('/admin/categorias', exigirLogin, async (req, res) => {

    try {

        const { q } = req.query;



        let query = `

            SELECT

                c.id,

                c.nome,

                c.descricao,

                c.ativo,

                COUNT(

                    CASE

                        WHEN p.ativo = true THEN p.id

                    END

                ) AS total_produtos,

                COUNT(

                    CASE

                        WHEN p.qnt_estoque <= p.estoque_min

                        AND p.ativo = true THEN 1

                    END

                ) AS produtos_baixo

            FROM categorias c

            LEFT JOIN produtos p

                ON p.categorias_id = c.id

            WHERE c.ativo = true

        `;



        const params = [];



        if (q && q.trim()) {

            params.push(`%${q.trim()}%`);

            query += ` AND c.nome ILIKE $${params.length}`;

        }



        query += `

            GROUP BY

                c.id,

                c.nome,

                c.descricao,

                c.ativo

            ORDER BY c.nome ASC

        `;



        const categoriasRes = await pool.query(query, params);



        return res.render('admin/categorias', {

            categorias: categoriasRes.rows,

            filtros: {

                q: q || ''

            },

            erro: req.query.erro || null,

            mensagem: req.query.mensagem || null,

            usuarioLogado: req.session.usuario

        });



    } catch (err) {

        console.error('Erro ao carregar categorias:', err);



        return res.status(500).send(

            'Erro ao carregar categorias: ' + err.message

        );

    }

});



// ==========================================

// LISTAR E BUSCAR PRODUTOS - ADMIN

// ==========================================



app.get('/admin/produtos', exigirLogin, async (req, res) => {

    try {

        const { q, categoria, status } = req.query;



        let query = `

            SELECT

                p.*,

                c.nome AS categoria_nome

            FROM produtos p

            LEFT JOIN categorias c

                ON c.id = p.categorias_id

            WHERE p.ativo = true

        `;



        const params = [];



        if (q && q.trim()) {

            params.push(`%${q.trim()}%`);



            query += `

                AND (

                    p.nome ILIKE $${params.length}

                    OR p.descricao ILIKE $${params.length}

                )

            `;

        }



        if (categoria) {

            params.push(categoria);

            query += ` AND p.categorias_id = $${params.length}`;

        }



        if (status === 'baixo') {

            query += ` AND p.qnt_estoque <= p.estoque_min`;

        } else if (status === 'ativo') {

            query += ` AND p.qnt_estoque > p.estoque_min`;

        }



        query += ` ORDER BY p.nome ASC`;



        const [produtosRes, categoriasRes] = await Promise.all([

            pool.query(query, params),

            pool.query(`

                SELECT id, nome

                FROM categorias

                WHERE ativo = true

                ORDER BY nome ASC

            `)

        ]);



        return res.render('admin/produtos', {

            produtos: produtosRes.rows,

            categorias: categoriasRes.rows,

            filtros: {

                q: q || '',

                categoria: categoria || '',

                status: status || ''

            },

            usuarioLogado: req.session.usuario,

            erro: req.query.erro || null,

            mensagem: req.query.mensagem || null

        });



    } catch (err) {

        console.error('Erro ao carregar produtos:', err);



        return res.status(500).send(

            'Erro ao carregar produtos: ' + err.message

        );

    }

});



// ==========================================

// ROTAS DE CADASTRO, EDIÇÃO E EXCLUSÃO DE PRODUTOS

// ==========================================



app.use(

    '/admin/produtos',

    require('./routes/produto')(pool, exigirLogin)

);



// ==========================================

// FORMULÁRIO DE NOVA CATEGORIA

// ==========================================



app.get(['/admin/categorias-form', '/admin/categorias/nova'], exigirLogin, (req, res) => {

    return res.render('admin/categorias-form', {

        categoria: {},

        erro: null,

        usuarioLogado: req.session.usuario

    });

});



// ==========================================

// PROCESSAR CADASTRO DE CATEGORIA

// ==========================================



app.post(['/admin/categorias', '/admin/categorias-form'], exigirLogin, async (req, res) => {

    const { nome, descricao } = req.body;



    try {

        if (!nome || !nome.trim()) {

            return res.status(400).render('admin/categorias-form', {

                categoria: { nome, descricao },

                erro: 'Informe o nome da categoria.',

                usuarioLogado: req.session.usuario

            });

        }



        const nomeLimpo = nome.trim();



        if (nomeLimpo.length > 60) {

            return res.status(400).render('admin/categorias-form', {

                categoria: { nome, descricao },

                erro: 'O nome da categoria deve ter no máximo 60 caracteres.',

                usuarioLogado: req.session.usuario

            });

        }



        // Verifica duplicidade de categoria ativa ou reativa se estiver inativa

        const existente = await pool.query(

            `SELECT id, ativo FROM categorias WHERE LOWER(nome) = LOWER($1) LIMIT 1`,

            [nomeLimpo]

        );



        if (existente.rows.length > 0) {

            if (existente.rows[0].ativo) {

                return res.status(409).render('admin/categorias-form', {

                    categoria: { nome, descricao },

                    erro: 'Já existe uma categoria ativa com este nome.',

                    usuarioLogado: req.session.usuario

                });

            } else {

                await pool.query(

                    `UPDATE categorias SET nome = $1, descricao = $2, ativo = true WHERE id = $3`,

                    [nomeLimpo, descricao ? descricao.trim() : null, existente.rows[0].id]

                );

                return res.redirect('/admin/categorias?mensagem=' + encodeURIComponent('Categoria reativada com sucesso!'));

            }

        }



        await pool.query(

            `

            INSERT INTO categorias

                (nome, descricao, ativo)

            VALUES ($1, $2, true)

            `,

            [nomeLimpo, descricao ? descricao.trim() : null]

        );



        return res.redirect('/admin/categorias?mensagem=' + encodeURIComponent('Categoria cadastrada com sucesso!'));



    } catch (err) {

        console.error('Erro ao criar categoria:', err);



        return res.status(500).render('admin/categorias-form', {

            categoria: {

                nome,

                descricao

            },

            erro: 'Erro ao salvar categoria: ' + err.message,

            usuarioLogado: req.session.usuario

        });

    }

});



// ==========================================

// FORMULÁRIO DE EDIÇÃO DE CATEGORIA

// ==========================================



app.get('/admin/categorias/:id/editar', exigirLogin, async (req, res) => {

    const id = Number(req.params.id);



    if (!Number.isInteger(id) || id <= 0) {

        return res.redirect('/admin/categorias');

    }



    try {

        const result = await pool.query(

            `

            SELECT *

            FROM categorias

            WHERE id = $1 AND ativo = true

            `,

            [id]

        );



        if (result.rows.length === 0) {

            return res.redirect('/admin/categorias');

        }



        return res.render('admin/categorias-form', {

            categoria: result.rows[0],

            erro: null,

            usuarioLogado: req.session.usuario

        });



    } catch (err) {

        console.error('Erro ao carregar categoria:', err);



        return res.status(500).send(

            'Erro ao carregar categoria: ' + err.message

        );

    }

});



// ==========================================

// PROCESSAR EDIÇÃO DE CATEGORIA

// ==========================================



app.post(['/admin/categorias/:id', '/admin/categorias/:id/editar'], exigirLogin, async (req, res) => {

    const id = Number(req.params.id);

    const { nome, descricao } = req.body;



    if (!Number.isInteger(id) || id <= 0) {

        return res.redirect('/admin/categorias');

    }



    try {

        if (!nome || !nome.trim()) {

            return res.status(400).render('admin/categorias-form', {

                categoria: { id, nome, descricao },

                erro: 'Informe o nome da categoria.',

                usuarioLogado: req.session.usuario

            });

        }



        const nomeLimpo = nome.trim();



        const duplicada = await pool.query(

            `SELECT id FROM categorias WHERE LOWER(nome) = LOWER($1) AND id <> $2 LIMIT 1`,

            [nomeLimpo, id]

        );



        if (duplicada.rows.length > 0) {

            return res.status(409).render('admin/categorias-form', {

                categoria: { id, nome, descricao },

                erro: 'Já existe outra categoria com este nome.',

                usuarioLogado: req.session.usuario

            });

        }



        await pool.query(

            `

            UPDATE categorias

            SET nome = $1, descricao = $2

            WHERE id = $3 AND ativo = true

            `,

            [nomeLimpo, descricao ? descricao.trim() : null, id]

        );



        return res.redirect('/admin/categorias?mensagem=' + encodeURIComponent('Categoria atualizada com sucesso!'));



    } catch (err) {

        console.error('Erro ao atualizar categoria:', err);



        return res.status(500).render('admin/categorias-form', {

            categoria: {

                id,

                nome,

                descricao

            },

            erro: 'Erro ao atualizar categoria: ' + err.message,

            usuarioLogado: req.session.usuario

        });

    }

});



// ==========================================

// EXCLUSÃO LÓGICA DE CATEGORIA

// ==========================================



app.post('/admin/categorias/:id/excluir', exigirLogin, async (req, res) => {

    const id = Number(req.params.id);



    if (!Number.isInteger(id) || id <= 0) {

        return res.redirect('/admin/categorias');

    }



    try {

        // Regra de negócio: impedir exclusão de categoria com produtos ativos vinculados

        const produtosVinculados = await pool.query(

            `SELECT COUNT(*) FROM produtos WHERE categorias_id = $1 AND ativo = true`,

            [id]

        );



        if (Number(produtosVinculados.rows[0].count) > 0) {

            return res.redirect(

                '/admin/categorias?erro=' +

                encodeURIComponent('Não é possível excluir uma categoria que possui produtos ativos vinculados.')

            );

        }



        await pool.query(

            `

            UPDATE categorias

            SET ativo = false

            WHERE id = $1

            `,

            [id]

        );



        return res.redirect('/admin/categorias?mensagem=' + encodeURIComponent('Categoria excluída com sucesso!'));



    } catch (err) {

        console.error('Erro ao excluir categoria:', err);



        return res.status(500).send(

            'Erro ao excluir categoria: ' + err.message

        );

    }

});



// ==========================================

// TRATAMENTO DE ERROS DE UPLOAD

// ==========================================



app.use((err, req, res, next) => {

    if (err instanceof require('multer').MulterError) {

        console.error('Erro no upload:', err);



        return res.status(400).send(

            'Erro no envio da imagem: ' + err.message

        );

    }



    if (err) {

        console.error('Erro na aplicação:', err);



        return res.status(500).send(

            'Erro interno: ' + err.message

        );

    }



    next();

});



// ==========================================

// TRATAMENTO DE PÁGINAS NÃO ENCONTRADAS

// ==========================================



app.use((req, res) => {

    return res.status(404).send('Página não encontrada.');

});



// ==========================================
// INICIAR SERVIDOR
// ==========================================

const os = require('os');
const { exec } = require('child_process');

function obterIPv4Local() {
    const interfaces = os.networkInterfaces();
    for (const nome of Object.keys(interfaces)) {
        for (const iface of interfaces[nome]) {
            // Ignora loopback (127.0.0.1) e pega apenas IPv4 externo da rede local
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0'; // Aceita conexões locais e da rede
const IPV4 = obterIPv4Local();

app.listen(PORT, HOST, () => {
    const url = `http://${IPV4}:${PORT}`;
    console.log(`Servidor rodando em ${url}`);

    // Abre o navegador automaticamente conforme o sistema operacional
    const comando =
        process.platform === 'win32' ? `start "" "${url}"` :
        process.platform === 'darwin' ? `open "${url}"` :
        `xdg-open "${url}"`;

    exec(comando);
});
