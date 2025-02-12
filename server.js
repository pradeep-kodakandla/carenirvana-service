 
const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// PostgreSQL Connection
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT,
  ssl: { rejectUnauthorized: false },  // Enable SSL
});

// Get all JSON configurations
app.get("/configs", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM config");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get a specific JSON config by ID
app.get("/configs/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM config WHERE id = $1", [req.params.id]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update JSON data by ID
app.put("/configs/:id", async (req, res) => {
  try {
    const { data } = req.body;
    await pool.query("UPDATE config SET data = $1 WHERE id = $2", [data, req.params.id]);
    res.json({ message: "Config updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a JSON config by ID
app.delete("/configs/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM config WHERE id = $1", [req.params.id]);
    res.json({ message: "Config deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
