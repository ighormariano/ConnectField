const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const pastaUploads = path.join(__dirname, '../public/uploads');

if (!fs.existsSync(pastaUploads)) {
    fs.mkdirSync(pastaUploads, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, pastaUploads);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const nomeUnico = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        cb(null, nomeUnico);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp'];
        if (tiposPermitidos.includes(file.mimetype)) {
            return cb(null, true);
        }
        cb(new Error('Envie uma imagem PNG, JPG ou WEBP.'));
    },
    limits: {
        fileSize: 5 * 1024 * 1024
    }
});

function removerArquivoUpload(caminhoRelativo) {
    if (!caminhoRelativo || !caminhoRelativo.startsWith('/uploads/')) return;
    const caminhoAbsoluto = path.join(__dirname, '../public', caminhoRelativo);
    fs.unlink(caminhoAbsoluto, () => {});
}

module.exports = (pool, exigirLogin) => {

    async function buscarCategorias() {
        const resultado = await pool.query(`
            SELECT id, nome
            FROM categorias
            WHERE ativo = true
            ORDER BY nome ASC
        `);
        return resultado.rows;
    }

    function dadosFormulario(body) {
        const custoStr = String(body.custo ?? '0').replace(',', '.');
        return {
            nome: (body.nome || '').trim(),
            descricao: (body.descricao || '').trim() || null,
            categoria_id: Number(body.categoria_id),
            qnt_estoque: Number(body.qnt_estoque),
            estoque_min: Number(body.estoque_min),
            custo: Number(custoStr)
        };
    }

    function validarProduto(dados) {
        if (!dados.nome) {
            return 'Informe o nome do produto.';
        }
        if (dados.nome.length > 100) {
            return 'O nome do produto deve ter no máximo 100 caracteres.';
        }
        if (!Number.isInteger(dados.categoria_id) || dados.categoria_id <= 0) {
            return 'Selecione uma categoria válida.';
        }
        if (!Number.isInteger(dados.qnt_estoque) || dados.qnt_estoque < 0) {
            return 'Informe uma quantidade de estoque válida (inteiro maior ou igual a zero).';
        }
        if (!Number.isInteger(dados.estoque_min) || dados.estoque_min < 0) {
            return 'Informe um estoque mínimo válido (inteiro maior ou igual a zero).';
        }
        if (!Number.isFinite(dados.custo) || dados.custo < 0) {
            return 'Informe um custo unitário válido.';
        }
        return null;
    }

    // ==========================================
    // GET - FORMULÁRIO DE NOVO PRODUTO
    // ==========================================
    router.get('/novo', exigirLogin, async (req, res) => {
        try {
            const categorias = await buscarCategorias();
            return res.render('admin/produtos-form', {
                produto: {},
                categorias,
                erro: null,
                usuarioLogado: req.session.usuario
            });
        } catch (err) {
            console.error('Erro ao abrir cadastro de produto:', err);
            return res.status(500).send('Erro ao abrir formulário de produto.');
        }
    });

    // ==========================================
    // POST - CADASTRAR PRODUTO
    // ==========================================
    router.post('/', exigirLogin, upload.single('imagem'), async (req, res) => {
        const dados = dadosFormulario(req.body);
        const erroValidacao = validarProduto(dados);
        const usuarioId = req.session && req.session.usuario ? req.session.usuario.id : null;
        const imagemNova = req.file ? `/uploads/${req.file.filename}` : null;

        let client;
        try {
            const categorias = await buscarCategorias();

            if (erroValidacao) {
                if (imagemNova) removerArquivoUpload(imagemNova);
                return res.status(400).render('admin/produtos-form', {
                    produto: req.body,
                    categorias,
                    erro: erroValidacao,
                    usuarioLogado: req.session.usuario
                });
            }

            // Confirma se a categoria existe e está ativa
            const categoria = await pool.query(
                `SELECT id FROM categorias WHERE id = $1 AND ativo = true`,
                [dados.categoria_id]
            );

            if (categoria.rows.length === 0) {
                if (imagemNova) removerArquivoUpload(imagemNova);
                return res.status(400).render('admin/produtos-form', {
                    produto: req.body,
                    categorias,
                    erro: 'A categoria selecionada não existe ou está inativa.',
                    usuarioLogado: req.session.usuario
                });
            }

            // Regra de negócio: impedir duplicidade de produto ativo com mesmo nome na mesma categoria
            const duplicado = await pool.query(
                `SELECT id FROM produtos
                 WHERE LOWER(nome) = LOWER($1) AND categorias_id = $2 AND ativo = true
                 LIMIT 1`,
                [dados.nome, dados.categoria_id]
            );

            if (duplicado.rows.length > 0) {
                if (imagemNova) removerArquivoUpload(imagemNova);
                return res.status(409).render('admin/produtos-form', {
                    produto: req.body,
                    categorias,
                    erro: 'Já existe um produto ativo com este nome nesta categoria.',
                    usuarioLogado: req.session.usuario
                });
            }

            client = await pool.connect();
            await client.query('BEGIN');

            const novoProd = await client.query(`
                INSERT INTO produtos (
                    nome,
                    descricao,
                    categorias_id,
                    qnt_estoque,
                    estoque_min,
                    custo,
                    data_cadastro,
                    imagem,
                    ativo
                )
                VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, $7, true)
                RETURNING id
            `, [
                dados.nome,
                dados.descricao,
                dados.categoria_id,
                dados.qnt_estoque,
                dados.estoque_min,
                dados.custo,
                imagemNova
            ]);

            // Auditoria: se entra com estoque inicial > 0, registra movimentação de entrada
            if (dados.qnt_estoque > 0) {
                await client.query(`
                    INSERT INTO movimentacoes (
                        produtos_id,
                        tipo,
                        quantidade,
                        data,
                        estoque_rest,
                        usuarios_id
                    )
                    VALUES ($1, 'entrada', $2, NOW(), $3, $4)
                `, [novoProd.rows[0].id, dados.qnt_estoque, dados.qnt_estoque, usuarioId]);
            }

            await client.query('COMMIT');

            return res.redirect('/admin/produtos?mensagem=' + encodeURIComponent('Produto cadastrado com sucesso!'));

        } catch (err) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            if (imagemNova) removerArquivoUpload(imagemNova);
            console.error('Erro ao cadastrar produto:', err);

            return res.status(500).render('admin/produtos-form', {
                produto: req.body,
                categorias: await buscarCategorias(),
                erro: 'Não foi possível cadastrar o produto: ' + err.message,
                usuarioLogado: req.session.usuario
            });
        } finally {
            if (client) client.release();
        }
    });

    // ==========================================
    // GET - FORMULÁRIO DE EDIÇÃO
    // ==========================================
    router.get('/:id/editar', exigirLogin, async (req, res) => {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.redirect('/admin/produtos');
        }

        try {
            const resultado = await pool.query(`
                SELECT *
                FROM produtos
                WHERE id = $1 AND ativo = true
            `, [id]);

            if (resultado.rows.length === 0) {
                return res.status(404).send('Produto não encontrado.');
            }

            const categorias = await buscarCategorias();
            const registro = resultado.rows[0];

            const produto = {
                ...registro,
                categoria_id: registro.categorias_id
            };

            return res.render('admin/produtos-form', {
                produto,
                categorias,
                erro: null,
                usuarioLogado: req.session.usuario
            });

        } catch (err) {
            console.error('Erro ao carregar produto para edição:', err);
            return res.status(500).send('Erro ao carregar produto.');
        }
    });

    // ==========================================
    // POST - ATUALIZAR PRODUTO
    // ==========================================
    router.post('/:id', exigirLogin, upload.single('imagem'), async (req, res) => {
        const id = Number(req.params.id);
        const dados = dadosFormulario(req.body);
        const usuarioId = req.session && req.session.usuario ? req.session.usuario.id : null;
        const imagemNova = req.file ? `/uploads/${req.file.filename}` : null;

        if (!Number.isInteger(id) || id <= 0) {
            if (imagemNova) removerArquivoUpload(imagemNova);
            return res.redirect('/admin/produtos');
        }

        const erroValidacao = validarProduto(dados);

        let client;
        try {
            const categorias = await buscarCategorias();

            if (erroValidacao) {
                if (imagemNova) removerArquivoUpload(imagemNova);
                return res.status(400).render('admin/produtos-form', {
                    produto: { ...req.body, id },
                    categorias,
                    erro: erroValidacao,
                    usuarioLogado: req.session.usuario
                });
            }

            client = await pool.connect();
            await client.query('BEGIN');

            const atual = await client.query(`
                SELECT *
                FROM produtos
                WHERE id = $1 AND ativo = true
                FOR UPDATE
            `, [id]);

            if (atual.rows.length === 0) {
                await client.query('ROLLBACK');
                if (imagemNova) removerArquivoUpload(imagemNova);
                return res.status(404).send('Produto não encontrado.');
            }

            const categoria = await client.query(`
                SELECT id
                FROM categorias
                WHERE id = $1 AND ativo = true
            `, [dados.categoria_id]);

            if (categoria.rows.length === 0) {
                await client.query('ROLLBACK');
                if (imagemNova) removerArquivoUpload(imagemNova);
                return res.status(400).render('admin/produtos-form', {
                    produto: {
                        ...req.body,
                        id,
                        imagem: atual.rows[0].imagem
                    },
                    categorias,
                    erro: 'A categoria selecionada não existe ou está inativa.',
                    usuarioLogado: req.session.usuario
                });
            }

            // Regra de negócio: impedir duplicidade de nome na mesma categoria ao editar
            const duplicado = await client.query(
                `SELECT id FROM produtos
                 WHERE LOWER(nome) = LOWER($1) AND categorias_id = $2 AND ativo = true AND id <> $3
                 LIMIT 1`,
                [dados.nome, dados.categoria_id, id]
            );

            if (duplicado.rows.length > 0) {
                await client.query('ROLLBACK');
                if (imagemNova) removerArquivoUpload(imagemNova);
                return res.status(409).render('admin/produtos-form', {
                    produto: {
                        ...req.body,
                        id,
                        imagem: atual.rows[0].imagem
                    },
                    categorias,
                    erro: 'Já existe outro produto ativo com este nome nesta categoria.',
                    usuarioLogado: req.session.usuario
                });
            }

            const imagemFinal = imagemNova || atual.rows[0].imagem;

            await client.query(`
                UPDATE produtos
                SET
                    nome = $1,
                    descricao = $2,
                    categorias_id = $3,
                    qnt_estoque = $4,
                    estoque_min = $5,
                    custo = $6,
                    imagem = $7
                WHERE id = $8 AND ativo = true
            `, [
                dados.nome,
                dados.descricao,
                dados.categoria_id,
                dados.qnt_estoque,
                dados.estoque_min,
                dados.custo,
                imagemFinal,
                id
            ]);

            // Auditoria: se houve ajuste manual de estoque na edição, registra movimentação
            const estoqueAnterior = Number(atual.rows[0].qnt_estoque);
            const diferenca = dados.qnt_estoque - estoqueAnterior;

            if (diferenca !== 0) {
                const tipoMov = diferenca > 0 ? 'entrada' : 'saida';
                await client.query(`
                    INSERT INTO movimentacoes (
                        produtos_id,
                        tipo,
                        quantidade,
                        data,
                        estoque_rest,
                        usuarios_id
                    )
                    VALUES ($1, $2, $3, NOW(), $4, $5)
                `, [id, tipoMov, Math.abs(diferenca), dados.qnt_estoque, usuarioId]);
            }

            await client.query('COMMIT');

            // Remove imagem antiga do disco se foi substituída por uma nova
            if (imagemNova && atual.rows[0].imagem && atual.rows[0].imagem !== imagemNova) {
                removerArquivoUpload(atual.rows[0].imagem);
            }

            return res.redirect('/admin/produtos?mensagem=' + encodeURIComponent('Produto atualizado com sucesso!'));

        } catch (err) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            if (imagemNova) removerArquivoUpload(imagemNova);
            console.error('Erro ao atualizar produto:', err);

            return res.status(500).send(
                'Erro ao atualizar produto: ' + err.message
            );
        } finally {
            if (client) client.release();
        }
    });

    // ==========================================
    // POST - EXCLUSÃO LÓGICA DE PRODUTO
    // ==========================================
    router.post('/:id/excluir', exigirLogin, async (req, res) => {
        const id = Number(req.params.id);
        const usuarioId = req.session && req.session.usuario ? req.session.usuario.id : null;

        if (!Number.isInteger(id) || id <= 0) {
            return res.redirect('/admin/produtos');
        }

        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');

            const prod = await client.query(
                `SELECT id, qnt_estoque FROM produtos WHERE id = $1 AND ativo = true FOR UPDATE`,
                [id]
            );

            if (prod.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.redirect('/admin/produtos?erro=' + encodeURIComponent('Produto não encontrado.'));
            }

            const estoqueAtual = Number(prod.rows[0].qnt_estoque);

            // Se o produto possuía saldo em estoque ao ser inativado, zera o saldo e registra saída de baixa
            if (estoqueAtual > 0) {
                await client.query(
                    `INSERT INTO movimentacoes (produtos_id, tipo, quantidade, data, estoque_rest, usuarios_id)
                     VALUES ($1, 'saida', $2, NOW(), 0, $3)`,
                    [id, estoqueAtual, usuarioId]
                );
            }

            await client.query(
                `UPDATE produtos SET ativo = false, qnt_estoque = 0 WHERE id = $1`,
                [id]
            );

            await client.query('COMMIT');

            return res.redirect('/admin/produtos?mensagem=' + encodeURIComponent('Produto excluído com sucesso!'));

        } catch (err) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            console.error('Erro ao excluir produto:', err);
            return res.status(500).send('Erro ao excluir produto: ' + err.message);
        } finally {
            if (client) client.release();
        }
    });

    return router;
};
