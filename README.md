# egon-mcp

An MCP server for [Egon.io](https://egon.io), the collaborative domain storytelling tool.

## Layout

```
egon-mcp/
├── egon_mcp/          # The MCP server (our code)
└── modules/
    └── egon.io/       # Git submodule: reference copy of Egon.io (fork of WPS/egon.io)
```

`modules/egon.io` is read-only reference material. It is pinned to a specific commit; changes there belong in the fork, not in this repo.

## Cloning

```bash
git clone --recurse-submodules <this-repo-url>
```

If you already cloned without submodules:

```bash
git submodule update --init
```

## Working with the egon.io submodule

The submodule has two remotes:

- `origin`: the fork, https://github.com/dervism/egon.io
- `upstream`: the original, https://github.com/WPS/egon.io

Remotes are local git config and are not cloned. After a fresh clone, add `upstream` again:

```bash
git -C modules/egon.io remote add upstream https://github.com/WPS/egon.io.git
```

Move the pinned commit to the latest `main` of the fork:

```bash
git submodule update --remote modules/egon.io
git add modules/egon.io
git commit -m "Bump egon.io reference"
```

Sync the fork with the original project:

```bash
cd modules/egon.io
git fetch upstream
git merge upstream/main
git push origin main
```
