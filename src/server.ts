import express from "express";
import cors from "cors";
import type { Response } from "express";
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

type EventName = "order-created" | "order-status" | "order-cancelled" | "stock-updated";

const clients = new Map<Response, number | null>();
let eventId = 0;

function openStream(res: Response, orderId: number | null): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();
  clients.set(res, orderId);
  res.on("close", () => clients.delete(res));
}

function broadcast(event: EventName, data: unknown, orderId: number | null = null): void {
  const msg = `id: ${++eventId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [res, followed] of clients) {
    if (followed === null || followed === orderId) res.write(msg);
  }
}

app.get("/stream", (_req, res) => {
  openStream(res, null);
});

const DELIVERY_DELAY = 20_000;

function scheduleDelivery(orderId: number): void {
  setTimeout(async () => {
    const orders = await getOrders();
    const index = orders.findIndex((o) => o.id === orderId);
    const order = orders[index];
    if (!order || order.status !== "shipped") return;

    const deliveredOrder: Order = { ...order, status: "delivered" };
    await db.push(`/orders[${index}]/status`, "delivered");
    broadcast("order-status", deliveredOrder, orderId);
  }, DELIVERY_DELAY);
}

for (const order of await getOrders()) {
  if (order.status === "shipped") scheduleDelivery(order.id);
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

  const updatedProduct = { ...product, stock: product.stock - quantity };
  await db.push(`/products[${productIndex}]/stock`, updatedProduct.stock);
  await db.push("/orders[]", order);
  broadcast("order-created", order, order.id);
  broadcast("stock-updated", updatedProduct);
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
      const updatedProduct = { ...product, stock: product.stock + order.quantity };
      await db.push(`/products[${productIndex}]/stock`, updatedProduct.stock);
      broadcast("stock-updated", updatedProduct);
    }
  } else if (NEXT_STATUS[order.status] !== status) {
    res.status(409).json({ error: `Passage de ${order.status} à ${status} interdit` });
    return;
  }

  const updatedOrder: Order = { ...order, status };
  await db.push(`/orders[${index}]/status`, status);
  broadcast(status === "cancelled" ? "order-cancelled" : "order-status", updatedOrder, updatedOrder.id);
  if (status === "shipped") scheduleDelivery(updatedOrder.id);
  res.status(200).json(updatedOrder);
});

const PORT = Number(process.env.PORT) || 3000;
export const server = app.listen(PORT, () =>
  console.log(`http://localhost:${PORT}`));
