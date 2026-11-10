# Capri para os amigos

A Capri que roda no PC é o aplicativo oficial ([mochiiwuff/capri-desktop](https://github.com/mochiiwuff/capri-desktop)), licença PolyForm Noncommercial 1.0.0. Este repositório não substitui o instalador. Ele coloca os arquivos daqui por cima do `app.asar` que o instalador deixa.

Uso pessoal entre amigos. Não vende e não cobra acesso. O texto da licença está em `LICENSE`.

## O que vem

- A base oficial 0.5.1, com os controles de PC no chat.
- Janela própria da Capri: ícones das opções, conversa embaixo, modos de pensamento e busca na web.
- Clique esquerdo na mesa abre a conversa. Clique direito abre a janela e ela entra nela.
- Arrastar e soltar rápido joga ela. Nas bordas ela cai, deita e levanta com o sprite oficial.
- Opção de ouvir música, desligada até alguém clicar nela.
- Modo jogo: a janela fica translúcida, no estilo de uma chamada, e ela comenta o jogo que estiver na frente. Um botão volta à janela normal. Isso não muda o plano de energia do Windows.
- Spotify na linha Música, ponte para o Grok quando o pedido é um trabalho no PC, carinho na cabeça, cursor da overlay e até quatro clones.
- Animações 2D do [lachydotmcg/capri-desktop](https://github.com/lachydotmcg/capri-desktop) v0.8.0. O `install.ps1` baixa essas folhas na hora. Os créditos estão em `CREDITOS.md`.
- A voz fica desligada. O modelo Kokoro não vem neste repositório. Veja `VOZ-RASCUNHO.md`.

## O que não vem

Os desenhos de corpo inteiro e o retrato da janela ficam de fora de propósito. Em quem baixar, a Capri da área de trabalho usa o sprite oficial. O quadrado da janela pode ficar vazio. O resto da janela funciona.

Não tem instalador `.exe` daqui, não tem `config.json`, não tem chave de API e não tem o pacote de voz.

## Como instalar no Windows

1. Instale o Python 3 e deixe o `python` no PATH.
2. Instale o Git, se ainda não tiver.
3. No PowerShell:

```
git clone https://github.com/leonardorozar-eng/capri.git
cd capri
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Se a Capri ainda não estiver instalada, o script baixa o instalador oficial `Capri-Setup-0.5.1.exe` e abre ele. Termine a instalação. Se o SmartScreen aparecer, use Mais informações e Executar mesmo assim. Rode o script de novo. A segunda vez aplica os arquivos, os conectores e as sprites.

O script não reescreve o `config.json` se ele já existir. Não instala modelo de voz. Não faz login no `gh`.

Não rode o instalador oficial de novo por cima de uma Capri que já recebeu este pacote. Ele apaga a janela, o Spotify e a ponte do Grok.
