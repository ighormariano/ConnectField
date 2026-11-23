-- Script de criação do banco de dados ConnectField
-- Baseado no diagrama ER e nas regras de negócio do sistema

CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    senha VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    ativo BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS categorias (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL UNIQUE,
    descricao TEXT NULL,
    ativo BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS produtos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    descricao TEXT NULL,
    qnt_estoque INT NOT NULL DEFAULT 0 CHECK (qnt_estoque >= 0),
    estoque_min INT NOT NULL DEFAULT 0 CHECK (estoque_min >= 0),
    custo DECIMAL(10, 2) NOT NULL DEFAULT 0.00 CHECK (custo >= 0),
    data_cadastro DATE NOT NULL DEFAULT CURRENT_DATE,
    imagem VARCHAR(255) NULL,
    categorias_id INT NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT fk_produtos_categorias
        FOREIGN KEY (categorias_id) REFERENCES categorias (id)
);

CREATE TABLE IF NOT EXISTS movimentacoes (
    id SERIAL PRIMARY KEY,
    produtos_id INT NOT NULL,
    quantidade INT NOT NULL CHECK (quantidade > 0),
    data TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estoque_rest AINT NOT NULL DEFAULT 0 CHECK (estoque_rest >= 0),
    tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada', 'saida')),
    usuarios_id INT NULL,
    CONSTRAINT fk_movimentacoes_produtos
        FOREIGN KEY (produtos_id) REFERENCES produtos (id),
    CONSTRAINT fk_movimentacoes_usuarios
        FOREIGN KEY (usuarios_id) REFERENCES usuarios (id)
);

CREATE INDEX IF NOT EXISTS idx_produtos_categorias ON produtos (categorias_id);
CREATE INDEX IF NOT EXISTS idx_produtos_ativo ON produtos (ativo);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_produtos ON movimentacoes (produtos_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_data ON movimentacoes (data DESC);

-- Usuário administrador inicial (E-mail: admin@connectfield.com | Senha: admin123)
INSERT INTO usuarios (nome, email, senha, ativo)
VALUES (
    'Administrador',
    'admin@connectfield.com',
    '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.K8E/0y1zQ5O.wG5p3C8Q8y/0y1zQ',
    true
)
ON CONFLICT (email) DO NOTHING;
