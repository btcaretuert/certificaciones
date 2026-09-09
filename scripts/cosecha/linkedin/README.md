# Pasadas de red

Estos scripts se conectan por CDP a un Chrome que **el dueño ya abrió y autenticó**,
con `--remote-debugging-port=9333`. No leen almacenes de cookies, no manejan
credenciales y no inician sesión: conducen el navegador que ya está abierto.

Nada aquí marca «Create certificate link» ni pulsa «Post». Descargar un
certificado deja `publicShareEnabled` intacto — comprobado antes y después sobre
un certificado de control, con la URL pública devolviendo 404 en ambos momentos.
Publicar es una acción distinta y explícita que ningún script realiza.

## Orden

```bash
node scripts/cosecha/linkedin/expand-history.mjs        # carga las 220 tarjetas
node scripts/cosecha/linkedin/read-history-dom.mjs      # -> cards_dom.json
node scripts/cosecha/linkedin/harvest-courses.mjs       # -> harvest_courses.jsonl
node scripts/cosecha/linkedin/harvest-paths.mjs         # -> harvest_paths.jsonl
node scripts/cosecha/linkedin/resolve-skills-authors.mjs
node scripts/cosecha/linkedin/download-certificates.mjs 0 220
npm run map                                     # consolida todo
```

`download-certificates.mjs` es reanudable: relee `download_log.jsonl` y salta lo
hecho. Recarga y reexpande la página cada 28 tarjetas porque la lista deja de
renderizar sus menús tras unos 30-40 ciclos de modal, y entonces las descargas
fallan en silencio.
