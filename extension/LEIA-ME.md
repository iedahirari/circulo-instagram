# Círculo · Fotos visíveis

Extensão auxiliar independente, sem vínculo com invertexto ou Meta. Não é a extensão Não Seguidores e não lê os dados privados dela.

## Instalar localmente

1. Abra `chrome://extensions` no Chrome ou `edge://extensions` no Edge.
2. Ative **Modo do desenvolvedor**.
3. Escolha **Carregar sem compactação** e selecione esta pasta `extension` (a que contém `manifest.json`). Se recebeu um ZIP, extraia primeiro.
4. Fixe **Círculo · Fotos visíveis** na barra do navegador.

## Capturar

1. No navegador, entre no Instagram e abra sua lista de seguidores ou seguindo. As fotos precisam estar visíveis e carregadas.
2. Clique no Círculo, informe a conta usada nas consultas do aplicativo e escolha **Capturar fotos visíveis**.
3. Mantenha a janela aberta. Baixe o arquivo quando terminar.
4. No aplicativo Círculo, selecione uma consulta dessa mesma conta e use **Importar fotos**.
5. Role a lista e repita para novos perfis. O aplicativo mantém as fotos já guardadas.

## Permissões e limites

`activeTab` e `scripting` permitem ler as imagens e seus próprios links de perfil na aba ativa quando você aciona a extensão. As permissões de `cdninstagram.com` e `fbcdn.net` permitem baixar as fotos exibidas desses domínios. A extensão não recebe nem armazena senha, não consulta cookies, não acessa APIs internas e não segue/deixa de seguir perfis. Ela faz requisições de imagem para os servidores do Instagram/Meta, sem credenciais; não envia as fotos para outro servidor.

São no máximo 100 perfis visíveis por captura. Só aceita imagens associadas diretamente a um link de perfil; fotos sem esse vínculo, listas em iframes, shadow DOM fechado e alguns layouts não são reconhecidos. Não faz rolagem automática. Imagens podem expirar ou falhar. Mudanças no Instagram podem exigir ajustes. Uma foto salva é uma referência do momento, não uma prova de atividade da conta.

Instalação e captura no Instagram real precisam ser verificadas no navegador do usuário. Esta pasta não está publicada na Chrome Web Store.
