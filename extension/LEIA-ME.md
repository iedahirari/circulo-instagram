# Círculo · Fotos visíveis

## Versão 0.3 — Coletar conexões e fotos

Se já instalou a extensão, atualize os arquivos desta pasta e clique em **Recarregar** no cartão da extensão em `chrome://extensions`. Ela passa a se chamar **Círculo · Conexões e fotos**, sem permissões adicionais.

1. Abra o Instagram conectado. Não precisa abrir a lista nem rolar a página.
2. Clique na extensão e escolha **Coletar conexões e fotos**.
3. Na aba que abrir, clique em **Iniciar coleta**. Sua conta é identificada automaticamente.
4. Mantenha essa aba e a do Instagram abertas. O painel mostra a leitura das listas e a busca das fotos.
5. Clique em **Baixar para o Círculo** e importe o arquivo em **Escolher arquivo do Instagram** no aplicativo. As listas, nomes, selos e fotos são importados juntos.

**Parar e guardar progresso** preserva cada foto já salva. Depois de concluídas as listas, **Continuar fotos restantes** retoma as imagens que faltam, inclusive após fechar e reabrir a aba. Uma coleta interrompida durante as listas não substitui a última consulta completa. A última consulta completa por conta fica no IndexedDB da extensão; o histórico continua sendo mantido pelo aplicativo Círculo.

O arquivo pode ser importado novamente para acrescentar fotos à consulta do mesmo dia se as listas forem idênticas. Consultas conflitantes da mesma conta/data são recusadas. Fotos e categorias existentes no aplicativo são preservadas.

As fotos da captura visível anterior são aproveitadas quando os nomes correspondem. O modo antigo continua em **Capturar só as fotos visíveis**. Ele mantém seu limite de 1.000 fotos/8 MB; a coleta nova usa IndexedDB, sujeito ao espaço disponível do navegador. Limpar dados ou desinstalar remove os dados da extensão; baixe e importe para manter sua cópia.

### Limites da coleta integrada

A versão nova consulta recursos internos do Instagram na própria aba usando a sessão conectada, sem exportar cookies ou senha. Só consulta a própria conta; confere a sessão a cada resposta, exige as duas listas completas e compara os totais antes/depois. Há limite de 20 mil perfis por lista, três segundos entre páginas e nenhum reenvio automático após erro/restrição. Fechar ou navegar a aba do Instagram pode interromper a leitura.

As imagens são baixadas sem credenciais, exclusivamente dos domínios de mídia Meta/Instagram, e convertidas em JPEG de 128 × 128. Falhas consecutivas nas imagens interrompem essa etapa mantendo as listas completas. Ausência de foto não comprova desativação ou bloqueio. Links podem expirar; nesse caso uma nova coleta pode ser necessária. Não há garantia de sucesso nem de que todos os perfis serão disponibilizados pelo Instagram.

Para manter a importação abaixo do limite de tamanho, cada arquivo inclui até 30 MB de fotos únicas; fotos excedentes continuam na extensão, sem serem incluídas nessa exportação. O aplicativo só recebe as miniaturas embutidas, nunca busca os links das fotos por conta própria.

Referência técnica: [InstagramUnfollowers, David Arroyo](https://github.com/davidarroyo1234/InstagramUnfollowers). Implementação própria; sem código remoto nem funções de seguir/deixar de seguir. Testes: `node extension/live.test.mjs`.

## Modo anterior — Fotos visíveis

Extensão auxiliar independente, sem vínculo com invertexto ou Meta. Não é a extensão Não Seguidores e não lê os dados privados dela.

## Instalar localmente

1. Abra `chrome://extensions` no Chrome ou `edge://extensions` no Edge.
2. Ative **Modo do desenvolvedor**.
3. Escolha **Carregar sem compactação** e selecione esta pasta `extension` (a que contém `manifest.json`). Se recebeu um ZIP, extraia primeiro.
4. Fixe **Círculo · Fotos visíveis** na barra do navegador.

## Capturar

1. No navegador, entre no Instagram e abra sua lista de seguidores ou seguindo. As fotos precisam estar visíveis e carregadas.
2. Clique no Círculo, informe a conta usada nas consultas do aplicativo e escolha **Capturar fotos visíveis**.
3. Cada foto concluída fica guardada imediatamente no navegador. Se fechar a janela, reabra na mesma conta e capture novamente para continuar; as fotos já salvas são ignoradas. Baixe todas as fotos acumuladas quando quiser.
4. No aplicativo Círculo, selecione uma consulta dessa mesma conta e use **Importar fotos**.
5. Role a lista e repita para novos perfis. O aplicativo mantém as fotos já guardadas.

## Permissões e limites

`storage` guarda as miniaturas no armazenamento local da extensão. `activeTab` e `scripting` permitem ler as imagens e seus próprios links de perfil na aba ativa quando você aciona a extensão. As permissões de `cdninstagram.com` e `fbcdn.net` permitem baixar as fotos exibidas desses domínios. A extensão não recebe nem armazena senha, não consulta cookies, não acessa APIs internas e não segue/deixa de seguir perfis. Ela faz requisições de imagem para os servidores do Instagram/Meta, sem credenciais; não envia as fotos para outro servidor.

São no máximo 100 perfis visíveis por captura. Só aceita imagens associadas diretamente a um link de perfil; fotos sem esse vínculo, listas em iframes, shadow DOM fechado e alguns layouts não são reconhecidos. Não faz rolagem automática. Imagens podem expirar ou falhar. Mudanças no Instagram podem exigir ajustes. Uma foto salva é uma referência do momento, não uma prova de atividade da conta.

Instalação e captura no Instagram real precisam ser verificadas no navegador do usuário. Esta pasta não está publicada na Chrome Web Store.

## Captura acumulada (versão 0.2)

O painel mostra o total guardado na conta e quantos perfis reconhecidos na última parte visível ainda não têm foto. Esse número não representa toda a lista do Instagram. Role manualmente e capture de novo; a extensão acrescenta apenas perfis novos, sem duplicatas.

As fotos guardadas persistem ao fechar e reabrir o Chrome no mesmo perfil. Desinstalar a extensão ou limpar seu armazenamento remove as capturas. Baixe o arquivo e importe no Círculo para manter uma cópia independente. Há limite de 1.000 fotos por conta e orçamento de 8 MB no total; se atingir o limite, baixe e importe antes de limpar. Fotos com falha podem ser tentadas novamente; não são contadas como salvas.

A limpeza exige um segundo clique de confirmação, afeta somente a conta informada e não altera fotos já importadas no Círculo. Para mais de 1.000 perfis, trabalhe em lotes: baixe, importe, limpe as capturas da conta na extensão e continue a partir da parte seguinte da lista.

No Círculo, “Fotos: X de Y” mostra a cobertura da lista selecionada, respeitando busca e categoria. Ative “Somente sem foto” para encontrar os perfis que ainda faltam.
