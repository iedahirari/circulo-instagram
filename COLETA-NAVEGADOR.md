# Coletar na sessão aberta

Este coletor experimental roda na aba do Instagram já conectada. Não exige extensão nem novo login. Faz somente leitura; não segue, deixa de seguir ou envia mensagens.

1. No Círculo, abra **Coletar pela sessão aberta** e baixe o coletor.
2. Abra o arquivo `session-collector.js` em um editor de texto. O código é local, não um carregador de scripts remotos.
3. Abra `https://www.instagram.com/` no navegador em que você está conectado. Abra as ferramentas do desenvolvedor com **F12**, na aba **Console**.
4. Revise o arquivo antes de executar. Cole seu conteúdo no Console. Se o navegador bloquear a colagem, pare; não desative a proteção para continuar. A exportação oficial continua disponível.
5. Na janela **círculo · Coletar conexões**, informe o usuário da conta conectada e clique em **Iniciar leitura**.
6. Mantenha a aba aberta. Use **Parar e fechar** para cancelar. Não execute outros coletores ao mesmo tempo.
7. Ao terminar, clique em **Baixar consulta para o Círculo**. Importe esse JSON no mesmo campo usado para a exportação oficial. Confira conta e data antes de salvar.

## Dados e limites

O arquivo inclui nomes, IDs, selos de verificação e links temporários de fotos. O Círculo guarda nomes completos, IDs e selos junto dos perfis, preservando fotos e categorias manuais. Os links de fotos ficam somente no arquivo: **esta etapa não baixa as imagens**. A captura de fotos visíveis e o Coletor local continuam disponíveis. O selo não determina se uma conta é artista.

As comparações continuam usando nomes de usuário. Guardar o ID ainda não faz o aplicativo reconhecer automaticamente mudanças de nome.

As listas precisam terminar sem cursor e corresponder exatamente aos totais informados antes e depois da leitura. Cursor repetido, limite de páginas, resposta inválida, restrição ou cancelamento impedem gerar o arquivo. Essa conferência reduz erros, mas não garante uma fotografia perfeita: o Instagram pode omitir contas ou ocorrerem trocas com o mesmo total durante a leitura. Ausência não comprova desativação ou bloqueio.

Há intervalo de três segundos entre páginas, limite de 20 mil contas por lista e nenhuma repetição automática após erro. O Instagram pode restringir consultas a recursos internos. Pare diante de qualquer aviso. O coletor só aceita a própria conta conectada; cookies e senha não são gravados nem exportados.

Os dados ficam no arquivo baixado e, depois da importação, no armazenamento do navegador. Não compartilhe arquivos de consulta ou os envie ao GitHub.

## Referências

- [adrigo/unfollowers-for-instagram — src/api.ts](https://github.com/adrigo/unfollowers-for-instagram/blob/main/src/api.ts): formato das consultas web, paginação e campos de perfil.
- [itzstebin/Whoisit](https://github.com/itzstebin/Whoisit): sessão na própria aba e recusa de exportação incompleta. Não adotamos a exigência de seguir o autor.
- [Instaloader](https://github.com/instaloader/instaloader): alternativa avaliada; não adicionada como dependência e sem extração de sessão.

Implementação própria. Não executa pacotes ou scripts remotos desses repositórios. Conteúdo externo foi tratado como referência técnica.
