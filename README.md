# 🔑 Sang Hub — ScriptLoader

Userscript para Tampermonkey que centraliza e carrega dinamicamente outros scripts (módulos) no Habblive/Habblet, sem precisar instalar cada um separadamente no Tampermonkey. Você instala só o Hub; ele lê uma lista remota (`manifest.json`) e injeta os módulos sob demanda, com um painel visual pra ativar/desativar cada um.

**Versão atual:** `2.1.3`

---

## Instalação

1. Instale o [Tampermonkey](https://www.tampermonkey.net/) no navegador.
2. Crie um novo script no Tampermonkey e cole o conteúdo de [`hub.js`](./hub.js) — ou aponte `@updateURL`/`@downloadURL` pro raw do seu repositório, se for usar via GitHub.
3. Garanta que o `manifest.json` esteja publicado num link raw acessível (ex: `raw.githubusercontent.com/.../manifest.json`) e que a constante `MANIFEST_URL` no topo do `hub.js` aponte pra ele.
4. Acesse `habblive.in/bigclient` ou `habblet.city/bigclient` — o painel do Hub deve aparecer no canto inferior esquerdo.

---

## Como funciona

- Ao carregar, o Hub monta seu painel **antes** de buscar qualquer coisa na rede — então o painel e o atalho de teclado sempre existem, mesmo se o manifesto demorar ou falhar.
- Ele busca o `manifest.json`, lista os módulos disponíveis e mostra o estado de cada um (`clique p/ abrir`, `carregando`, `ativo`, `erro · retry`).
- **Nenhum módulo carrega sozinho.** Mesmo que o manifesto marque um módulo como `autoload: true`, o Hub ignora isso por padrão — tudo depende de você clicar no card do módulo dentro do painel. Isso evita que um módulo suba antes do Hub existir e acabe interferindo em cliques ou elementos do próprio Hub.
- Clicar num módulo `ativo` desativa ele (chamando o `kill()` exposto pelo módulo, via `instanceKey`). Se o módulo não expuser um jeito de desligar, o Hub avisa que é preciso recarregar a página.

---

## O painel

| Elemento | Ação |
|---|---|
| **↻** (canto superior) | Recarrega o manifesto agora, ignorando o cache de 5 min |
| **–** | Minimiza o painel numa pílula flutuante (`🔑 HUB`) |
| **✕** | Esconde painel e pílula. **Não destrói nada** — reabre normalmente com o atalho |
| **Bolinha de sync** | Cinza/pulsando = sincronizando · verde = sincronizado · vermelho = falha (com botão de retry) |
| Arrastar o cabeçalho | Move o painel pra qualquer posição da tela |
| Arrastar a pílula | Move a pílula; um clique curto (sem arrastar) reabre o painel |

**Atalho de teclado:** `Alt+Shift+H` — alterna entre painel aberto e escondido (funciona mesmo depois de fechar com o ✕ ou minimizar).

---

## `manifest.json`

```json
{
  "version": "2.0.0",
  "modules": [
    {
      "id": "liveblock",
      "name": "LiveBlock",
      "description": "Bloqueador de anúncios + anti-detecção",
      "icon": "🛡️",
      "enabled": true,
      "autoload": true,
      "instanceKey": "_lb",
      "url": "https://raw.githubusercontent.com/zBeyond5/Liveblock/refs/heads/main/adblock.js"
    }
  ]
}
```

| Campo | Obrigatório | Descrição |
|---|---|---|
| `id` | sim | Identificador único do módulo |
| `name` | sim | Nome exibido no card |
| `description` | não | Texto exibido abaixo do nome. Cuidado com palavras como *bloqueador*/*adblock* se o próprio módulo faz varredura de texto na página — veja a nota de proteção abaixo |
| `icon` | não | Emoji exibido no card (padrão: 📦) |
| `enabled` | não | `false` esconde o módulo da lista inteiramente (padrão: `true`) |
| `autoload` | não | Ignorado pelo Hub por padrão (ver `AUTOLOAD_ENABLED` abaixo) |
| `instanceKey` | não | Nome da variável global (`window[instanceKey]`) que o módulo expõe com um método `.kill()`, usado pra desativar |
| `url` | sim | Raw do script do módulo |

O manifesto é cacheado no `localStorage` por 5 minutos (`sanghub_manifest_cache`) pra evitar buscas repetidas a cada reload de página. O botão **↻** ou uma chamada manual de `refreshManifest(true)` ignora esse cache.

---

## Escrevendo um módulo compatível

Qualquer script pode ser um módulo — o Hub só injeta o código bruto via `<script>`. Boas práticas:

- Se o módulo cria elementos fixos na tela (painel, overlay, etc.), exponha `window[instanceKey] = { kill() { ...remove tudo... } }` pra permitir desativação pelo Hub sem precisar recarregar a página.
- **Se o módulo faz varredura/remoção de elementos da página** (ex: bloqueadores de anúncio que removem overlays "desative seu adblock"), marque explicitamente os elementos do Hub como protegidos antes de rodar qualquer heurística de remoção. O Hub já marca todos os seus elementos com `data-hub="1"` e IDs começando em `_hub`, exatamente pra isso:

```js
function isElementProtected(el) {
    let current = el;
    while (current && current !== document.body) {
        if (current.id && current.id.startsWith('_hub')) return true;
        if (current.dataset && current.dataset.hub) return true;
        // ...suas outras regras de proteção
        current = current.parentElement;
    }
    return false;
}
```

Isso evita o cenário que já aconteceu aqui: um módulo de adblock cuja própria `description` continha a palavra "bloqueador" acabou batendo na heurística de texto dele mesmo e removendo o painel do Hub inteiro.

---

## Configurações internas (topo do `hub.js`)

```js
const HUB_VERSION = "2.1.3";
const MANIFEST_URL = "...";              // raw do manifest.json
const MANIFEST_CACHE_MS = 5 * 60 * 1000; // 5 min de cache local
const MANIFEST_FETCH_RETRIES = 2;        // tentativas extras se a busca falhar
const MANIFEST_FETCH_TIMEOUT_MS = 8000;  // timeout por tentativa
const AUTOLOAD_ENABLED = false;          // true = volta a respeitar "autoload" do manifesto
const SHORTCUT_KEY = 'h';                // tecla do atalho (com Alt+Shift)
```

---

## Atualizando o script

O Tampermonkey **não** recarrega o script a cada vez que a página abre — ele checa `@updateURL` só no intervalo configurado em *Dashboard → Settings → Update*, ou quando forçado manualmente.

Depois de dar push numa mudança no `hub.js` ou em algum módulo:

1. Dashboard do Tampermonkey → aba **Utilities** → **"Check for userscript updates"**.
2. Se a versão ainda não bateu, pode ser cache do CDN do `raw.githubusercontent.com` — espere alguns minutos ou force um hard refresh (`Ctrl+Shift+R`) na aba do jogo.
3. Confira a versão carregada pelo primeiro log no console: `🟠 [Hub] Iniciando Sang Hub v2.1.3 em ...`.

Para evitar esse atraso de cache em releases futuras, considere servir os arquivos via jsDelivr com tag de versão fixa (`cdn.jsdelivr.net/gh/usuario/repo@vX.Y.Z/hub.js`) em vez do raw do GitHub — cada versão nova vira uma URL nova, sem depender de invalidação de cache.

---

## Debug

Todo log do Hub sai prefixado com `🟠 [Hub]` no console. Se o painel não abrir:

- Confirme que aparece a linha `Iniciando Sang Hub v...` no console — se não aparecer, o script nem está rodando (checar `@match` e se está ativo no Tampermonkey).
- Se aparecer mas parar aí, veja se logo depois surge `🔻 página descartada/recarregada` — indício de que algo (outro módulo, anti-adblock do jogo) forçou um reload da página no meio do boot.
- `Alt+Shift+H` sempre deve alternar painel/escondido, mesmo com o manifesto falhando — se nem isso funcionar, algum outro script pode estar interceptando cliques/teclas em fase de captura na `document`.
