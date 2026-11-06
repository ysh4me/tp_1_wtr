import express from "express";
import cors from "cors";
import { getProducts, getUsers } from "./db.ts";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.get("/users", async (_req, res) => {
  res.status(200).json(await getUsers());
});

app.get("/products", async (_req, res) => {
  res.status(200).json(await getProducts());
});

const PORT = Number(process.env.PORT) || 3000;
export const server = app.listen(PORT, () =>
  console.log(`http://localhost:${PORT}`));
