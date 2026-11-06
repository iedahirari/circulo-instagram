# Círculo

## Coleta pela sessão aberta (experimental)

O aplicativo também importa o JSON `circulo-session-v1` gerado por `session-collector.js`, executado manualmente na própria aba conectada do Instagram. A opção **Coletar pela sessão aberta** oferece o arquivo e o [guia de uso](COLETA-NAVEGADOR.md). Sem extensão, dependências novas ou login pela biblioteca Android.

As duas listas precisam terminar e corresponder aos totais antes/depois da leitura. Erros, cursores repetidos e resultados parciais não geram consulta. A importação salva consulta e metadados numa única transação e preserva fotos/categorias anteriores. Nomes completos e selos coletados aparecem no perfil; os IDs são guardados, mas a comparação continua por nome de usuário. Links temporários das fotos ficam no JSON, sem download automático de imagens. O coletor usa recursos internos do Instagram e pode ser recusado ou limitado.

Referências e limites constam no guia. Testes adicionais: `node test_session.cjs` e `node test_session_import.mjs`. São testes simulados, sem acesso ao Instagram.

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

## Análises e listas

- **Renomeados:** quando a consulta traz identificadores numéricos (coleta pela sessão, ou perfis já coletados antes), uma troca de nome não aparece como saída nem entrada, e sim na aba **Renomeados**. A exportação oficial não traz IDs, então não detecta renomeações sozinha.
- **Situação:** saídas indicam **voltou depois** quando o perfil reaparece em consulta posterior; entradas indicam **voltou a seguir** quando já apareceram em consulta anterior. Usa apenas o histórico salvo.
- **Ignorados:** botão **Ignorar** na aba Não seguem de volta. Ficam ocultos até marcar **Mostrar perfis ignorados**. A marcação fica no navegador e no backup, mas não acompanha mudança de nome.
- **Ordenar e paginar:** escolha A–Z, Z–A ou categoria, e quantos perfis mostrar por página (10, 50, 100 ou todos).
- **Exportar CSV:** exporta a lista visível, com as mesmas busca, filtros e ordenação. O separador é `;`, para abrir direto no Excel em português. Células que começam com `=`, `+`, `-` ou `@` são gravadas como texto, para evitar fórmulas.

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

A extensão 0.2 acumula capturas no armazenamento local por conta e permite continuar após fechar a janela. No aplicativo, o indicador de cobertura e o filtro **Somente sem foto** ajudam a localizar os perfis restantes. O progresso da extensão se refere à parte visível reconhecida, não à lista inteira do Instagram.

## Coletor local gratuito (sem extensão)

Requer Python 3 e Google Chrome. Abra **Abrir Coletor.cmd**: a primeira abertura prepara o Playwright em um ambiente separado em `%LOCALAPPDATA%\Circulo\python`. Não exige serviço pago ou chave de API.

1. No Círculo, escolha a lista, busca e categoria desejadas e clique em **Preparar coleta local**. A fila inclui somente os perfis sem foto, até 1.000 por arquivo; identificadores de contas excluídas da exportação são ignorados.
2. Abra **Abrir Coletor.cmd** e escolha o arquivo `fila-…json` baixado.
3. Entre no Instagram no navegador separado que abrir. Depois clique em **Iniciar coleta** na janela do coletor.
4. O programa visita até 10 perfis por execução. As fotos concluídas são salvas imediatamente; execute novamente para retomar, sem repetir as já guardadas.
5. Clique em **Abrir pasta dos resultados** e importe o arquivo `coleta-CONTA.json` no botão **Importar fotos** do Círculo.

Para escolher outro tamanho de lote, execute o coletor com `--limit 1` a `--limit 50` (padrão: 10). O argumento `--input CAMINHO` permite selecionar uma fila diretamente.

Os resultados e o perfil de navegador ficam em `%LOCALAPPDATA%\Circulo\coletor`, fora deste repositório e fora da pasta OneDrive do projeto. O perfil guarda a sessão do Instagram, como um navegador normal; não compartilhe essa pasta. Nenhuma senha é solicitada pelo aplicativo. Feche a coleta anterior antes de abrir outra. A sessão pode expirar e exigir novo login.

O coletor lê páginas de perfil, baixa apenas imagens dos domínios de mídia conhecidos e gera miniaturas JPEG de 128 × 128. Não usa APIs internas, proxies, solução de CAPTCHA ou técnicas de evasão. Para diante de verificações, limites, falhas consecutivas ou quando você escolhe **Parar e salvar**. Uma foto não encontrada é inconclusiva: nunca vira automaticamente “desativada”. O layout pode exigir ajustes quando o Instagram mudar. O total por arquivo de resultados é de até 1.000 fotos / 11,5 MB; importe e arquive o arquivo antes de iniciar outro lote de resultados da mesma conta.

Verificações do coletor: com o Python do ambiente local, execute `python -m unittest test_coletor -v`. Os testes de navegador usam páginas simuladas em Chrome local e não acessam contas do Instagram.

## Teste autenticado do instagrapi

Abra **Testar login Instagram.cmd**. A dependência `instagrapi==3.2.3` é instalada no ambiente local do Círculo se necessário. O programa abre uma página local na porta 8767, exclusiva para um teste com o perfil `adele`. O serviço escuta somente `127.0.0.1`; não publique esse serviço nem a página de autenticação em hospedagem pública.

Digite as credenciais somente nessa página. A senha é encaminhada ao Instagram pelo instagrapi e não é gravada em arquivos ou logs. Se o Instagram pedir autenticação de dois fatores, o formulário local recebe o código. Verificações adicionais interrompem o teste para serem feitas no aplicativo oficial; não são resolvidas automaticamente. Nenhuma sessão do Chrome é extraída.

**Guardar sessão protegida neste Windows** é opcional e começa desmarcado. Quando marcado, campos de sessão são criptografados via DPAPI para o usuário atual do Windows e guardados em `%LOCALAPPDATA%\Circulo\instagrapi\sessao-USUARIO.bin`, fora do OneDrive e do Git. A senha não é incluída nesses campos. A opção desmarcada não carrega nem regrava sessões antigas. Não compartilhe essa pasta; a sessão equivale a acesso autenticado.

A API local exige um token aleatório por execução, confere Host e Origin, limita o corpo dos pedidos e não registra URLs, corpos, respostas ou credenciais. A página aplica política de conteúdo restrita e não permite ser embutida em outros sites. O resultado exibido não inclui cookies ou tokens. Encerre o programa local após o teste.

Verificações: no ambiente com instagrapi instalado, execute `python -m unittest test_login_local -v`. Os testes usam credenciais fictícias e cliente simulado; não fazem login em uma conta real.

Se uma tentativa falhar, a página mostra **Referência do erro** com apenas o nome da exceção e, quando disponível, o código HTTP. O diagnóstico não inclui a mensagem bruta do SDK, senha, código, cookies ou resposta do Instagram. Erros de conexão são diferenciados de credenciais não aceitas. Nenhuma tentativa é repetida automaticamente pelo aplicativo.
