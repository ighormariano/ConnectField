// ==========================================
// VERIFICAR AUTENTICAÇÃO
// ==========================================

function exigirLogin(req, res, next) {
    if (req.session && req.session.usuario) {
        res.locals.usuarioLogado = req.session.usuario;
        return next();
    }

    const aceitaJson = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
    if (aceitaJson) {
        return res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
    }

    return res.redirect('/login');
}

module.exports = exigirLogin;
