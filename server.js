 
const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*"); // ✅ Allow all origins
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }
    next();
});

app.use(bodyParser.json());

// PostgreSQL Connection
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT,
  ssl: { rejectUnauthorized: false },  // Enable SSL
});


// **1️⃣ GET Data by Module and Section**
app.get("/:module/:section", async (req, res) => {
    const { module, section } = req.params;
    const moduleUpperCase = module.toUpperCase(); // Convert module name to uppercase

    try {
        const result = await pool.query(
            `SELECT jsoncontent-> $1 AS section_data 
       FROM cfgadmindata 
       WHERE UPPER(module) = $2 AND jsoncontent ? $1`,
            [section, moduleUpperCase]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "No data found for this section" });
        }

        res.json(result.rows[0].section_data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



// **2️⃣ ADD New Entry**
app.post("/:module/:section", async (req, res) => {
    const { module, section } = req.params;
    let newEntry = req.body;

    newEntry.createdBy = "current_user"; // Modify as needed
    newEntry.createdOn = new Date().toISOString();

    try {
        // Retrieve existing jsoncontent for the module
        const existingData = await pool.query(
            "SELECT jsoncontent FROM cfgadmindata WHERE UPPER(module) = $1",
            [module.toUpperCase()]
        );

        if (existingData.rows.length === 0) {
            return res.status(404).json({ message: "Module not found" });
        }

        let jsonContent = existingData.rows[0].jsoncontent;

        // If section exists, append new entry; otherwise, create a new array
        if (jsonContent[section]) {
            jsonContent[section].push(newEntry);
        } else {
            jsonContent[section] = [newEntry];
        }

        // Update the JSON content in the existing row
        const result = await pool.query(
            `UPDATE cfgadmindata 
             SET jsoncontent = jsonb_set(jsoncontent, $1, $2::jsonb, true) 
             WHERE UPPER(module) = $3 
             RETURNING *`,
            [`{${section}}`, JSON.stringify(jsonContent[section]), module.toUpperCase()]
        );

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// **3️⃣ UPDATE an Entry**
app.put("/:module/:section/:id", async (req, res) => {
    const { module, section, id } = req.params;
    let updatedEntry = req.body.jsoncontent; // Extract jsoncontent from request

    updatedEntry.updatedBy = "current_user";
    updatedEntry.updatedOn = new Date().toISOString();

    try {
        // 🔹 Check if module exists in the database
        const existingData = await pool.query(
            "SELECT jsoncontent FROM cfgadmindata WHERE UPPER(module) = $1",
            [module.toUpperCase()]
        );

        if (existingData.rows.length === 0) {
            return res.status(404).json({ message: "Module not found in database" });
        }

        let jsonContent = existingData.rows[0].jsoncontent;

        // 🔹 Check if section exists
        if (!jsonContent[section]) {
            return res.status(404).json({ message: `Section '${section}' not found in module '${module}'` });
        }

        // 🔹 Find and update the specific entry in the section array
        let sectionData = jsonContent[section];
        let updated = false;

        sectionData = sectionData.map(item => {
            if (item.id && item.id.toString() === id) {
                updated = true;
                return { ...item, ...updatedEntry }; // Merge updates
            }
            return item;
        });

        if (!updated) {
            return res.status(404).json({ message: `ID '${id}' not found in section '${section}'` });
        }

        // 🔹 Update only the section inside jsoncontent
        const result = await pool.query(
            `UPDATE cfgadmindata 
             SET jsoncontent = jsonb_set(jsoncontent, $1, $2::jsonb, false) 
             WHERE UPPER(module) = $3 
             RETURNING *`,
            [`{${section}}`, JSON.stringify(sectionData), module.toUpperCase()]
        );

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



// **4️⃣ DELETE (Soft Delete) an Entry**
app.patch("/:module/:section/:id", async (req, res) => {
    const { module, section, id } = req.params;
    const { deletedBy } = req.body;

    try {
        // 🔹 Check if module exists
        const existingData = await pool.query(
            "SELECT jsoncontent FROM cfgadmindata WHERE UPPER(module) = $1",
            [module.toUpperCase()]
        );

        if (existingData.rows.length === 0) {
            return res.status(404).json({ message: `Module '${module}' not found` });
        }

        let jsonContent = existingData.rows[0].jsoncontent;

        // 🔹 Check if section exists
        if (!jsonContent[section]) {
            return res.status(404).json({ message: `Section '${section}' not found in module '${module}'` });
        }

        let sectionData = jsonContent[section];
        let updated = false;

        // 🔹 Find and update the specific entry by ID
        sectionData = sectionData.map(item => {
            if (item.id && item.id.toString() === id) {
                updated = true;
                return {
                    ...item,
                    deletedBy: deletedBy || "current_user",
                    deletedOn: new Date().toISOString()
                };
            }
            return item;
        });

        if (!updated) {
            return res.status(404).json({ message: `ID '${id}' not found in section '${section}'` });
        }

        // 🔹 Update the jsoncontent field in PostgreSQL
        const result = await pool.query(
            `UPDATE cfgadmindata 
             SET jsoncontent = jsonb_set(jsoncontent, $1, $2::jsonb, false) 
             WHERE UPPER(module) = $3 
             RETURNING *`,
            [`{${section}}`, JSON.stringify(sectionData), module.toUpperCase()]
        );

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// **5️⃣ DELETE (Hard Delete) an Entry**
app.delete("/:module/:section/:id", async (req, res) => {
    const { module, section, id } = req.params;

    try {
        await pool.query("DELETE FROM cfgadmindata WHERE id = $1 AND UPPER(module) = $2", [id, module.toUpperCase()]);
        res.json({ message: "Record deleted successfully." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// **Start the Server**
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
