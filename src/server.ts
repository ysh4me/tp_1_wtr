import express from "express";
import cors from "cors";
import { db, getOrders, getProducts, getUsers } from "./db.ts";
import type { Order, Status } from "./types.ts";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

type OrderBody = Pick<Order, "userId" | "productId" | "quantity">;

const STATUSES: Status[] = ["preparing", "shipped", "delivered", "cancelled"];

const NEXT_STATUS: Record<Status, Status | null> = {
  preparing: "shipped",
  shipped: "delivered",
  delivered: null,
  cancelled: null,
};

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isValidOrderBody(body: unknown): body is OrderBody {
  if (typeof body !== "object" || body === null) return false;
  const { userId, productId, quantity } = body as Record<string, unknown>;
  return isPositiveInteger(userId) && isPositiveInteger(productId) && isPositiveInteger(quantity);
}

function getStatus(body: unknown): Status | null {
  if (typeof body !== "object" || body === null) return null;
  const { status } = body as Record<string, unknown>;
  return STATUSES.find((s) => s === status) ?? null;
}

app.get("/users", async (_req, res) => {
  res.status(200).json(await getUsers());
});

app.get("/products", async (_req, res) => {
  res.status(200).json(await getProducts());
});

app.get("/orders", async (_req, res) => {
  res.status(200).json(await getOrders());
});

app.get("/orders/:id", async (req, res) => {
  const id = Number(req.params.id);
  const order = (await getOrders()).find((o) => o.id === id);

  if (!order) {
    res.status(404).json({ error: "Commande introuvable" });
    return;
  }
  res.status(200).json(order);
});

app.post("/orders", async (req, res) => {
  if (!isValidOrderBody(req.body)) {
    res.status(400).json({ error: "userId, productId et quantity doivent être des entiers positifs" });
    return;
  }

  const { userId, productId, quantity } = req.body;

  const users = await getUsers();
  if (!users.some((u) => u.id === userId)) {
    res.status(404).json({ error: "Client introuvable" });
    return;
  }

  const products = await getProducts();
  const productIndex = products.findIndex((p) => p.id === productId);
  const product = products[productIndex];
  if (!product) {
    res.status(404).json({ error: "Produit introuvable" });
    return;
  }
  if (product.stock < quantity) {
    res.status(409).json({ error: "Stock insuffisant" });
    return;
  }

  const orders = await getOrders();
  const order: Order = {
    id: (orders.at(-1)?.id ?? 0) + 1,
    userId,
    productId,
    quantity,
    status: "preparing",
    createdAt: new Date().toISOString(),
  };

  await db.push(`/products[${productIndex}]/stock`, product.stock - quantity);
  await db.push("/orders[]", order);
  res.status(201).json(order);
});

app.patch("/orders/:id", async (req, res) => {
  const id = Number(req.params.id);
  const orders = await getOrders();
  const index = orders.findIndex((o) => o.id === id);
  const order = orders[index];

  if (!order) {
    res.status(404).json({ error: "Commande introuvable" });
    return;
  }

  const status = getStatus(req.body);
  if (!status) {
    res.status(400).json({ error: "status doit valoir shipped, delivered ou cancelled" });
    return;
  }

  if (status === "cancelled") {
    if (order.status !== "preparing") {
      res.status(409).json({ error: "Seule une commande en préparation peut être annulée" });
      return;
    }
    const products = await getProducts();
    const productIndex = products.findIndex((p) => p.id === order.productId);
    const product = products[productIndex];
    if (product) {
      await db.push(`/products[${productIndex}]/stock`, product.stock + order.quantity);
    }
  } else if (NEXT_STATUS[order.status] !== status) {
    res.status(409).json({ error: `Passage de ${order.status} à ${status} interdit` });
    return;
  }

  await db.push(`/orders[${index}]/status`, status);
  res.status(200).json({ ...order, status });
});

const PORT = Number(process.env.PORT) || 3000;
export const server = app.listen(PORT, () =>
  console.log(`http://localhost:${PORT}`));
