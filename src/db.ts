import { JsonDB, Config } from "node-json-db";
import type { Order, Product, User } from "./types.ts";

export const db = new JsonDB(new Config("data/db", true, true, "/"));

export async function getUsers(): Promise<User[]> {
  return db.getObject<User[]>("/users");
}

export async function getProducts(): Promise<Product[]> {
  return db.getObject<Product[]>("/products");
}

export async function getOrders(): Promise<Order[]> {
  return db.getObject<Order[]>("/orders");
}
