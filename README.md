# TP noté 1 — Suivi de commandes (SSE)

Dépôt : https://github.com/ysh4me/tp_1_wtr

## Lancement

```bash
docker compose up --build -d
```

Puis http://localhost:3000

## API

| Route | Rôle | Codes |
|---|---|---|
| `GET /users` | liste des clients | 200 |
| `GET /products` | liste des produits | 200 |
| `GET /orders` | liste des commandes | 200 |
| `GET /orders/:id` | une commande | 200, 404 |
| `POST /orders` | créer une commande `{ userId, productId, quantity }` | 201, 400 body invalide, 404 client ou produit introuvable, 409 stock insuffisant |
| `PATCH /orders/:id` | changer le statut `{ status }` | 200, 400 statut invalide, 404, 409 transition interdite |

Statuts : `preparing` → `shipped` → `delivered`. Annulation (`cancelled`) possible seulement en `preparing`. Livraison automatique 20 s après `shipped`.

## SSE

- `GET /stream` : tous les événements
- `GET /orders/:id/stream` : seulement ceux de la commande

Événements : `order-created`, `order-status`, `order-cancelled`, `stock-updated`.

Page de suivi : http://localhost:3000/suivi.html?id=1

## Exigences

- Faites : F1 à F10
- Non faites : B1, B2, B3, B4
