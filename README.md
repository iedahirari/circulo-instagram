# Círculo

Um aplicativo local para acompanhar conexões do Instagram. HTML, CSS e JavaScript sem dependências externas. Importa ZIPs de exportações em JSON, compara seguidores, identifica novas conexões e mostra contas que não seguem de volta.

## Abrir

No Windows com Python 3 instalado, abra **Abrir Circulo.cmd**. Ou execute `python server.py`. Acesse sempre `http://127.0.0.1:8765` no mesmo navegador e perfil. Não abra o HTML diretamente: módulos e armazenamento precisam de uma origem estável.

## Usar

1. Exporte seguidores e seguindo do Instagram, em JSON, para todo o período.
2. Importe o ZIP completo. Arquivos HTML e ZIPs divididos não são suportados. Um JSON de seguidores isolado também é aceito, mas pode conter apenas uma parte da lista.
3. Confira manualmente a conta e a data da exportação. O arquivo de seguidores não identifica o dono da conta. Importe todas as partes pelo ZIP.
4. Salve. A primeira consulta é a referência; a próxima é comparada com a data anterior da mesma conta. Consultas fora de ordem são organizadas por data. Há uma consulta por conta por dia, sem substituição silenciosa.
5. Baixe um backup e guarde-o fora do repositório. Restaurar backups mescla consultas, preservando as existentes; conflitos são recusados.

Os dados são guardados no IndexedDB do navegador. Limpar os dados do site, usar outro perfil ou trocar de endereço pode tornar o histórico indisponível. O pedido de armazenamento persistente pode ser recusado pelo navegador. Backup é necessário.

Nenhum arquivo é enviado para a internet. O servidor atende somente arquivos do aplicativo e escuta apenas no computador local. Abrir um link de perfil navega ao Instagram.

## Limites

Ausência na nova exportação não comprova unfollow: mudança de nome, bloqueio ou desativação pode produzir o mesmo resultado. Os arquivos não trazem identificador estável nem selo de verificação. O aplicativo compara nomes de usuário, não se conecta à conta e não monitora automaticamente.

ZIP clássico stored/deflate, até 100 MB, com no máximo 60 MB de JSON relevante descompactado. ZIP64 e exportações em HTML não são suportados. Use Chrome ou Edge atual com suporte a `DecompressionStream('deflate-raw')`.

## Verificar

Com Node.js: `node test.mjs`. Para conferir uma exportação real: `node verify-export.mjs CAMINHO_DO_ZIP`.

Dados pessoais, exportações, backups e capturas de teste não devem ser versionados. A `.gitignore` bloqueia formatos comuns; revise sempre os arquivos antes de enviar.

## Fotos e categorias

Clique nas iniciais de um perfil para escolher uma foto de referência local (JPG, PNG ou WebP até 5 MB e 40 megapixels). A imagem é recortada no centro e salva como uma miniatura JPEG de 128 × 128 pixels; o original não é guardado. Fotos não são buscadas no Instagram e não confirmam identidade ou estado da conta. A opção Remover foto exclui a referência local.

Na aba Não seguem de volta, classifique manualmente os perfis como Pessoal, Artista/figura pública, Marca/organização ou A revisar. O filtro mostra o total de cada categoria. Fotos e categorias pertencem à combinação conta consultada + nome do perfil; persistem entre consultas sem alterar os arquivos originais. Mudanças de nome não transferem a classificação automaticamente.

Fotos e categorias acompanham o backup. Backups antigos sem esse campo continuam aceitos. Na restauração, fotos e categorias já existentes no navegador são preservadas; novos registros são acrescentados. A atualização do banco preserva as consultas antigas. Feche outras abas antigas do Círculo se o navegador informar que a atualização está bloqueada.

## Extensão para capturar fotos visíveis

A pasta `extension` contém uma extensão Chrome/Edge independente que captura fotos de perfis visíveis na página do Instagram. Instalação e uso em [extension/LEIA-ME.md](extension/LEIA-ME.md). A captura não percorre a conta inteira, não usa a exportação do Instagram para buscar imagens e não lê dados de outras extensões.

No aplicativo, selecione a consulta da conta usada na captura e clique em **Importar fotos**. O arquivo `circulo-photos-v1` acrescenta fotos a perfis conhecidos do histórico, preservando categorias e fotos já salvas. Perfis desconhecidos são ignorados com contagem; conta divergente ou arquivo inválido não altera nada. Para atualizar uma foto existente, remova a referência antiga antes de importar. As fotos importadas também entram no backup normal. O aplicativo continua sem fazer requisições ao Instagram; somente a extensão faz downloads das imagens quando acionada.
